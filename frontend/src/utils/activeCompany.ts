import type { User } from '../types';

export interface ActiveCompanyContext {
  id: string;
  name: string;
  company_code?: string | null;
  plan?: string | null;
  owner_name?: string | null;
}

const STORAGE_KEY = 'active-company-context';
const CHANGE_EVENT = 'active-company-changed';

function safeParse(value: string | null): ActiveCompanyContext | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || !parsed.id || !parsed.name) {
      return null;
    }
    return parsed as ActiveCompanyContext;
  } catch {
    return null;
  }
}

function emitChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getActiveCompanyContext(): ActiveCompanyContext | null {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function getActiveCompanyId(): string | null {
  return getActiveCompanyContext()?.id || null;
}

export function setActiveCompanyContext(company: ActiveCompanyContext): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(company));
  } catch {
    return;
  }
  emitChange();
}

export function clearActiveCompanyContext(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
  emitChange();
}

export function listenToActiveCompanyChange(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function shouldApplyActiveCompany(user: User | null | undefined, requestUrl?: string): boolean {
  if (user?.role !== 'platform_admin') return false;
  if (!getActiveCompanyId()) return false;

  const url = requestUrl || '';
  if (url.includes('/platform-admin')) return false;
  if (url.includes('/auth/')) return false;

  return true;
}
