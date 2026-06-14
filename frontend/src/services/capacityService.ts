import api from './api';

/* ── Capacity masters (Teams / Workers / Machines) ──────────────────
 * Thin client over /capacity (mounted backend router, requireResource
 * 'workorders'). The auto-planner is parked until the owner answers the
 * design questionnaire (docs/capacity-traveler-design.md §5); these calls
 * only manage the capacity setup data the planner will later consume.
 */

export interface CapacityTeam {
  id: string;
  name: string;
  department: string;
  active: boolean;
  meta?: Record<string, any>;
  company_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CapacityWorker {
  id: string;
  user_id?: string | null;
  team_id?: string | null;
  display_name?: string | null;
  department: string;
  skills: string[];
  hours_per_day: number;
  active: boolean;
  meta?: Record<string, any>;
  company_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CapacityMachine {
  id: string;
  name: string;
  type: string;
  department?: string | null;
  capacity_unit: string;
  capacity_per_day: number;
  in_house: boolean;
  active: boolean;
  meta?: Record<string, any>;
  company_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTeamInput {
  name: string;
  department: string;
}

export interface CreateWorkerInput {
  user_id?: string | null;
  display_name: string;
  department: string;
  team_id?: string | null;
  skills?: string[];
  hours_per_day?: number;
}

export interface CreateMachineInput {
  name: string;
  type: string;
  capacity_per_day?: number;
  department?: string | null;
}

// ── Teams ──────────────────────────────────────────────────────────
export async function listTeams(): Promise<CapacityTeam[]> {
  const res = await api.get('/capacity/teams');
  return res.data.data;
}

export async function createTeam(input: CreateTeamInput): Promise<CapacityTeam> {
  const res = await api.post('/capacity/teams', input);
  return res.data.data;
}

export async function deleteTeam(id: string): Promise<void> {
  await api.delete(`/capacity/teams/${id}`);
}

// ── Workers ────────────────────────────────────────────────────────
export async function listWorkers(): Promise<CapacityWorker[]> {
  const res = await api.get('/capacity/workers');
  return res.data.data;
}

export async function createWorker(input: CreateWorkerInput): Promise<CapacityWorker> {
  const res = await api.post('/capacity/workers', input);
  return res.data.data;
}

export async function deleteWorker(id: string): Promise<void> {
  await api.delete(`/capacity/workers/${id}`);
}

// ── Machines / work centers ────────────────────────────────────────
export async function listMachines(): Promise<CapacityMachine[]> {
  const res = await api.get('/capacity/machines');
  return res.data.data;
}

export async function createMachine(input: CreateMachineInput): Promise<CapacityMachine> {
  const res = await api.post('/capacity/machines', input);
  return res.data.data;
}

export async function deleteMachine(id: string): Promise<void> {
  await api.delete(`/capacity/machines/${id}`);
}

/* ── P1: tasks, check-in/out, notifications ─────────────────────────
 * Live against the P1 backend (manual task lifecycle + in-app bell).
 */
export interface WorkTask {
  id: string;
  work_order_id?: string | null;
  board_id?: string | null;
  department: string;
  seq: number;
  title: string;
  status: string;
  assignee_user_id?: string | null;
  machine_id?: string | null;
  est_hours?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  quality_gate?: boolean;
  meta?: Record<string, any>;
  company_id?: string | null;
}

export interface AppNotificationRow {
  id: string;
  title: string;
  body: string;
  read_at?: string | null;
  entity?: Record<string, any> | null;
}

export interface CreateTaskInput {
  title: string;
  department: string;
  board_id?: string | null;
  work_order_id?: string | null;
  assignee_user_id?: string | null;
  machine_id?: string | null;
  est_hours?: number | null;
  seq?: number;
  quality_gate?: boolean;
  meta?: Record<string, any>;
}

export async function listTasks(params?: { board_id?: string; status?: string; assignee_user_id?: string }): Promise<WorkTask[]> {
  const res = await api.get('/capacity/tasks', { params: params || {} });
  return res.data.data;
}

export async function createTask(input: CreateTaskInput): Promise<WorkTask> {
  const res = await api.post('/capacity/tasks', input);
  return res.data.data;
}

export async function updateTask(id: string, patch: Partial<CreateTaskInput> & { status?: string }): Promise<WorkTask> {
  const res = await api.patch(`/capacity/tasks/${id}`, patch);
  return res.data.data;
}

export async function checkInTask(id: string): Promise<WorkTask> {
  const res = await api.post(`/capacity/tasks/${id}/check-in`, {});
  return res.data.data;
}

export async function checkOutTask(id: string, body?: { status?: string; note?: string }): Promise<WorkTask> {
  const res = await api.post(`/capacity/tasks/${id}/check-out`, body || {});
  return res.data.data;
}

export async function listMyTasks(): Promise<WorkTask[]> {
  const res = await api.get('/capacity/my-tasks');
  return res.data.data;
}

export async function listNotifications(): Promise<{ items: AppNotificationRow[]; unread: number }> {
  const res = await api.get('/capacity/notifications');
  return res.data.data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/capacity/notifications/${id}/read`, {});
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/capacity/notifications/read-all', {});
}

/* ── P2: deterministic auto-planner ─────────────────────────────────── */
export interface PlanScheduledTask {
  id: string; board_id: string | null; title: string; department: string;
  seq: number; est_hours: number; days: number; est_start: string; est_finish: string;
}
export interface PlanResult {
  startDate: string;
  tasks: PlanScheduledTask[];
  deptCapacityHours: Record<string, number>;
  machineCapacityPerDay: Record<string, number>;
  deptLoadDays: Record<string, number>;
  bottleneck: string | null;
  deliveryDate: string | null;
  assumptions: Record<string, any>;
}
export async function runPlan(body?: { board_id?: string; persist?: boolean; startDate?: string }): Promise<PlanResult> {
  const res = await api.post('/capacity/plan', body || {});
  return res.data.data;
}
