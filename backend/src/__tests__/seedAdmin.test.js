const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../scripts/seed-admin');

const scriptPath = path.join(__dirname, '../../scripts/seed-admin.js');

describe('seed-admin script', () => {
  let tempDir;
  let dbPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-admin-'));
    dbPath = path.join(tempDir, 'market.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function runScript(extraEnv = {}) {
    const env = { ...process.env };
    delete env.ADMIN_EMAIL;
    delete env.ADMIN_PASSWORD;
    delete env.ADMIN_NAME;
    delete env.DATABASE_URL;

    return spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...env, ADMIN_DB_PATH: dbPath, ...extraEnv },
    });
  }

  function createDatabase(existingUsers = [], activeColumnExists = false, schemaError) {
    const users = [...existingUsers];
    class MockDatabase {
      exec() {
        if (schemaError) throw new Error(schemaError);
        if (activeColumnExists) throw new Error('duplicate column name: active');
        activeColumnExists = true;
      }

      prepare(query) {
        if (query.startsWith('SELECT id FROM users')) {
          return { get: (email) => users.find((user) => user.email === email) };
        }
        if (query.startsWith('UPDATE users')) {
          return {
            run: (email) => {
              const user = users.find((entry) => entry.email === email);
              if (user) user.role = 'admin';
            },
          };
        }
        return {
          run: (name, email, password) => {
            users.push({ id: users.length + 1, name, email, password, role: 'admin' });
          },
        };
      }
    }

    return { Database: MockDatabase, users };
  }

  it('fails before creating a database when required credentials are missing', () => {
    const result = runScript();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ADMIN_EMAIL');
    expect(result.stderr).toContain('ADMIN_PASSWORD');
    expect(fs.existsSync(dbPath)).toBe(false);
  });

  it('creates an admin when credentials are provided', async () => {
    const { Database, users } = createDatabase();
    await run({
      ADMIN_NAME: 'Setup Admin',
      ADMIN_EMAIL: 'setup@example.com',
      ADMIN_PASSWORD: 'secure-test-password',
      ADMIN_DB_PATH: dbPath,
    }, Database);

    expect(users[0]).toMatchObject({
      name: 'Setup Admin',
      email: 'setup@example.com',
      role: 'admin',
    });
    expect(users[0].password).not.toBe('secure-test-password');
  });

  it('promotes an existing user and ignores only duplicate-column schema errors', async () => {
    const existingUser = {
      id: 1,
      name: 'Existing User',
      email: 'existing@example.com',
      password: 'existing-hash',
      role: 'consumer',
    };
    const { Database, users } = createDatabase([existingUser], true);
    await run({
      ADMIN_EMAIL: 'existing@example.com',
      ADMIN_PASSWORD: 'secure-test-password',
    }, Database);

    expect(users).toEqual([{ ...existingUser, role: 'admin' }]);
  });

  it('fails on schema errors other than a duplicate active column', async () => {
    const { Database } = createDatabase([], false, 'no such table: users');

    await expect(run({
      ADMIN_EMAIL: 'setup@example.com',
      ADMIN_PASSWORD: 'secure-test-password',
    }, Database)).rejects.toThrow('no such table: users');
  });
});
