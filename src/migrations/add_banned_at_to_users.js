const NAME = "add_banned_at_to_users";
const assertUsersTable = async (knex) => {
  if (!(await knex.schema.hasTable("users"))) {
    throw new Error(`users table is required before running ${NAME}`);
  }
};

exports.up = async (knex) => {
  await assertUsersTable(knex);
  await knex.schema.table("users", (t) => {
    t.timestamp("banned_at").nullable().defaultTo(null);
    t.string("ban_reason").nullable();
  });
};
exports.down = async (knex) => {
  await assertUsersTable(knex);
  await knex.schema.table("users", (t) => {
    t.dropColumn("banned_at");
    t.dropColumn("ban_reason");
  });
};
