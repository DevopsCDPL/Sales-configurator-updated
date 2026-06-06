/**
 * Fix the estimates table unique constraint.
 * The database has a wrong constraint (estimates_project_id_key) that only allows
 * one estimate per project. This script drops it and adds the correct composite
 * constraint on (project_id, revision) to allow multiple revisions per project.
 * 
 * Usage:
 *   Set DATABASE_PRIVATE_URL (or DATABASE_URL) and run:
 *   DATABASE_PRIVATE_URL="postgresql://..." node scripts/fixConstraint.js
 */

const { Sequelize } = require('sequelize');

// Prefer private connection URL when available.
const DATABASE_URL = process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_PRIVATE_URL or DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_PRIVATE_URL="postgresql://user:pass@host:port/db" node scripts/fixConstraint.js');
  process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: DATABASE_URL.includes('railway') || DATABASE_URL.includes('ssl=true')
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {}
});

async function fixConstraint() {
  console.log('Connecting to database...');
  
  try {
    await sequelize.authenticate();
    console.log('Connected!\n');

    // Check current constraints
    console.log('Checking current constraints on estimates table...');
    const [constraints] = await sequelize.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'estimates'::regclass
      ORDER BY conname;
    `);
    console.log('Current constraints:', JSON.stringify(constraints, null, 2));

    // Drop the wrong unique constraint if it exists
    const wrongConstraint = constraints.find(c => c.conname === 'estimates_project_id_key');
    if (wrongConstraint) {
      console.log('\nDropping incorrect constraint: estimates_project_id_key');
      await sequelize.query('ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_project_id_key;');
      console.log('Dropped!');
    } else {
      console.log('\nNo incorrect constraint found (estimates_project_id_key)');
    }

    // Check if correct composite constraint exists
    const correctConstraint = constraints.find(c => 
      c.conname === 'estimates_project_id_revision_unique' || 
      c.conname === 'estimates_project_id_revision_key'
    );
    
    if (!correctConstraint) {
      console.log('\nAdding correct composite unique constraint on (project_id, revision)...');
      await sequelize.query(`
        ALTER TABLE estimates 
        ADD CONSTRAINT estimates_project_id_revision_unique 
        UNIQUE (project_id, revision);
      `);
      console.log('Added!');
    } else {
      console.log('\nCorrect composite constraint already exists:', correctConstraint.conname);
    }

    // Verify final state
    console.log('\nVerifying final constraints...');
    const [finalConstraints] = await sequelize.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'estimates'::regclass
      ORDER BY conname;
    `);
    console.log('Final constraints:', JSON.stringify(finalConstraints, null, 2));

    console.log('\n--- Database constraint fix complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixConstraint();
