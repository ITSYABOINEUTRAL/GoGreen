/**
 * migrationRunner.js
 *
 * Shared migration logic used by both:
 *   - src/db/schema.js (auto-run on app startup)
 *   - migrate.js (CLI tool)
 *
 * Expects a db adapter with:
 *   db.query(sql, params?) → Promise<{ rows }>
 *   db.exec(sql)           → Promise<void>
 *   db.isPostgres          → boolean
 *   db.placeholder(i)      → '$i' | '?'
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

/**
 * Build a database adapter for the given dialect.
 *
 * For SQLite, an optional `dbPath` (or an injected better-sqlite3 `Database`
 * instance) may be supplied so callers — including tests — can use an
 * in-memory database instead of the default on-disk `market.db`.
 *
 * The SQLite adapter routes statements that begin with `SELECT` or `WITH`
 * (ignoring leading whitespace) through `prepare(...).all(...)` and returns
 * `{ rows }`; all other statements go through `.run(...)` and return
 * `{ rows: [], rowCount: info.changes }`.
 */
function getAdapter(dialect, dbPathOrInstance) {
  if (dialect === 'postgres') {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return {
      isPostgres: true,
      placeholder: (i) => `$${i}`,
      query: (sql, params = []) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
    };
  }

  // An unknown dialect (e.g. a typo such as 'postgresql') must not silently open market.db.
  if (dialect !== 'sqlite') {
    throw new Error(`Unsupported dialect: ${dialect}`);
  }

  const Database = require('better-sqlite3');
  const db =
    dbPathOrInstance && typeof dbPathOrInstance.prepare === 'function'
      ? dbPathOrInstance
      : new Database(dbPathOrInstance || path.join(__dirname, 'market.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return {
    isPostgres: false,
    placeholder: () => '?',
    query: (sql, params = []) => {
      if (/^\s*(SELECT|WITH)/i.test(sql)) {
        return { rows: db.prepare(sql).all(...params) };
      }
      const info = db.prepare(sql).run(...params);
      return { rows: [], rowCount: info.changes };
    },
    exec: (sql) => {
      db.exec(sql);
    },
    close: () => db.close(),
  };
}

async function ensureMigrationsTable(db) {
  if (db.isPostgres) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
}

async function getApplied(db) {
  const { rows } = await db.query('SELECT name FROM migrations ORDER BY name ASC');
  return new Set(rows.map((r) => r.name));
}


function assertUniqueMigrationIdentities(files) {
  const seen = new Set();
  for (const f of files) {
    if (seen.has(f)) {
      throw new Error(`Duplicate migration identity: ${f}`);
    }
    seen.add(f);
  }
  return files;
}

function getPendingFiles(applied, migrationsDir = MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) return [];
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.+\.sql$/.test(f) && !f.endsWith('.undo.sql'))
    .sort()
    .filter((f) => !applied.has(f));
  return assertUniqueMigrationIdentities(files);
}

/**
 * Resolve the undo file to use for a given applied migration.
 *
 * Prefers a dialect-specific undo file (`NNN_description.undo.postgres` or
 * `NNN_description.undo.sqlite`) and falls back to the generic
 * `NNN_description.undo.sql`. Returns the absolute path when a file exists,
 * or null when no undo file is present.
 */
function resolveUndoPath(migrationsDir, lastMigration, dialect) {
  const base = lastMigration.replace(/\.sql$/, '');
  const dialectFile = path.join(migrationsDir, `${base}.undo.${dialect}`);
  if (fs.existsSync(dialectFile)) return dialectFile;
  const genericFile = path.join(migrationsDir, `${base}.undo.sql`);
  if (fs.existsSync(genericFile)) return genericFile;
  return null;
}

async function runMigrations(db, migrationsDir = MIGRATIONS_DIR) {
  await ensureMigrationsTable(db);
  const applied = await getApplied(db);
  const pending = getPendingFiles(applied, migrationsDir);

  for (const file of pending) {
    const dialect = db.isPostgres ? 'postgres' : 'sqlite';
    const dialectFile = path.join(migrationsDir, `${file.slice(0, -4)}.${dialect}`);
    const sqlFile = fs.existsSync(dialectFile) ? dialectFile : path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlFile, 'utf8');
    await db.exec(sql);
    if (file === '034_reviews_schema.sql') {
      await ensureReviewSchema(db);
    }
    const p = db.placeholder ? db.placeholder(1) : '$1';
    await db.query(`INSERT INTO migrations (name) VALUES (${p})`, [file]);
    logger.info(`[migrate] Applied ${file}`);
  }

  if (pending.length > 0) {
    logger.info(`[migrate] ${pending.length} migration(s) applied.`);
  }
}

async function ensureReviewSchema(db) {
  const columnsFor = async (table) => {
    const sql = db.isPostgres
      ? 'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1'
      : `SELECT name FROM pragma_table_info('${table}')`;
    const { rows } = await db.query(sql, db.isPostgres ? [table] : []);
    return new Set(rows.map(({ name }) => name));
  };

  const productColumns = await columnsFor('products');
  const reviewColumns = await columnsFor('reviews');

  const additions = [
    ['products', productColumns, 'avg_rating', 'REAL DEFAULT 0'],
    ['products', productColumns, 'review_count', 'INTEGER DEFAULT 0'],
    ['reviews', reviewColumns, 'order_id', 'INTEGER REFERENCES orders(id) ON DELETE CASCADE'],
    ['reviews', reviewColumns, 'comment', 'TEXT'],
    [
      'reviews',
      reviewColumns,
      'status',
      "TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected'))",
    ],
  ];

  for (const [table, columns, name, definition] of additions) {
    if (!columns.has(name)) {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }

  if (reviewColumns.has('body') && !reviewColumns.has('comment')) {
    await db.query('UPDATE reviews SET comment = body WHERE comment IS NULL AND body IS NOT NULL');
  }

  await db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id) WHERE order_id IS NOT NULL'
  );
}

module.exports = { assertUniqueMigrationIdentities, 
  getAdapter,
  runMigrations,
  ensureMigrationsTable,
  getApplied,
  getPendingFiles,
  ensureReviewSchema,
  resolveUndoPath,
};
