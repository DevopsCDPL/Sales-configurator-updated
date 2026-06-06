// Test the actual estimateService.copyEstimateToNewRevision function directly
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

(async () => {
  try {
    const { Estimate, EstimateItem, sequelize } = require('../src/models');
    const estimateService = require('../src/services/estimateService');

    await sequelize.authenticate();
    console.log('DB connected');

    const projectId = '88fb4dc6-37d1-41de-b0ab-ceef1dda3c36';
    
    // Show current revisions
    const before = await Estimate.findAll({
      where: { project_id: projectId },
      attributes: ['id', 'revision'],
      order: [['revision', 'ASC']],
    });
    console.log('Before - Revisions:', before.map(e => 'R' + e.revision).join(', '));

    // Call the actual service method
    console.log('\nCalling copyEstimateToNewRevision(projectId, 5)...');
    const result = await estimateService.copyEstimateToNewRevision(projectId, 5);
    console.log('SUCCESS! New estimate:', result ? ('R' + result.revision) : 'null');

    // Show revisions after
    const after = await Estimate.findAll({
      where: { project_id: projectId },
      attributes: ['id', 'revision'],
      order: [['revision', 'ASC']],
    });
    console.log('\nAfter - Revisions:', after.map(e => 'R' + e.revision).join(', '));

    // Clean up the new revision so test is repeatable
    if (result) {
      await EstimateItem.destroy({ where: { estimate_id: result.id } });
      await Estimate.destroy({ where: { id: result.id } });
      console.log('Cleaned up test revision R' + result.revision);
    }

    process.exit(0);
  } catch (e) {
    console.error('\nFAILED:');
    console.error('  Name:', e.name);
    console.error('  Message:', e.message);
    if (e.parent) console.error('  Parent error:', e.parent.message);
    if (e.sql) console.error('  SQL:', e.sql);
    if (e.original) console.error('  Original:', e.original.message, e.original.detail);
    console.error('\n  Stack:', e.stack);
    process.exit(1);
  }
})();
