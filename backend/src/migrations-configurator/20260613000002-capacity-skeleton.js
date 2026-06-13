'use strict';

/**
 * Capacity Planning + Production Traveller execution layer — SKELETON.
 *
 * Design: docs/capacity-traveler-design.md. Aligns with Phase F §4 (F3
 * Production) and §10 debt #3 (capacity planner automation).
 *
 * Creates (IF NOT EXISTS, additive): capacity_teams, capacity_workers,
 * capacity_machines, work_tasks, task_events, app_notifications.
 *
 * SAFETY: everything IF-NOT-EXISTS / additive — safe on the live client DB.
 * No FKs into the volatile work_orders header beyond a loose UUID column
 * (work_order_id is FK-less by design — the execution layer is decoupled
 * from the WorkOrder document record). down() is a no-op, matching the
 * neighboring v2-spine and department-roles migrations (no destructive path
 * on a live DB).
 *
 * This module is INERT: no route mounts it (capacityRoutes.js is not wired
 * into routes/index.js). Running this migration only adds empty tables.
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

    // ── 1. capacity_teams ──────────────────────────────────────────
    if (!has('capacity_teams')) {
      await queryInterface.createTable('capacity_teams', {
        id: UUID_PK(Sequelize),
        name: { type: Sequelize.STRING(160), allowNull: false },
        department: { type: Sequelize.STRING(40), allowNull: false },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        meta: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE INDEX IF NOT EXISTS capacity_teams_dept_idx ON capacity_teams (department)');
    }

    // ── 2. capacity_workers ────────────────────────────────────────
    if (!has('capacity_workers')) {
      await queryInterface.createTable('capacity_workers', {
        id: UUID_PK(Sequelize),
        // Nullable: a roster can be stubbed before User logins exist.
        user_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'users', key: 'id' }, onDelete: 'SET NULL',
        },
        team_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'capacity_teams', key: 'id' }, onDelete: 'SET NULL',
        },
        display_name: { type: Sequelize.STRING(160), allowNull: true },
        department: { type: Sequelize.STRING(40), allowNull: false },
        skills: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
        hours_per_day: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 8 },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        meta: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE INDEX IF NOT EXISTS capacity_workers_dept_idx ON capacity_workers (department)');
      await q('CREATE INDEX IF NOT EXISTS capacity_workers_user_idx ON capacity_workers (user_id)');
    }

    // ── 3. capacity_machines ───────────────────────────────────────
    if (!has('capacity_machines')) {
      await queryInterface.createTable('capacity_machines', {
        id: UUID_PK(Sequelize),
        name: { type: Sequelize.STRING(160), allowNull: false },
        type: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'generic' },
        department: { type: Sequelize.STRING(40), allowNull: true },
        capacity_unit: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'hours' },
        capacity_per_day: { type: Sequelize.DECIMAL(12, 4), allowNull: false, defaultValue: 8 },
        in_house: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        meta: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE INDEX IF NOT EXISTS capacity_machines_type_idx ON capacity_machines (type)');
    }

    // ── 4. work_tasks ──────────────────────────────────────────────
    if (!has('work_tasks')) {
      await queryInterface.createTable('work_tasks', {
        id: UUID_PK(Sequelize),
        // Loose UUID — intentionally FK-less so the execution layer stays
        // decoupled from the work_orders document record (design §0.2).
        work_order_id: { type: Sequelize.UUID, allowNull: true },
        board_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'configurator_switchboards', key: 'id' }, onDelete: 'CASCADE',
        },
        department: { type: Sequelize.STRING(40), allowNull: false },
        seq: { type: Sequelize.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
        title: { type: Sequelize.STRING(255), allowNull: true },
        // varchar (not DB enum) for additive safety:
        // pending | ready | checked_in | done | quality_hold
        status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'pending' },
        assignee_user_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'users', key: 'id' }, onDelete: 'SET NULL',
        },
        machine_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'capacity_machines', key: 'id' }, onDelete: 'SET NULL',
        },
        est_hours: { type: Sequelize.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
        est_start: { type: Sequelize.DATE, allowNull: true },
        est_finish: { type: Sequelize.DATE, allowNull: true },
        started_at: { type: Sequelize.DATE, allowNull: true },
        finished_at: { type: Sequelize.DATE, allowNull: true },
        quality_gate: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        // predecessors[] live in meta.predecessors as task-id array (DAG).
        meta: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE INDEX IF NOT EXISTS work_tasks_board_idx ON work_tasks (board_id, seq)');
      await q('CREATE INDEX IF NOT EXISTS work_tasks_status_idx ON work_tasks (status)');
      await q('CREATE INDEX IF NOT EXISTS work_tasks_assignee_idx ON work_tasks (assignee_user_id)');
      await q('CREATE INDEX IF NOT EXISTS work_tasks_wo_idx ON work_tasks (work_order_id)');
    }

    // ── 5. task_events ─────────────────────────────────────────────
    if (!has('task_events')) {
      await queryInterface.createTable('task_events', {
        id: UUID_PK(Sequelize),
        task_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'work_tasks', key: 'id' }, onDelete: 'CASCADE',
        },
        type: { type: Sequelize.STRING(40), allowNull: false },
        user_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'users', key: 'id' }, onDelete: 'SET NULL',
        },
        at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
        meta: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE INDEX IF NOT EXISTS task_events_task_idx ON task_events (task_id, at)');
    }

    // ── 6. app_notifications ───────────────────────────────────────
    if (!has('app_notifications')) {
      await queryInterface.createTable('app_notifications', {
        id: UUID_PK(Sequelize),
        user_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE',
        },
        type: { type: Sequelize.STRING(60), allowNull: false },
        title: { type: Sequelize.STRING(255), allowNull: true },
        body: { type: Sequelize.TEXT, allowNull: true },
        read_at: { type: Sequelize.DATE, allowNull: true },
        entity: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        company_id: COMPANY_FK(Sequelize),
        ...TS(Sequelize),
      });
      await q('CREATE INDEX IF NOT EXISTS app_notifications_user_idx ON app_notifications (user_id, read_at)');
    }
  },

  async down() {
    // Additive skeleton on a live client DB — no destructive down path.
    // (Same policy as 20260611000001-create-configurator-v2-spine and
    //  20260613000001-department-roles.)
  },
};
