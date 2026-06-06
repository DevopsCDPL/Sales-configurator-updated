const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// All routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

// Helper to extract company_id from request (tenantScope already sets req.activeCompanyId)
function getCompanyId(req) {
  return req.activeCompanyId || null;
}

// GET /api/system-config — return all rows for the user's company
router.get('/', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const isPlatformAdmin = req.user?.role === 'platform_admin';

    let query, replacements;
    if (isPlatformAdmin && !companyId) {
      // Platform admin without specific company scope sees all
      query = `SELECT id, section_name, module_key, module_label,
                      numbering_prefix, numbering_start, numbering_increment,
                      numbering_suffix, is_active, company_id
               FROM system_module_config
               ORDER BY id`;
      replacements = {};
    } else {
      // Use DISTINCT ON to ensure the company-specific row always wins over the
      // global (company_id IS NULL) seed row when both exist for the same section.
      // ORDER BY: section_name first, then company-specific rows before NULL rows,
      // then by id so the first row per section is always the most-specific one.
      query = `SELECT DISTINCT ON (section_name)
                      id, section_name, module_key, module_label,
                      numbering_prefix, numbering_start, numbering_increment,
                      numbering_suffix, is_active
               FROM system_module_config
               WHERE (company_id = :company_id OR company_id IS NULL)
               ORDER BY section_name,
                        (company_id IS NOT NULL) DESC,
                        id`;
      replacements = { company_id: companyId };
    }

    const rows = await sequelize.query(query, { type: QueryTypes.SELECT, replacements });
    console.log('Fetching Config Data:', JSON.stringify(rows));
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /system-config error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch system config' });
  }
});

// POST /api/system-config — upsert a single row by section_name + company_id
router.post('/', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const {
      section_name,
      module_key,
      module_label,
      numbering_prefix,
      numbering_start,
      numbering_increment,
      numbering_suffix,
    } = req.body;

    if (!section_name) {
      return res.status(400).json({ success: false, message: 'section_name is required' });
    }

    console.log('Received Config Save Request:', JSON.stringify(req.body));

    // Check if row exists for this company
    const existing = await sequelize.query(
      `SELECT id FROM system_module_config
       WHERE section_name = :section_name AND (company_id = :company_id OR (company_id IS NULL AND :company_id IS NULL))
       LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { section_name, company_id: companyId } }
    );

    if (existing.length > 0) {
      // UPDATE — only update fields that were explicitly provided
      const setClauses = [];
      const replacements = { section_name, company_id: companyId };
      if (module_key !== undefined)        { setClauses.push('module_key = :module_key');               replacements.module_key = module_key; }
      if (module_label !== undefined)      { setClauses.push('module_label = :module_label');           replacements.module_label = module_label; }
      if (numbering_prefix !== undefined)  { setClauses.push('numbering_prefix = :numbering_prefix');   replacements.numbering_prefix = numbering_prefix; }
      if (numbering_start !== undefined)   { setClauses.push('numbering_start = :numbering_start');     replacements.numbering_start = numbering_start; }
      if (numbering_increment !== undefined){ setClauses.push('numbering_increment = :numbering_increment'); replacements.numbering_increment = numbering_increment; }
      if (numbering_suffix !== undefined)  { setClauses.push('numbering_suffix = :numbering_suffix');   replacements.numbering_suffix = numbering_suffix; }
      setClauses.push('updated_at = NOW()');
      await sequelize.query(
        `UPDATE system_module_config SET ${setClauses.join(', ')}
         WHERE section_name = :section_name AND (company_id = :company_id OR (company_id IS NULL AND :company_id IS NULL))`,
        { type: QueryTypes.UPDATE, replacements }
      );
    } else {
      // INSERT with company_id
      await sequelize.query(
        `INSERT INTO system_module_config
           (section_name, module_key, module_label, numbering_prefix, numbering_start,
            numbering_increment, numbering_suffix, is_active, company_id, created_at, updated_at)
         VALUES
           (:section_name, :module_key, :module_label, :numbering_prefix, :numbering_start,
            :numbering_increment, :numbering_suffix, true, :company_id, NOW(), NOW())`,
        {
          type: QueryTypes.INSERT,
          replacements: {
            section_name,
            module_key: module_key ?? null,
            module_label: module_label ?? null,
            numbering_prefix: numbering_prefix ?? null,
            numbering_start: numbering_start ?? null,
            numbering_increment: numbering_increment ?? null,
            numbering_suffix: numbering_suffix ?? null,
            company_id: companyId,
          },
        }
      );
    }

    // When the production_traveler industry type changes, propagate it to all existing projects
    // so they immediately reflect the new traveler type (affects PDF generation).
    if (section_name === 'production_traveler' && module_key) {
      try {
        if (companyId) {
          // Scoped to this company
          await sequelize.query(
            `UPDATE projects SET production_traveler_type = :module_key, updated_at = NOW()
             WHERE company_id = :company_id`,
            { type: QueryTypes.UPDATE, replacements: { module_key, company_id: companyId } }
          );
          console.log('Propagated production_traveler_type =', module_key, 'to all projects for company', companyId);
        } else {
          // Global setting (no company scope) — update all projects
          await sequelize.query(
            `UPDATE projects SET production_traveler_type = :module_key, updated_at = NOW()`,
            { type: QueryTypes.UPDATE, replacements: { module_key } }
          );
          console.log('Propagated production_traveler_type =', module_key, 'to ALL projects (global setting)');
        }
      } catch (propErr) {
        console.warn('Could not propagate production_traveler_type to projects:', propErr.message);
      }
    }

    console.log('Config Saved for section:', section_name, 'module_key:', module_key);
    res.json({ success: true, message: 'Configuration saved' });
  } catch (err) {
    console.error('POST /system-config error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save system config' });
  }
});

module.exports = router;
