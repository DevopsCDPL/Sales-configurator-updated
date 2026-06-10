require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { sequelize } = require('../src/models');

async function run() {
  const models = Object.values(sequelize.models);
  console.log(`Syncing ${models.length} models...`);
  let ok = 0, fail = 0;

  for (const model of models) {
    try {
      await model.sync({ force: false });
      console.log(`✅ ${model.tableName}`);
      ok++;
    } catch (err) {
      console.error(`❌ ${model.tableName}: ${err.message.split('\n')[0]}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} created, ${fail} failed`);
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
