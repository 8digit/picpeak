// 8digit fork migration — predates upstream's equivalent (076_add_is_draft_column /
// 135_add_category_allow_downloads, both hasColumn-guarded so they no-op where this ran).
// Kept because production's knex_migrations table records this filename; deleting it
// would make knex flag the migration directory as corrupt.

exports.up = async function(knex) {
  await knex.schema.alterTable('events', (table) => {
    table.boolean('is_draft').defaultTo(false);
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('events', (table) => {
    table.dropColumn('is_draft');
  });
};
