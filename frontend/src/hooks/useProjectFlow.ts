/**
 * useProjectFlow — Phase 3 workflow state synchronization hook
 *
 * Responsibilities:
 *   • Track active step + max-unlocked step
 *   • Provide Save / Next / Back actions
 *   • Run optional autosave with debounce
 *   • Sync backend project status via projectService.advanceWorkflow
 *
 * NON-RESPONSIBILITIES (deferred to Phase 4):
 *   • No domain knowledge — Save handlers are passed in per-tab
 *   • No optimistic UI — caller decides reload strategy
 *
 * Memoization: step metadata + handlers are stable references so children
 * (heavy configurator step pages) don't re-render on stepper hover.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectService } from '../services/projectService';
import {
  PROJECT_STEPS,
  PROJECT_STEP_COUNT,
  statusToMaxStep,
  stepIndex as findStepIndex,
  type ProjectStepKey,
  type ProjectStepMeta,
} from '../config/projectSteps';
import type { Project } from '../types';

export interface UseProjectFlowOptions {
  project: Project | null;
  /** When provided, autosave fires `autosaveMs` after each `markDirty()` call. */
  onAutosave?: (stepKey: ProjectStepKey, stepIndex: number) => Promise<void> | void;
  /** Debounce window for autosave. Default 1500ms. */
  autosaveMs?: number;
  /** Called whenever the active step changes. */
  onStepChange?: (stepIndex: number, stepKey: ProjectStepKey) => void;
}

export interface UseProjectFlowResult {
  steps: ReadonlyArray<ProjectStepMeta>;
  stepCount: number;
  activeStep: number;
  activeStepKey: ProjectStepKey;
  activeStepMeta: ProjectStepMeta;
  maxUnlockedStep: number;
  isAccessible: (idx: number) => boolean;
  goTo: (idx: number) => void;
  goToKey: (key: ProjectStepKey) => void;
  back: () => void;
  next: () => Promise<void>;
  /** Mark current step as completed and advance backend status. */
  completeAndAdvance: () => Promise<void>;
  /** Notify the autosave loop that the current step's draft changed. */
  markDirty: () => void;
  /** Force-flush any pending autosave immediately. */
  flushAutosave: () => Promise<void>;
  /** True while autosave is in flight. */
  saving: boolean;
}

export function useProjectFlow(opts: UseProjectFlowOptions): UseProjectFlowResult {
  const { project, onAutosave, autosaveMs = 1500, onStepChange } = opts;

  const [activeStep, setActiveStep] = useState(0);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const dirtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyResolvers = useRef<Array<() => void>>([]);

  /* Re-anchor unlock state when project status loads/changes */
  useEffect(() => {
    if (!project) return;
    setMaxUnlockedStep((prev) => Math.max(prev, statusToMaxStep(project.status)));
  }, [project]);

  const isAccessible = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= PROJECT_STEP_COUNT) return false;
      // Documentation + Analytics are always accessible (history views).
      const step = PROJECT_STEPS[idx];
      if (step?.terminal) return true;
      return idx <= maxUnlockedStep;
    },
    [maxUnlockedStep]
  );

  const goTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= PROJECT_STEP_COUNT) return;
      if (!isAccessible(idx)) return;
      setActiveStep((prev) => {
        if (prev === idx) return prev;
        const key = PROJECT_STEPS[idx].key;
        onStepChange?.(idx, key);
        return idx;
      });
    },
    [isAccessible, onStepChange]
  );

  const goToKey = useCallback(
    (key: ProjectStepKey) => {
      const idx = findStepIndex(key);
      if (idx >= 0) goTo(idx);
    },
    [goTo]
  );

  const back = useCallback(() => {
    setActiveStep((prev) => Math.max(0, prev - 1));
  }, []);

  const completeAndAdvance = useCallback(async () => {
    const target = Math.min(activeStep + 1, PROJECT_STEP_COUNT - 1);
    setMaxUnlockedStep((prev) => Math.max(prev, target));
    setActiveStep(target);
    if (project?.id) {
      try {
        await projectService.advanceWorkflow(project.id, activeStep);
      } catch {
        /* status didn't change — non-fatal */
      }
    }
  }, [activeStep, project?.id]);

  const next = completeAndAdvance;

  /* ── Autosave plumbing ───────────────────────────────────────────── */
  const runAutosave = useCallback(async () => {
    if (!onAutosave) return;
    const stepKey = PROJECT_STEPS[activeStep].key;
    setSaving(true);
    try {
      await onAutosave(stepKey, activeStep);
    } catch {
      /* surfaced by caller via notification system */
    } finally {
      setSaving(false);
      const resolvers = dirtyResolvers.current.splice(0);
      resolvers.forEach((r) => r());
    }
  }, [onAutosave, activeStep]);

  const markDirty = useCallback(() => {
    if (!onAutosave) return;
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current);
    dirtyTimer.current = setTimeout(() => {
      dirtyTimer.current = null;
      void runAutosave();
    }, autosaveMs);
  }, [onAutosave, autosaveMs, runAutosave]);

  const flushAutosave = useCallback(async () => {
    if (dirtyTimer.current) {
      clearTimeout(dirtyTimer.current);
      dirtyTimer.current = null;
      await runAutosave();
      return;
    }
    if (saving) {
      await new Promise<void>((resolve) => {
        dirtyResolvers.current.push(resolve);
      });
    }
  }, [runAutosave, saving]);

  /* Clean up the timer on unmount */
  useEffect(
    () => () => {
      if (dirtyTimer.current) clearTimeout(dirtyTimer.current);
    },
    []
  );

  /* Memoized identity for derived values */
  const activeStepMeta = PROJECT_STEPS[activeStep];
  const activeStepKey = activeStepMeta.key;

  return useMemo(
    () => ({
      steps: PROJECT_STEPS,
      stepCount: PROJECT_STEP_COUNT,
      activeStep,
      activeStepKey,
      activeStepMeta,
      maxUnlockedStep,
      isAccessible,
      goTo,
      goToKey,
      back,
      next,
      completeAndAdvance,
      markDirty,
      flushAutosave,
      saving,
    }),
    [
      activeStep,
      activeStepKey,
      activeStepMeta,
      maxUnlockedStep,
      isAccessible,
      goTo,
      goToKey,
      back,
      next,
      completeAndAdvance,
      markDirty,
      flushAutosave,
      saving,
    ]
  );
}

export default useProjectFlow;
