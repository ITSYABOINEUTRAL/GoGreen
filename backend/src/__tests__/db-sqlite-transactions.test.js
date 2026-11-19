'use strict';

// Force the SQLite branch of db/schema.js and keep it away from the on-disk market.db.
process.env.DATABASE_URL = '';

jest.mock('better-sqlite3', () => {
  const Real = jest.requireActual('better-sqlite3');
  return jest.fn(() => new Real(':memory:'));
});
jest.mock('../db/migrationRunner', () => ({
  runMigrations: jest.fn().mockResolvedValue(undefined),
}));

const db = require('../db/schema');

describe('SQLite withTransaction queue', () => {
  beforeAll(async () => {
    await db.ready;
    await db.exec('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT)');
  });

  it('runs a queued transaction after an earlier one throws, and rejects the first with its own error', async () => {
    const boom = new Error('boom');
    const first = db.withTransaction(async () => {
      await db.query("INSERT INTO items (name) VALUES ('rolled-back')");
      throw boom;
    });
    const second = db.withTransaction(() => db.query('SELECT 1 AS n'));

    await expect(first).rejects.toBe(boom);
    await expect(second).resolves.toEqual({ rows: [{ n: 1 }], rowCount: 1 });
  });

  it('releases a query that is waiting on a transaction when that transaction throws', async () => {
    const boom = new Error('boom again');
    let markStarted;
    const started = new Promise((resolve) => {
      markStarted = resolve;
    });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    const first = db.withTransaction(async () => {
      markStarted();
      await gate;
      throw boom;
    });
    await started;

    const waiting = db.query('SELECT 1 AS n');
    release();

    await expect(first).rejects.toBe(boom);
    await expect(waiting).resolves.toEqual({ rows: [{ n: 1 }], rowCount: 1 });
  });

  it('does not wedge later transactions after a rejected one', async () => {
    await expect(
      db.withTransaction(async () => {
        throw new Error('nope');
      })
    ).rejects.toThrow('nope');

    await expect(db.withTransaction(async () => 'ok')).resolves.toBe('ok');
  }, 2000);
});
