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
