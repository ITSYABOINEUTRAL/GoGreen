/**
 * db-sqlite-query.test.js
 * Tests for the SQLite query path's placeholder rewriting and SELECT/WITH detection.
 * Uses the exported rewritePlaceholders and isReadQuery helpers from db/schema.js.
 *
 * The global jest.setup.js mocks db/schema for all other tests, so we explicitly
 * unmock it here and load the real implementation against an in-memory SQLite stub.
 */

'use strict';

// Unmock the schema so this test loads the real implementation.
jest.unmock('../db/schema');

jest.mock('better-sqlite3', () => jest.fn(() => ({
  prepare: jest.fn(() => ({
    all: jest.fn(() => []),
    get: jest.fn(() => null),
    run: jest.fn(() => ({ changes: 0 })),
  })),
  exec: jest.fn(),
})));
jest.mock('../db/migrationRunner', () => ({ runMigrations: jest.fn(() => Promise.resolve()) }));
jest.mock('../logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

// Make sure we load the SQLite branch.
delete process.env.DATABASE_URL;

// Use requireActual to bypass any residual module-level mock.
const schema = jest.requireActual('../db/schema');
const { rewritePlaceholders, isReadQuery } = schema;

describe('SQLite placeholder rewriting and read/write classification', () => {
  describe('rewritePlaceholders', () => {
    test('rewrites a single $1 placeholder to ?', () => {
      expect(rewritePlaceholders('SELECT * FROM users WHERE id = $1')).toBe(
        'SELECT * FROM users WHERE id = ?'
      );
    });

    test('rewrites $1 and $2 placeholders in order', () => {
      expect(rewritePlaceholders('UPDATE users SET name = $1 WHERE id = $2')).toBe(
        'UPDATE users SET name = ? WHERE id = ?'
      );
    });

    test('leaves a query without placeholders unchanged', () => {
      expect(rewritePlaceholders('SELECT 1')).toBe('SELECT 1');
    });
  });

  describe('isReadQuery', () => {
    test('classifies a SELECT query as a read', () => {
      expect(isReadQuery('SELECT * FROM products')).toBe(true);
    });

    test('classifies a SELECT with leading whitespace as a read', () => {
      expect(isReadQuery('   SELECT id FROM orders')).toBe(true);
    });

    test('classifies a SELECT with leading newline as a read', () => {
      expect(isReadQuery('\n  SELECT 1')).toBe(true);
    });

    test('classifies a WITH (CTE) query as a read', () => {
      expect(isReadQuery('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(true);
    });

    test('classifies a WITH query with leading whitespace as a read', () => {
      expect(isReadQuery('  WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(true);
    });

    test('classifies INSERT as a write', () => {
      expect(isReadQuery('INSERT INTO users (name) VALUES (?)')).toBe(false);
    });

    test('classifies UPDATE as a write', () => {
      expect(isReadQuery('UPDATE users SET active = ? WHERE id = ?')).toBe(false);
    });

    test('classifies DELETE as a write', () => {
      expect(isReadQuery('DELETE FROM sessions WHERE id = ?')).toBe(false);
    });
  });
});
