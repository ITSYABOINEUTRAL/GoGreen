#!/usr/bin/env node
/**
 * One-shot SQLite -> PostgreSQL data migration.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate-sqlite-to-pg.js [--dry-run]
 *
 * --dry-run is safe to run against production: it only reads from SQLite and
 * prints row counts / conversion warnings. It never writes to PostgreSQL.
 */

const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'app.db');
const BATCH_SIZE = 500;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const warnings = [];

function warn(message) {
  warnings.push(message);
  console.warn(`[warn] ${message}`);
}

function toIso(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    warn(`Unparseable date value: ${value}`);
    return null;
  }
  return date.toISOString();
}

function toJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    warn(`Unparseable JSON value: ${value}`);
    return null;
  }
}

const TABLES = [
  {
    name: 'users',
    columns: ['id', 'email', 'password_hash', 'created_at'],
    convert: (row) => ({ ...row, created_at: toIso(row.created_at) }),
  },
  {
    name: 'projects',
    columns: ['id', 'user_id', 'name', 'settings', 'created_at'],
    convert: (row) => ({
      ...row,
      settings: toJson(row.settings),
      created_at: toIso(row.created_at),
    }),
  },
];

async function migrateTable(db, table) {
  const rows = db.prepare(`SELECT ${table.columns.join(', ')} FROM ${table.name}`).all();
  console.log(`${table.name}: ${rows.length} row(s)`);

  if (DRY_RUN) return rows.length;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map(table.convert);
    const placeholders = batch
      .map(
        (_, rowIndex) =>
          `(${table.columns.map((__, colIndex) => `$${rowIndex * table.columns.length + colIndex + 1}`).join(', ')})`
      )
      .join(', ');
    const values = batch.flatMap((row) => table.columns.map((col) => row[col]));
    const sql = `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES ${placeholders}`;
    await pool.query(sql, values);
  }

  return rows.length;
}

async function resetSequences() {
  for (const table of TABLES) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence('${table.name}', 'id'), COALESCE((SELECT MAX(id) FROM ${table.name}), 1))`
    );
  }
}

async function run() {
  const db = new Database(SQLITE_PATH, { readonly: true });
  try {
    for (const table of TABLES) {
      await migrateTable(db, table);
    }

    if (!DRY_RUN) {
      await resetSequences();
    }

    if (warnings.length > 0) {
      console.log(`${warnings.length} conversion warning(s)`);
    }
    console.log(DRY_RUN ? 'Dry run complete (no writes performed).' : 'Migration complete.');
  } finally {
    db.close();
  }
}

if (require.main === module) {
  run()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { run, migrateTable, resetSequences, TABLES, DRY_RUN };
