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
