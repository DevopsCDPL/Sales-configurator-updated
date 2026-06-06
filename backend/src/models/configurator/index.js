'use strict';

/**
 * Configurator model loader.
 *
 * Reads every `*.js` file in this folder (except this one) and registers
 * each model factory with the shared Sequelize instance. Returns an
 * object keyed by model name (e.g. { ConfiguratorComponent: Model, ... }).
 *
 * Called once from `backend/src/models/index.js` so configurator models
 * load alongside the rest of the Forge schema without manual wiring.
 */

const fs = require('fs');
const path = require('path');

module.exports = (sequelize) => {
  const models = {};
  const here = __dirname;
  for (const file of fs.readdirSync(here)) {
    if (file === 'index.js' || !file.endsWith('.js')) continue;
    const factory = require(path.join(here, file));
    if (typeof factory !== 'function') continue;
    const model = factory(sequelize);
    if (model && model.name) {
      models[model.name] = model;
    }
  }
  return models;
};
