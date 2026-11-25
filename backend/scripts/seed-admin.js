/**
 * Creates an admin user from environment variables.
 * Usage: node backend/scripts/seed-admin.js
 * Env vars: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
 * Optional: ADMIN_DB_PATH overrides the default SQLite database path.
 * Supports both SQLite (default) and PostgreSQL (when DATABASE_URL is set).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');

async function run(env = process.env, SqliteDatabase) {
  const name = env.ADMIN_NAME || 'Admin';
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;
  const missingVariables = [
    !email && 'ADMIN_EMAIL',
    !password && 'ADMIN_PASSWORD',
  ].filter(Boolean);

  if (missingVariables.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missingVariables.join(', ')}`);
  }

  const hashed = bcrypt.hashSync(password, 12);

  if (env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows[0]) {
      await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
      console.log(`[seed-admin] Promoted existing user "${email}" to admin.`);
    } else {
      await pool.query(
        "INSERT INTO users (name, email, password, role, active) VALUES ($1,$2,$3,'admin',1)",
        [name, email, hashed]
      );
      console.log(`[seed-admin] Admin user created: ${email}`);
    }
    await pool.end();
  } else {
    const Database = SqliteDatabase || require('better-sqlite3');
    const path = require('path');
    const db = new Database(env.ADMIN_DB_PATH || path.join(__dirname, '../market.db'));
    try {
      db.exec('ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1');
    } catch (error) {
      if (!/duplicate column/i.test(error.message)) throw error;
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
      console.log(`[seed-admin] Promoted existing user "${email}" to admin.`);
    } else {
      db.prepare(
        "INSERT INTO users (name, email, password, role, active) VALUES (?, ?, ?, 'admin', 1)"
      ).run(name, email, hashed);
      console.log(`[seed-admin] Admin user created: ${email}`);
    }
  }
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`[seed-admin] ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { run };
