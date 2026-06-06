// Test script to reproduce the copy revision error
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const models = require('../src/models');
const { Estimate, EstimateItem, sequelize } = models;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    // Use the project with R0-R5 (the one from the screenshot)
    const projectId = '88fb4dc6-37d1-41de-b0ab-ceef1dda3c36';
    const sourceRevision = 5;

    console.log(`\nTesting copy of R${sourceRevision} for project ${projectId}...`);

    // Step 1: Find source
    const source = await Estimate.findOne({
      where: { project_id: projectId, revision: sourceRevision },
      include: [{ model: EstimateItem, as: 'items' }],
    });
    console.log('Source found:', !!source, '| Items:', source?.items?.length || 0);

    // Step 2: Try the transaction
    try {
      const result = await sequelize.transaction(async (t) => {
        console.log('\n--- Inside transaction ---');

        // Try the findAll with lock
        console.log('Attempting findAll with LOCK.UPDATE...');
        const existingEstimates = await Estimate.findAll({
          where: { project_id: projectId },
          attributes: ['revision'],
          order: [['revision', 'DESC']],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        console.log('findAll succeeded. Revisions:', existingEstimates.map(e => e.revision));

        const maxRevision = existingEstimates.length > 0
          ? Math.max(...existingEstimates.map(e => parseInt(e.revision, 10) || 0))
          : -1;
        const nextRevision = maxRevision + 1;
        console.log('Max revision:', maxRevision, '| Next:', nextRevision);

        // Try to create the estimate
        console.log('Creating new estimate with revision', nextRevision, '...');
        const newEstimate = await Estimate.create({
          project_id: projectId,
          revision: nextRevision,
          raw_material_cost: 0,
          process_cost: 0,
          overhead_cost: 0,
          total_cost: 0,
          margin_percent: 0,
          final_price: 0,
          is_approved: false,
          custom_parts: [],
          quotation: {},
          is_locked: false,
        }, { transaction: t });
        console.log('Created estimate:', newEstimate.id, 'R' + newEstimate.revision);

        return nextRevision;
      });
      console.log('\nSUCCESS! Created revision R' + result);

      // Clean up - delete the test revision
      await Estimate.destroy({ where: { project_id: projectId, revision: result } });
      console.log('Cleaned up test revision');
    } catch (txErr) {
      console.error('\nTRANSACTION ERROR:');
      console.error('  Name:', txErr.name);
      console.error('  Message:', txErr.message);
      if (txErr.parent) console.error('  Parent:', txErr.parent.message);
      if (txErr.sql) console.error('  SQL:', txErr.sql);
      if (txErr.original) console.error('  Original:', txErr.original.message);
      console.error('  Stack:', txErr.stack);
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
