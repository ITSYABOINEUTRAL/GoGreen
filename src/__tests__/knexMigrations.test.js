// Regression: knex-style migrations must fail loudly when the users table is
// missing, instead of surfacing an opaque knex error. GHissue #234.
const emailVerified = require('../migrations/add_email_verified_at');
const bannedAt = require('../migrations/add_banned_at_to_users');

// Minimal knex-like shim: schema.hasTable + schema.table collecting column ops.
function makeKnex({ usersTable = true } = {}) {
  const applied = [];
  return {
    applied,
    schema: {
      hasTable: async (name) => name === 'users' ? usersTable : false,
      table: async (name, cb) => {
        if (name !== 'users') throw new Error(`unexpected table ${name}`);
        const ops = [];
        const col = () => ({ nullable() { return this; }, defaultTo() { return this; } });
        cb({
          timestamp: (...a) => { ops.push(a); return col(); },
          string: (...a) => { ops.push(a); return col(); },
          dropColumn: (...a) => { ops.push(a); return col(); },
        });
        applied.push(ops.map((a) => a[0]));
      },
    },
  };
}

describe('knex-style migrations guard a missing users table', () => {
  const cases = [
    ['add_email_verified_at', emailVerified, ['email_verified_at', 'email_verification_token', 'email_verification_expires_at']],
    ['add_banned_at_to_users', bannedAt, ['banned_at', 'ban_reason']],
  ];
  for (const [name, mod, columns] of cases) {
    it(`${name}: up/down add and drop expected columns`, async () => {
      const knex = makeKnex();
      await mod.up(knex);
      expect(knex.applied[0]).toEqual(columns);
      await mod.down(knex);
      expect(knex.applied[1]).toEqual(columns);
    });
    it(`${name}: up throws a descriptive error when users is missing`, async () => {
      const knex = makeKnex({ usersTable: false });
      await expect(mod.up(knex)).rejects.toThrow(new RegExp(`users table is required.*${name}`));
    });
    it(`${name}: down throws a descriptive error when users is missing`, async () => {
      const knex = makeKnex({ usersTable: false });
      await expect(mod.down(knex)).rejects.toThrow(new RegExp(`users table is required.*${name}`));
    });
  }
});
