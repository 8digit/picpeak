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
