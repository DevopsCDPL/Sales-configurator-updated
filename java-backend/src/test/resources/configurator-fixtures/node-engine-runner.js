/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');

function normalizeConfigurationData(configData, stepKeys) {
  if (!configData || typeof configData !== 'object') return {};
  const out = { ...configData };
  const stepLines = configData.stepLines;
  if (!stepLines || typeof stepLines !== 'object') return out;

  for (const stepKey of stepKeys) {
    const lines = stepLines[stepKey];
    if (!Array.isArray(lines) || lines.length === 0) continue;

    const selectedComponents = lines.map((line) => ({
      component_id: line.componentId ?? line.component_id ?? null,
      part_number: line.partNumber ?? line.part_number ?? null,
      name: line.name ?? null,
      unit_cost: line.unitPrice ?? line.unit_cost ?? null,
      quantity: typeof line.quantity === 'number' ? line.quantity : 1,
      meta: line.meta ?? {},
    }));

    const existing = out[stepKey];
    if (existing && typeof existing === 'object') {
      const alreadyHasData =
        (Array.isArray(existing.bom_rows) && existing.bom_rows.length > 0) ||
        (Array.isArray(existing.selected_components) && existing.selected_components.length > 0) ||
        (Array.isArray(existing.items) && existing.items.length > 0);
      if (!alreadyHasData) {
        out[stepKey] = { ...existing, selected_components: selectedComponents };
      }
    } else {
      out[stepKey] = { selected_components: selectedComponents };
    }
  }

  return out;
}

function main() {
  const fixturePath = process.argv[2];
  const backendRoot = process.argv[3];
  if (!fixturePath || !backendRoot) {
    throw new Error('Usage: node node-engine-runner.js <fixturePath> <backendRoot>');
  }

  const bomEngine = require(path.join(backendRoot, 'src/services/configurator/bomEngine.js'));
  const labourEngine = require(path.join(backendRoot, 'src/services/configurator/labourEngine.js'));
  const pricingEngine = require(path.join(backendRoot, 'src/services/configurator/pricingEngine.js'));
  const quotationCompiler = require(path.join(backendRoot, 'src/services/configurator/quotationCompiler.js'));

  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const byId = new Map();
  const byPartNumber = new Map();
  for (const component of fixture.components || []) {
    byId.set(component.id, component);
    if (component.part_number) {
      byPartNumber.set(component.part_number, component);
    }
  }

  const normalizedConfig = normalizeConfigurationData(fixture.configData || {}, bomEngine.STEP_KEYS);

  const compiled = quotationCompiler.compileQuotation({
    configuration: fixture.configuration || null,
    configData: normalizedConfig,
    catalog: { byId, byPartNumber },
    lookup: fixture.lookup || {},
    pricing: fixture.pricing || {},
    schedule: fixture.schedule || {},
    holidays: fixture.holidays || [],
    lineAdders: fixture.lineAdders || [],
    preBuiltSections: null,
  });

  const result = {
    compiled,
    engineVersions: {
      calc_version: pricingEngine.CALC_VERSION,
      labour_categories: pricingEngine.LABOR_CATEGORIES,
      step_keys: bomEngine.STEP_KEYS,
      labour_engine_categories: labourEngine.LABOR_CATEGORIES,
    },
  };

  process.stdout.write(JSON.stringify(result));
}

main();
