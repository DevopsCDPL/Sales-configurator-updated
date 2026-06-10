'use strict';

/**
 * Phase A–F (V2 spine) migration — spec docs/specs/PHASE_A..F.
 *
 * Creates: switchboards, component_lines, price_rfqs, completeness_rules,
 *          engineering_standards, copper_reconciliations, solidworks_jobs,
 *          solidworks_agents, handoff_events, component_material_map,
 *          change_orders.
 * Extends: configurator_components (price_status, regime, dims, …),
 *          configurator_quotations (revision chain),
 *          configurator_system_sections (switchboard_id + envelopes).
 * Seeds:   default completeness rules + engineering standards [SEED] tables.
 *
 * Everything is IF NOT EXISTS / additive — safe on the live client DB.
 */

const UUID_PK = (Sequelize) => ({
  type: Sequelize.UUID,
  defaultValue: Sequelize.literal('gen_random_uuid()'),
  primaryKey: true,
});
const TS = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
});
const COMPANY_FK = (Sequelize) => ({
  type: Sequelize.UUID,
  allowNull: true,
  references: { model: 'companies', key: 'id' },
  onDelete: 'CASCADE',
});

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const has = (t) => tables.includes(t);
    const q = (sql) => queryInterface.sequelize.query(sql);

    // ── 1. switchboards ────────────────────────────────────────────
    if (!has('configurator_switchboards')) {
      await queryInterface.createTable('configurator_switchboards', {
        id: UUID_PK(Sequelize),
        configuration_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'configurator_configurations', key: 'id' }, onDelete: 'CASCADE',
        },
        board_index: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        name: { type: Sequelize.STRING(160), allowNull: false, defaultValue: 'Switchboard 1' },
        standards_regime: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'UL' },
        board_type: { type: Sequelize.STRING(40), allowNull: true },
        status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'draft' },
        service_entrance: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        board_data: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        intake: { type: Sequelize.JSONB, allowNull: true },
        drawings_status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'none' },
        cloned_from_switchboard_id: { type: Sequelize.UUID, allowNull: true },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE INDEX IF NOT EXISTS cfg_switchboards_config_idx ON configurator_switchboards (configuration_id, board_index)');
    }

    // ── 2. component_lines ─────────────────────────────────────────
    if (!has('configurator_component_lines')) {
      await queryInterface.createTable('configurator_component_lines', {
        id: UUID_PK(Sequelize),
        switchboard_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'configurator_switchboards', key: 'id' }, onDelete: 'CASCADE',
        },
        scope: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'board' },
        section_id: { type: Sequelize.UUID, allowNull: true },
        component_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'configurator_components', key: 'id' }, onDelete: 'SET NULL',
        },
        category: { type: Sequelize.STRING(120), allowNull: true },
        part_number: { type: Sequelize.STRING(160), allowNull: true },
        name: { type: Sequelize.STRING(255), allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        quantity: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
        unit: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'ea' },
        unit_cost: { type: Sequelize.DECIMAL(14, 4), allowNull: true, defaultValue: 0 },
        price_status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'FIRM' },
        labor_hours: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        source: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'user' },
        builder_payload: { type: Sequelize.JSONB, allowNull: true },
        meta: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE INDEX IF NOT EXISTS cfg_lines_board_idx ON configurator_component_lines (switchboard_id, scope, section_id)');
      await q('CREATE INDEX IF NOT EXISTS cfg_lines_price_idx ON configurator_component_lines (price_status)');
    }

    // ── 3. price_rfqs ──────────────────────────────────────────────
    if (!has('configurator_price_rfqs')) {
      await queryInterface.createTable('configurator_price_rfqs', {
        id: UUID_PK(Sequelize),
        component_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'configurator_components', key: 'id' }, onDelete: 'CASCADE',
        },
        catalog_number: { type: Sequelize.STRING(160), allowNull: false },
        manufacturer: { type: Sequelize.STRING(120), allowNull: true },
        status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'open' },
        requested_by: { type: Sequelize.UUID, allowNull: true },
        sent_at: { type: Sequelize.DATE, allowNull: true },
        received_price: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        received_at: { type: Sequelize.DATE, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
    }

    // ── 4. completeness_rules ──────────────────────────────────────
    if (!has('configurator_completeness_rules')) {
      await queryInterface.createTable('configurator_completeness_rules', {
        id: UUID_PK(Sequelize),
        board_type: { type: Sequelize.STRING(40), allowNull: false, defaultValue: '*' },
        category: { type: Sequelize.STRING(120), allowNull: false },
        requirement: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'REQUIRED' },
        condition_expr: { type: Sequelize.STRING(500), allowNull: true },
        severity: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'BLOCK' },
        message: { type: Sequelize.STRING(255), allowNull: false },
        applies_per: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'per_board' },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      // Seed defaults (board_type *, company NULL = platform defaults)
      await queryInterface.bulkInsert('configurator_completeness_rules', [
        ['ENCLOSURE', 'per_section', 'Every section requires an enclosure/structure'],
        ['CIRCUIT BREAKER', 'per_board', 'At least one MAIN (incomer) device is required'],
        ['BUSSING', 'per_board', 'Bus system is required'],
        ['LUGS', 'per_board', 'Lugs/terminations are required'],
        ['SAFETY', 'per_board', 'Ground bus and safety items are required'],
        ['LABOR', 'per_board', 'Quotation requires labour > 0'],
      ].map(([category, applies_per, message]) => ({
        id: queryInterface.sequelize.literal('gen_random_uuid()'),
        board_type: '*', category, requirement: 'REQUIRED', severity: 'BLOCK',
        message, applies_per, active: true,
        created_at: new Date(), updated_at: new Date(),
      })));
    }

    // ── 5. engineering_standards ───────────────────────────────────
    if (!has('configurator_engineering_standards')) {
      await queryInterface.createTable('configurator_engineering_standards', {
        id: UUID_PK(Sequelize),
        table_key: { type: Sequelize.STRING(40), allowNull: false },
        version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        rows: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
        is_current: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_by: { type: Sequelize.UUID, allowNull: true },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      const seed = require('../seeds/engineeringStandardsSeed');
      await queryInterface.bulkInsert(
        'configurator_engineering_standards',
        Object.entries(seed).map(([table_key, rows]) => ({
          id: queryInterface.sequelize.literal('gen_random_uuid()'),
          table_key, version: 1, rows: JSON.stringify(rows), is_current: true,
          notes: 'SEED defaults — verify with TPS engineering',
          created_at: new Date(), updated_at: new Date(),
        }))
      );
    }

    // ── 6. copper_reconciliations ──────────────────────────────────
    if (!has('configurator_copper_reconciliations')) {
      await queryInterface.createTable('configurator_copper_reconciliations', {
        id: UUID_PK(Sequelize),
        switchboard_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'configurator_switchboards', key: 'id' }, onDelete: 'CASCADE',
        },
        quotation_id: { type: Sequelize.UUID, allowNull: true },
        solidworks_job_id: { type: Sequelize.UUID, allowNull: true },
        estimated_lbs: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        exact_lbs: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        delta_pct: { type: Sequelize.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
        price_per_lb: { type: Sequelize.DECIMAL(14, 6), allowNull: true },
        margin_impact_usd: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
        per_section: { type: Sequelize.JSONB, allowNull: true },
        status: { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'ok' },
        reviewed_by: { type: Sequelize.UUID, allowNull: true },
        reviewed_at: { type: Sequelize.DATE, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
    }

    // ── 7. solidworks_jobs + agents ────────────────────────────────
    if (!has('configurator_solidworks_jobs')) {
      await queryInterface.createTable('configurator_solidworks_jobs', {
        id: UUID_PK(Sequelize),
        switchboard_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'configurator_switchboards', key: 'id' }, onDelete: 'CASCADE',
        },
        configuration_id: { type: Sequelize.UUID, allowNull: true },
        quotation_id: { type: Sequelize.UUID, allowNull: true },
        job_type: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'FULL' },
        payload: { type: Sequelize.JSONB, allowNull: false },
        payload_version: { type: Sequelize.STRING(8), allowNull: false, defaultValue: '1.0' },
        payload_hash: { type: Sequelize.STRING(64), allowNull: false },
        status: { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'queued' },
        priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        max_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3 },
        last_error_code: { type: Sequelize.STRING(32), allowNull: true },
        last_error_message: { type: Sequelize.TEXT, allowNull: true },
        leased_by_agent_id: { type: Sequelize.UUID, allowNull: true },
        lease_expires_at: { type: Sequelize.DATE, allowNull: true },
        next_attempt_at: { type: Sequelize.DATE, allowNull: true },
        progress: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        timeout_min: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 45 },
        cancel_requested: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        artifacts: { type: Sequelize.JSONB, allowNull: true, defaultValue: [] },
        requested_by: { type: Sequelize.UUID, allowNull: true },
        completed_at: { type: Sequelize.DATE, allowNull: true },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE INDEX IF NOT EXISTS cfg_swjobs_lease_idx ON configurator_solidworks_jobs (status, priority, created_at)');
    }
    if (!has('configurator_solidworks_agents')) {
      await queryInterface.createTable('configurator_solidworks_agents', {
        id: UUID_PK(Sequelize),
        name: { type: Sequelize.STRING(120), allowNull: false },
        api_token_id: { type: Sequelize.UUID, allowNull: true },
        capabilities: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        last_seen_at: { type: Sequelize.DATE, allowNull: true },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
    }

    // ── 8. handoff_events / material map / change_orders ──────────
    if (!has('configurator_handoff_events')) {
      await queryInterface.createTable('configurator_handoff_events', {
        id: UUID_PK(Sequelize),
        event_type: { type: Sequelize.STRING(60), allowNull: false },
        idempotency_key: { type: Sequelize.STRING(160), allowNull: false },
        status: { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'pending' },
        payload: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        result: { type: Sequelize.JSONB, allowNull: true },
        error: { type: Sequelize.TEXT, allowNull: true },
        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE UNIQUE INDEX IF NOT EXISTS cfg_handoff_idem_uniq ON configurator_handoff_events (event_type, idempotency_key)');
    }
    if (!has('configurator_component_material_map')) {
      await queryInterface.createTable('configurator_component_material_map', {
        id: UUID_PK(Sequelize),
        component_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'configurator_components', key: 'id' }, onDelete: 'CASCADE',
        },
        material_id: { type: Sequelize.UUID, allowNull: true },
        part_id: { type: Sequelize.UUID, allowNull: true },
        confidence: { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'unmapped' },
        mapped_by: { type: Sequelize.UUID, allowNull: true },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
    }
    if (!has('configurator_change_orders')) {
      await queryInterface.createTable('configurator_change_orders', {
        id: UUID_PK(Sequelize),
        sales_order_id: { type: Sequelize.UUID, allowNull: true },
        configuration_id: { type: Sequelize.UUID, allowNull: false },
        switchboard_id: { type: Sequelize.UUID, allowNull: true },
        reason: { type: Sequelize.TEXT, allowNull: false },
        originator: { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'internal' },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'draft' },
        old_quotation_id: { type: Sequelize.UUID, allowNull: true },
        new_quotation_id: { type: Sequelize.UUID, allowNull: true },
        schedule_impact: { type: Sequelize.STRING(255), allowNull: true },
        customer_approval_doc_id: { type: Sequelize.UUID, allowNull: true },
        created_by: { type: Sequelize.UUID, allowNull: true },
        approved_by: { type: Sequelize.UUID, allowNull: true },
        applied_at: { type: Sequelize.DATE, allowNull: true },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
    }

    // ── 9. extend configurator_components (Phase A §4.1) ──────────
    const addCol = async (table, col, def) => {
      const desc = await queryInterface.describeTable(table);
      if (!desc[col]) await queryInterface.addColumn(table, col, def);
    };
    await addCol('configurator_components', 'price_status', { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'FIRM' });
    await addCol('configurator_components', 'standards_regime', { type: Sequelize.STRING(8), allowNull: true });
    await addCol('configurator_components', 'dims_h_in', { type: Sequelize.DECIMAL(10, 3), allowNull: true });
    await addCol('configurator_components', 'dims_w_in', { type: Sequelize.DECIMAL(10, 3), allowNull: true });
    await addCol('configurator_components', 'dims_d_in', { type: Sequelize.DECIMAL(10, 3), allowNull: true });
    await addCol('configurator_components', 'weight_lbs', { type: Sequelize.DECIMAL(10, 2), allowNull: true });
    await addCol('configurator_components', 'pct_rated', { type: Sequelize.STRING(4), allowNull: true });
    await addCol('configurator_components', 'ul_listing', { type: Sequelize.STRING(40), allowNull: true });
    await addCol('configurator_components', 'voltage_rating_type', { type: Sequelize.STRING(8), allowNull: true, comment: 'straight | slash' });
    await addCol('configurator_components', 'spec_schema_version', { type: Sequelize.STRING(8), allowNull: true });

    // ── 10. extend configurator_quotations (Phase D §7) ───────────
    await addCol('configurator_quotations', 'revision', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await addCol('configurator_quotations', 'parent_quotation_id', { type: Sequelize.UUID, allowNull: true });
    await addCol('configurator_quotations', 'revision_reason', { type: Sequelize.STRING(500), allowNull: true });
    await addCol('configurator_quotations', 'bom_snapshot', { type: Sequelize.JSONB, allowNull: true });
    await addCol('configurator_quotations', 'comex_snapshot_id', { type: Sequelize.UUID, allowNull: true });
    await addCol('configurator_quotations', 'copper_est_lbs', { type: Sequelize.DECIMAL(14, 2), allowNull: true });
    await addCol('configurator_quotations', 'issued_by', { type: Sequelize.UUID, allowNull: true });

    // ── 11. extend configurator_system_sections (Phase A §4.1) ────
    await addCol('configurator_system_sections', 'switchboard_id', { type: Sequelize.UUID, allowNull: true });
    await addCol('configurator_system_sections', 'setup', { type: Sequelize.JSONB, allowNull: true, defaultValue: {} });
    await addCol('configurator_system_sections', 'electrical', { type: Sequelize.JSONB, allowNull: true, defaultValue: {} });
    await addCol('configurator_system_sections', 'layout', { type: Sequelize.JSONB, allowNull: true, defaultValue: {} });
    await addCol('configurator_system_sections', 'computed', { type: Sequelize.JSONB, allowNull: true, defaultValue: {} });

    // ── 12. settings: MAX_SECTIONS handled app-side via Setting model ──
  },

  async down() {
    // Additive migration on a live client DB — no destructive down path.
  },
};
