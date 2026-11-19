exports.up = async (knex) => {
  if (!(await knex.schema.hasTable("users"))) {
    throw new Error("users table is required before running add_banned_at_to_users");
  }
  await knex.schema.table("users", (t) => {
    t.timestamp("banned_at").nullable().defaultTo(null);
    t.string("ban_reason").nullable();
  });
};
exports.down = async (knex) => {
  if (!(await knex.schema.hasTable("users"))) {
    throw new Error("users table is required before running add_banned_at_to_users");
  }
  await knex.schema.table("users", (t) => {
    t.dropColumn("banned_at");
    t.dropColumn("ban_reason");
  });
};
