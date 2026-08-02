// 8digit fork migration — predates upstream's equivalent (076_add_is_draft_column /
// 135_add_category_allow_downloads, both hasColumn-guarded so they no-op where this ran).
// Kept because production's knex_migrations table records this filename; deleting it
// would make knex flag the migration directory as corrupt.

exports.up = async function (knex) {
  await knex.schema.table('photo_categories', function (table) {
    table.boolean('allow_downloads').notNullable().defaultTo(true);
  });
};

exports.down = async function (knex) {
  await knex.schema.table('photo_categories', function (table) {
    table.dropColumn('allow_downloads');
  });
};
