const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations, getPendingFiles } = require('../db/migrationRunner');
const { resolveUndoPath, getAdapter } = require('../../migrate');

describe('migration runner failure recovery', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
  const sqlite = new Database(':memory:');
  const db = {
    isPostgres: false,
    placeholder: () => '?',
    exec: async (sql) => sqlite.exec(sql),
    query: async (sql, params = []) => {
      if (/^SELECT/i.test(sql)) return { rows: sqlite.prepare(sql).all(...params) };
      sqlite.prepare(sql).run(...params);
      return { rows: [] };
    },
  };

  afterAll(() => {
    sqlite.close();
    fs.rmSync(dir, { recursive: true });
  });

  it('leaves the failed file pending and resumes after it is fixed', async () => {
    fs.writeFileSync(path.join(dir, '001_first.sql'), 'CREATE TABLE first (id INTEGER);');
    fs.writeFileSync(path.join(dir, '002_broken.sql'), 'BROKEN SQL;');
    fs.writeFileSync(path.join(dir, '003_last.sql'), 'CREATE TABLE last (id INTEGER);');

    await expect(runMigrations(db, dir)).rejects.toThrow();
    const afterFailure = await db.query('SELECT name FROM migrations ORDER BY name');
    expect(afterFailure.rows).toEqual([{ name: '001_first.sql' }]);

    fs.writeFileSync(path.join(dir, '002_broken.sql'), 'CREATE TABLE second (id INTEGER);');
    await runMigrations(db, dir);
    const applied = await db.query('SELECT name FROM migrations ORDER BY name');
    expect(applied.rows.map(({ name }) => name)).toEqual([
      '001_first.sql', '002_broken.sql', '003_last.sql',
    ]);
  });

  it('uses a SQLite-specific migration when one is present', async () => {
    fs.writeFileSync(path.join(dir, '004_dialect.sql'), 'CREATE TABLE wrong_dialect (id INTEGER);');
    fs.writeFileSync(path.join(dir, '004_dialect.sqlite'), 'CREATE TABLE sqlite_dialect (id INTEGER);');

    await runMigrations(db, dir);

    expect(sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_dialect'"
    ).get()).toEqual({ name: 'sqlite_dialect' });
    expect(sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'wrong_dialect'"
    ).get()).toBeUndefined();
  });

  it('orders migrations with a shared numeric prefix by full filename', () => {
    const duplicatePrefixDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-prefix-migrations-'));
    try {
      fs.writeFileSync(path.join(duplicatePrefixDir, '002_zeta.sql'), '');
      fs.writeFileSync(path.join(duplicatePrefixDir, '002_alpha.sql'), '');

      expect(getPendingFiles(new Set(), duplicatePrefixDir)).toEqual([
        '002_alpha.sql',
        '002_zeta.sql',
      ]);
    } finally {
      fs.rmSync(duplicatePrefixDir, { recursive: true });
    }
  });
});

describe('migrate.js rollback undo-file selection', () => {
  let undoDir;

  beforeEach(() => {
    undoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'undo-migrations-'));
  });

  afterEach(() => {
    fs.rmSync(undoDir, { recursive: true });
  });

  it('prefers the dialect-specific undo file when it exists', () => {
    fs.writeFileSync(path.join(undoDir, '034_coupons.undo.postgres'), 'DROP TABLE coupons;');
    fs.writeFileSync(path.join(undoDir, '034_coupons.undo.sqlite'), 'DROP TABLE coupons;');
    fs.writeFileSync(path.join(undoDir, '034_coupons.undo.sql'), 'DROP TABLE coupons;');

    expect(resolveUndoPath(undoDir, '034_coupons.sql', 'postgres'))
      .toBe(path.join(undoDir, '034_coupons.undo.postgres'));
    expect(resolveUndoPath(undoDir, '034_coupons.sql', 'sqlite'))
      .toBe(path.join(undoDir, '034_coupons.undo.sqlite'));
  });

  it('falls back to the generic undo file when no dialect-specific file exists', () => {
    fs.writeFileSync(path.join(undoDir, '034_coupons.undo.sql'), 'DROP TABLE coupons;');

    expect(resolveUndoPath(undoDir, '034_coupons.sql', 'postgres'))
      .toBe(path.join(undoDir, '034_coupons.undo.sql'));
  });

  it('exits with code 1 and logs when no undo file exists', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(() => resolveUndoPath(undoDir, '034_coupons.sql', 'postgres'))
        .toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('No rollback file found')
      );
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('migrate.js SQLite adapter SELECT/WITH detection', () => {
  let sqlite;
  let adapter;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);');
    sqlite.prepare('INSERT INTO items (name) VALUES (?)').run('alpha');
    adapter = getAdapter({ isPostgres: false, database: sqlite });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('routes a SELECT query to the read path and returns rows', async () => {
    const result = await adapter.query('SELECT id, name FROM items');
    expect(result.rows).toEqual([{ id: 1, name: 'alpha' }]);
  });

  it('routes a WITH query to the read path and returns rows', async () => {
    const result = await adapter.query(
      'WITH selected AS (SELECT id, name FROM items) SELECT * FROM selected'
    );
    expect(result.rows).toEqual([{ id: 1, name: 'alpha' }]);
  });

  it('routes a SELECT prefixed by whitespace/newline to the read path', async () => {
    const result = await adapter.query('\n  SELECT id, name FROM items');
    expect(result.rows).toEqual([{ id: 1, name: 'alpha' }]);
  });

  it('routes an INSERT to the write path and returns rowCount with empty rows', async () => {
    const result = await adapter.query('INSERT INTO items (name) VALUES (?)', ['beta']);
    expect(result).toEqual({ rows: [], rowCount: 1 });
  });

  it('routes an UPDATE to the write path and returns rowCount with empty rows', async () => {
    const result = await adapter.query('UPDATE items SET name = ? WHERE id = ?', ['gamma', 1]);
    expect(result).toEqual({ rows: [], rowCount: 1 });
  });

  it('routes a DELETE to the write path and returns rowCount with empty rows', async () => {
    const result = await adapter.query('DELETE FROM items WHERE id = ?', [1]);
    expect(result).toEqual({ rows: [], rowCount: 1 });
  });
});

describe('migration identity uniqueness', () => {
  const { assertUniqueMigrationIdentities, getPendingFiles, runMigrations } = require('../db/migrationRunner');

  it('applies two same-prefix different-description migrations', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-prefix-'));
    const sqlite = new Database(':memory:');
    const db = {
      isPostgres: false,
      placeholder: () => '?',
      exec: async (sql) => sqlite.exec(sql),
      query: async (sql, params = []) => {
        if (/^SELECT/i.test(sql)) return { rows: sqlite.prepare(sql).all(...params) };
        sqlite.prepare(sql).run(...params);
        return { rows: [] };
      },
    };
    try {
      fs.writeFileSync(path.join(dir, '003_a.sql'), 'CREATE TABLE a (id INTEGER);');
      fs.writeFileSync(path.join(dir, '003_a.undo.sql'), 'DROP TABLE a;');
      fs.writeFileSync(path.join(dir, '003_b.sql'), 'CREATE TABLE b (id INTEGER);');
      fs.writeFileSync(path.join(dir, '003_b.undo.sql'), 'DROP TABLE b;');
      await runMigrations(db, dir);
      const applied = await db.query('SELECT name FROM migrations ORDER BY name');
      expect(applied.rows.map((r) => r.name)).toEqual(['003_a.sql', '003_b.sql']);
    } finally {
      sqlite.close();
      fs.rmSync(dir, { recursive: true });
    }
  });

  it('rejects a duplicated full migration identity', () => {
    expect(() => assertUniqueMigrationIdentities(['001_a.sql', '001_a.sql'])).toThrow(
      /Duplicate migration identity/,
    );
  });
});

describe('migrationRunner pending and undo selection', () => {
  const runner = require('../db/migrationRunner');
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-selection-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('getPendingFiles excludes undo files and files already applied', () => {
    for (const file of ['001_a.sql', '001_a.undo.sql', '002_b.sql', '002_b.undo.sql', '003_c.sql']) {
      fs.writeFileSync(path.join(dir, file), '');
    }

    expect(getPendingFiles(new Set(['001_a.sql']), dir)).toEqual(['002_b.sql', '003_c.sql']);
  });

  it('resolveUndoPath prefers the postgres undo file over the generic one', () => {
    fs.writeFileSync(path.join(dir, '001_a.undo.postgres'), 'DROP TABLE a;');
    fs.writeFileSync(path.join(dir, '001_a.undo.sql'), 'DROP TABLE a;');

    expect(runner.resolveUndoPath(dir, '001_a.sql', 'postgres')).toBe(
      path.join(dir, '001_a.undo.postgres')
    );
  });

  it('resolveUndoPath returns null when neither undo file exists', () => {
    expect(runner.resolveUndoPath(dir, '001_a.sql', 'postgres')).toBeNull();
    expect(runner.resolveUndoPath(dir, '001_a.sql', 'sqlite')).toBeNull();
  });
});
