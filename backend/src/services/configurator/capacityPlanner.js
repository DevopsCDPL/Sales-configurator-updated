'use strict';

/**
 * capacityPlanner.js — Capacity P2 v1 (deterministic forward-scheduler).
 *
 * Turns the open work_tasks into a schedule (est_start/est_finish per task),
 * a per-department load, a bottleneck flag and an overall delivery date.
 *
 * DOCUMENTED DEFAULT ASSUMPTIONS (refine later with a shift/holiday calendar):
 *   - 8 working hours/day, Mon–Fri, no holidays.
 *   - A department's daily capacity (hours) = sum of its active operators'
 *     hours_per_day; if a department has no operators, defaults to 8h.
 *   - Tasks are scheduled per board in `seq` order; a task starts at the later
 *     of (its board's previous task finish) and (its department's next-free day).
 *   - Machine/equipment gating is surfaced (capacity summary) but does NOT yet
 *     constrain the schedule — that's the next refinement (P3).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function isWeekend(d) { const x = d.getDay(); return x === 0 || x === 6; }
function nextBusinessDay(d) { let x = new Date(d); do { x = new Date(x.getTime() + DAY_MS); } while (isWeekend(x)); return x; }
function startOfBusinessDay(d) { let x = new Date(d); x.setHours(8, 0, 0, 0); while (isWeekend(x)) x = nextBusinessDay(x); return x; }
function addBusinessDays(start, wholeDays) { let d = new Date(start); for (let i = 0; i < wholeDays; i++) d = nextBusinessDay(d); return d; }

function planTasks(tasks, operators, machines, opts = {}) {
  const startDate = startOfBusinessDay(opts.startDate ? new Date(opts.startDate) : new Date());

  // department daily capacity (hours) from active operators
  const deptCap = {};
  for (const o of operators || []) {
    if (o.active === false) continue;
    const dpt = o.department;
    if (!dpt) continue;
    deptCap[dpt] = (deptCap[dpt] || 0) + (Number(o.hours_per_day) || 8);
  }

  // machine capacity summary (per department) — informational in v1
  const machineCap = {};
  for (const m of machines || []) {
    if (m.active === false) continue;
    const dpt = m.department || 'unassigned';
    machineCap[dpt] = (machineCap[dpt] || 0) + (Number(m.capacity_per_day) || 0);
  }

  const byBoard = {};
  for (const t of tasks || []) {
    if (t.status === 'done') continue; // already complete
    const b = t.board_id || '_unassigned';
    (byBoard[b] = byBoard[b] || []).push(t);
  }

  const deptFree = {};      // next-free Date per department
  const deptLoadDays = {};  // total scheduled days per department
  const scheduled = [];

  for (const b of Object.keys(byBoard)) {
    const list = byBoard[b].slice().sort((a, c) => (a.seq || 0) - (c.seq || 0));
    let prevFinish = startDate;
    for (const t of list) {
      const dpt = t.department || 'unassigned';
      const cap = deptCap[dpt] || 8;
      const hours = Number(t.est_hours) || cap; // no estimate => assume 1 day
      const days = Math.max(1, Math.ceil(hours / cap));
      const deptAvail = deptFree[dpt] ? new Date(deptFree[dpt]) : startDate;
      let est_start = new Date(Math.max(prevFinish.getTime(), deptAvail.getTime()));
      while (isWeekend(est_start)) est_start = nextBusinessDay(est_start);
      const est_finish = addBusinessDays(est_start, days);
      deptFree[dpt] = est_finish;
      prevFinish = est_finish;
      deptLoadDays[dpt] = (deptLoadDays[dpt] || 0) + days;
      scheduled.push({
        id: t.id, board_id: t.board_id || null, title: t.title, department: dpt,
        seq: t.seq, est_hours: hours, days,
        est_start: est_start.toISOString(), est_finish: est_finish.toISOString(),
      });
    }
  }

  let bottleneck = null, maxLoad = -1;
  for (const d of Object.keys(deptLoadDays)) { if (deptLoadDays[d] > maxLoad) { maxLoad = deptLoadDays[d]; bottleneck = d; } }
  const deliveryDate = scheduled.reduce((acc, x) => (acc === null || x.est_finish > acc ? x.est_finish : acc), null);

  return {
    startDate: startDate.toISOString(),
    tasks: scheduled,
    deptCapacityHours: deptCap,
    machineCapacityPerDay: machineCap,
    deptLoadDays,
    bottleneck,
    deliveryDate,
    assumptions: { hoursPerDay: 8, workweek: 'Mon-Fri', holidays: 'none', machineGating: 'informational (P3 will constrain)', note: 'Deterministic defaults — refine with shift/holiday calendar.' },
  };
}

module.exports = { planTasks };
