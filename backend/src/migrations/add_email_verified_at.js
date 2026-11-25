exports.up = async (knex) => {
  if (!(await knex.schema.hasTable("users"))) {
    throw new Error("users table is required before running add_email_verified_at");
  }
  await knex.schema.table("users", (t) => {
    t.timestamp("email_verified_at").nullable().defaultTo(null);
    t.string("email_verification_token", 64).nullable();
    t.timestamp("email_verification_expires_at").nullable();
  });
};
exports.down = async (knex) => {
  if (!(await knex.schema.hasTable("users"))) {
    throw new Error("users table is required before running add_email_verified_at");
  }
  await knex.schema.table("users", (t) => {
    t.dropColumn("email_verified_at");
    t.dropColumn("email_verification_token");
    t.dropColumn("email_verification_expires_at");
  });
};
