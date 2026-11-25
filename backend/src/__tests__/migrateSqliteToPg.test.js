const path = require('path');

const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
const mockEnd = jest.fn().mockResolvedValue(undefined);

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockQuery, end: mockEnd })),
}));

const mockAll = jest.fn();
const mockClose = jest.fn();

jest.mock('better-sqlite3', () =>
  jest.fn().mockImplementation(() => ({
    prepare: jest.fn().mockReturnValue({ all: mockAll }),
    close: mockClose,
  }))
);

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'migrate-sqlite-to-pg.js');

function loadScript() {
  let script;
  jest.isolateModules(() => {
    script = require(SCRIPT_PATH);
  });
  return script;
}

function isMutating(sql) {
  return /\b(INSERT|UPDATE|DELETE|setval)\b/i.test(sql);
}

describe('migrate-sqlite-to-pg', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    mockQuery.mockClear();
    mockAll.mockReset();
    mockAll.mockReturnValue([
      { id: 1, email: 'a@example.com', password_hash: 'x', created_at: '2024-01-01T00:00:00Z' },
      { id: 2, email: 'b@example.com', password_hash: 'y', created_at: '2024-01-02T00:00:00Z' },
    ]);
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('performs no mutating queries in --dry-run mode', async () => {
    process.argv = ['node', SCRIPT_PATH, '--dry-run'];
    const { run } = loadScript();

    await run();

    const mutating = mockQuery.mock.calls.filter(([sql]) => isMutating(sql));
    expect(mutating).toHaveLength(0);
  });

  it('issues at least one INSERT per non-empty table without the flag', async () => {
    process.argv = ['node', SCRIPT_PATH];
    const { run } = loadScript();

    await run();

    const inserts = mockQuery.mock.calls.filter(([sql]) => /\bINSERT\b/i.test(sql));
    expect(inserts.length).toBeGreaterThanOrEqual(2);
  });
});
