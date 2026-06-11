/**
 * flowStore — tiny shared store so the board flow chips can live in the
 * STICKY Configuration bar (ConfigurationTab) while the Designer
 * (V2PreviewStep) renders the step content. No context plumbing needed.
 */
import { useSyncExternalStore } from 'react';

export const FLOW_STEPS = [
  ['system', 'System Design'],
  ['sections', 'Section Design'],
  ['components', 'Components'],
  ['sld', 'SLD'],
  ['elevation', 'Elevation'],
  ['bom', 'Bill of Materials'],
  ['quote', 'Quote'],
  ['drawings', 'Drawings'],
] as const;

export type FlowKey = typeof FLOW_STEPS[number][0];

interface FlowState {
  step: FlowKey;
  boardOpen: boolean;
  accepted: boolean;
}

let state: FlowState = { step: 'system', boardOpen: false, accepted: false };
const subs = new Set<() => void>();

export const flowStore = {
  get: (): FlowState => state,
  set(p: Partial<FlowState>) {
    state = { ...state, ...p };
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => { subs.delete(f); };
  },
};

export function useFlowState(): FlowState {
  return useSyncExternalStore(flowStore.subscribe, flowStore.get);
}
