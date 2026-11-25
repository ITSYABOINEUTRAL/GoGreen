'use strict';

const Database = require('better-sqlite3');
const emailVerified = require('../migrations/add_email_verified_at');
const bannedAt = require('../migrations/add_banned_at_to_users');

// knex is not a backend dependency, so this shim provides the two schema calls the
// migrations use (hasTable and table) on top of an in-memory better-sqlite3 database.
function createKnexShim(sqlite) {
  const schema = {
    hasTable: async (name) =>
      Boolean(
        sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
      ),
    table: async (name, build) => {
      const statements = [];
      const column = { nullable: () => column, defaultTo: () => column };
      build({
        timestamp: (col) => {
          statements.push(`ADD COLUMN ${col} DATETIME`);
          return column;
        },
        string: (col) => {
          statements.push(`ADD COLUMN ${col} TEXT`);
          return column;
        },
        dropColumn: (col) => {
          statements.push(`DROP COLUMN ${col}`);
          return column;
        },
      });
      for (const statement of statements) {
        sqlite.exec(`ALTER TABLE ${name} ${statement}`);
      }
    },
  };
  return { schema };
}

const columnsOf = (sqlite, table) =>
  sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);

describe('knex-style users migrations', () => {
  let sqlite;
  let knex;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    knex = createKnexShim(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('add_email_verified_at', () => {
    const message = 'users table is required before running add_email_verified_at';

    it('throws a descriptive error on up when users does not exist', async () => {
      await expect(emailVerified.up(knex)).rejects.toThrow(message);
    });

    it('throws a descriptive error on down when users does not exist', async () => {
      await expect(emailVerified.down(knex)).rejects.toThrow(message);
    });

    it('adds the verification columns on up and removes them on down', async () => {
      sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');

      await emailVerified.up(knex);
      expect(columnsOf(sqlite, 'users')).toEqual(
        expect.arrayContaining([
          'email_verified_at',
          'email_verification_token',
          'email_verification_expires_at',
        ])
      );

      await emailVerified.down(knex);
      expect(columnsOf(sqlite, 'users')).toEqual(['id']);
    });
  });

  describe('add_banned_at_to_users', () => {
    const message = 'users table is required before running add_banned_at_to_users';

    it('throws a descriptive error on up when users does not exist', async () => {
      await expect(bannedAt.up(knex)).rejects.toThrow(message);
    });

    it('throws a descriptive error on down when users does not exist', async () => {
      await expect(bannedAt.down(knex)).rejects.toThrow(message);
    });

    it('adds banned_at and ban_reason on up and removes them on down', async () => {
      sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');

      await bannedAt.up(knex);
      expect(columnsOf(sqlite, 'users')).toEqual(
        expect.arrayContaining(['banned_at', 'ban_reason'])
      );

      await bannedAt.down(knex);
      expect(columnsOf(sqlite, 'users')).toEqual(['id']);
    });
  });
});
