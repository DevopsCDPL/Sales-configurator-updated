/**
 * useFieldIntelligence — React hook for the Field Intelligence Engine
 *
 * Wires the pure field-intelligence engine into the React component tree.
 * Produces field directives via useMemo and applies auto-fills + resets
 * through a controlled useEffect cycle.
 *
 * This hook:
 *  - Evaluates field intelligence on every relevant state change
 *  - Applies auto-fill values to the configurator state
 *  - Applies intelligent resets (clearing incompatible fields only)
 *  - Preserves compatible downstream values
 *
 * All recompute operations flow through the Event Engine (Module 11)
 * via the normal React state → useMemo pipeline → pipelineResult cycle.
 */

import { useMemo, useEffect, useRef, useCallback } from "react";
import {
  evaluateFieldIntelligence,
  collectAutoFills,
  type FieldIntelligenceInputs,
  type FieldIntelligenceResult,
  type SectionIntelligenceInput,
  type SectionFieldDirectives,
} from "../lib/field-intelligence";
import type { SystemParameters, ElectricalProtection, LayoutHardware, SectionDefinition } from "../types";
import type { PipelineOutputs } from "../lib/event-engine";

// ── Hook Input ──

export interface UseFieldIntelligenceParams {
  systemParameters: SystemParameters;
  setSystemParameters: (next: SystemParameters) => void;

  /** Section 1 state */
  section1Definition: SectionDefinition;
  section1ElectricalProtection: ElectricalProtection;
  section1LayoutHardware: LayoutHardware;
  section1BreakerTypeFilter: string;
  setSection1ElectricalProtection: (next: ElectricalProtection) => void;
  setSection1LayoutHardware: (next: LayoutHardware) => void;

  /** Sections 2–6 state */
  sectionDefinitions: Record<number, SectionDefinition>;
  sectionElectricals: Record<number, ElectricalProtection>;
  sectionLayouts: Record<number, LayoutHardware>;
  sectionBreakerTypeFilters: Record<number, string>;
  setSectionElectricals: (next: Record<number, ElectricalProtection>) => void;
  setSectionLayouts: (next: Record<number, LayoutHardware>) => void;

  /** Pipeline results from Event Engine (Module 11) */
  pipelineResult: PipelineOutputs;
}

// ── Hook Output ──

export interface UseFieldIntelligenceReturn {
  /** The complete field intelligence result */
  fieldIntelligence: FieldIntelligenceResult;
}

// ── Hook Implementation ──

export function useFieldIntelligence(
  params: UseFieldIntelligenceParams,
): UseFieldIntelligenceReturn {
  const previousResultRef = useRef<FieldIntelligenceResult | null>(null);
  // Track auto-fills that have been applied to prevent re-application loops
  const appliedAutoFillsRef = useRef<string>("");

  // ── Build section intelligence inputs ──
  const sectionInputs: SectionIntelligenceInput[] = useMemo(() => {
    const sections: SectionIntelligenceInput[] = [];

    // Section 1
    sections.push({
      sectionNumber: 1,
      definition: {
        sectionName: params.section1Definition.sectionName,
        sectionType: params.section1Definition.sectionType,
        sectionFunction: params.section1Definition.sectionFunction,
      },
      electricalProtection: {
        sectionRatedCurrent: params.section1ElectricalProtection.sectionRatedCurrent,
        loadType: params.section1ElectricalProtection.loadType,
        connectedLoad: params.section1ElectricalProtection.connectedLoad,
        demandFactor: params.section1ElectricalProtection.demandFactor,
        diversityFactor: params.section1ElectricalProtection.diversityFactor,
        continuousLoad: params.section1ElectricalProtection.continuousLoad,
        feederType: params.section1ElectricalProtection.feederType,
        parentSection: params.section1ElectricalProtection.parentSection,
        redundancyType: params.section1ElectricalProtection.redundancyType,
        protectionLevel: params.section1ElectricalProtection.protectionLevel,
        earthFaultProtection: params.section1ElectricalProtection.earthFaultProtection,
        arcFlashProtection: params.section1ElectricalProtection.arcFlashProtection,
        interlockingRequirement: params.section1ElectricalProtection.interlockingRequirement,
      },
      layoutHardware: {
        position: params.section1LayoutHardware.position,
        compartmentSize: params.section1LayoutHardware.compartmentSize,
        mountingStructure: params.section1LayoutHardware.mountingStructure,
        stacking: params.section1LayoutHardware.stacking,
        busConnection: params.section1LayoutHardware.busConnection,
        tapOffType: params.section1LayoutHardware.tapOffType,
        cableEntry: params.section1LayoutHardware.cableEntry,
        cableExit: params.section1LayoutHardware.cableExit,
        cableTerminationType: params.section1LayoutHardware.cableTerminationType,
        metering: params.section1LayoutHardware.metering,
        ctRequirement: params.section1LayoutHardware.ctRequirement,
        ctType: params.section1LayoutHardware.ctType,
        controlType: params.section1LayoutHardware.controlType,
        indications: params.section1LayoutHardware.indications,
      },
      breakerTypeFilter: params.section1BreakerTypeFilter,
    });

    // Sections 2–6
    for (const sn of [2, 3, 4, 5, 6] as const) {
      const def = params.sectionDefinitions[sn];
      const ep = params.sectionElectricals[sn];
      const lh = params.sectionLayouts[sn];
      if (!def || !ep || !lh) continue;

      sections.push({
        sectionNumber: sn,
        definition: {
          sectionName: def.sectionName,
          sectionType: def.sectionType,
          sectionFunction: def.sectionFunction,
        },
        electricalProtection: {
          sectionRatedCurrent: ep.sectionRatedCurrent,
          loadType: ep.loadType,
          connectedLoad: ep.connectedLoad,
          demandFactor: ep.demandFactor,
          diversityFactor: ep.diversityFactor,
          continuousLoad: ep.continuousLoad,
          feederType: ep.feederType,
          parentSection: ep.parentSection,
          redundancyType: ep.redundancyType,
          protectionLevel: ep.protectionLevel,
          earthFaultProtection: ep.earthFaultProtection,
          arcFlashProtection: ep.arcFlashProtection,
          interlockingRequirement: ep.interlockingRequirement,
        },
        layoutHardware: {
          position: lh.position,
          compartmentSize: lh.compartmentSize,
          mountingStructure: lh.mountingStructure,
          stacking: lh.stacking,
          busConnection: lh.busConnection,
          tapOffType: lh.tapOffType,
          cableEntry: lh.cableEntry,
          cableExit: lh.cableExit,
          cableTerminationType: lh.cableTerminationType,
          metering: lh.metering,
          ctRequirement: lh.ctRequirement,
          ctType: lh.ctType,
          controlType: lh.controlType,
          indications: lh.indications,
        },
        breakerTypeFilter: params.sectionBreakerTypeFilters[sn] ?? "",
      });
    }

    return sections;
  }, [
    params.section1Definition,
    params.section1ElectricalProtection,
    params.section1LayoutHardware,
    params.section1BreakerTypeFilter,
    params.sectionDefinitions,
    params.sectionElectricals,
    params.sectionLayouts,
    params.sectionBreakerTypeFilters,
  ]);

  // ── Evaluate field intelligence ──
  const fieldIntelligence = useMemo(() => {
    const inputs: FieldIntelligenceInputs = {
      systemParameters: params.systemParameters,
      sections: sectionInputs,
      pipelineResults: params.pipelineResult,
      previousResult: previousResultRef.current,
    };

    const result = evaluateFieldIntelligence(inputs);
    previousResultRef.current = result;
    return result;
  }, [params.systemParameters, sectionInputs, params.pipelineResult]);

  // ── Apply auto-fills ──
  // Runs as an effect: reads field intelligence directives and applies
  // auto-fill values to state. Uses a fingerprint ref to prevent loops.
  const applyAutoFills = useCallback(() => {
    const fills = collectAutoFills(fieldIntelligence);
    if (fills.length === 0) return;

    // Build a fingerprint of all auto-fills to detect changes
    const fingerprint = fills
      .map((f) => `${f.scope}:${f.sectionNumber ?? ""}:${f.panel ?? ""}:${f.field}=${f.value}`)
      .join("|");

    if (fingerprint === appliedAutoFillsRef.current) return;
    appliedAutoFillsRef.current = fingerprint;

    // ── System auto-fills ──
    let systemChanged = false;
    const nextSystem = { ...params.systemParameters };
    for (const fill of fills) {
      if (fill.scope !== "system") continue;
      const key = fill.field as keyof SystemParameters;
      if (key in nextSystem && nextSystem[key] !== fill.value) {
        nextSystem[key] = fill.value;
        systemChanged = true;
      }
    }
    if (systemChanged) {
      params.setSystemParameters(nextSystem);
    }

    // ── Section 1 auto-fills ──
    let sec1EPChanged = false;
    const nextSec1EP = { ...params.section1ElectricalProtection };
    let sec1LHChanged = false;
    const nextSec1LH = { ...params.section1LayoutHardware };

    for (const fill of fills) {
      if (fill.scope !== "section" || fill.sectionNumber !== 1) continue;

      if (fill.panel === "electricalProtection") {
        const key = fill.field as keyof ElectricalProtection;
        if (key in nextSec1EP && nextSec1EP[key] !== fill.value) {
          nextSec1EP[key] = fill.value;
          sec1EPChanged = true;
        }
      } else if (fill.panel === "layoutHardware") {
        const key = fill.field as keyof LayoutHardware;
        if (key in nextSec1LH && nextSec1LH[key] !== fill.value) {
          nextSec1LH[key] = fill.value;
          sec1LHChanged = true;
        }
      }
    }
    if (sec1EPChanged) params.setSection1ElectricalProtection(nextSec1EP);
    if (sec1LHChanged) params.setSection1LayoutHardware(nextSec1LH);

    // ── Sections 2–6 auto-fills ──
    let secEPsChanged = false;
    const nextSecEPs = { ...params.sectionElectricals };
    let secLHsChanged = false;
    const nextSecLHs = { ...params.sectionLayouts };

    for (const fill of fills) {
      if (fill.scope !== "section" || fill.sectionNumber === 1 || fill.sectionNumber == null) continue;
      const sn = fill.sectionNumber;

      if (fill.panel === "electricalProtection" && nextSecEPs[sn]) {
        const key = fill.field as keyof ElectricalProtection;
        if (key in nextSecEPs[sn] && nextSecEPs[sn][key] !== fill.value) {
          nextSecEPs[sn] = { ...nextSecEPs[sn], [key]: fill.value };
          secEPsChanged = true;
        }
      } else if (fill.panel === "layoutHardware" && nextSecLHs[sn]) {
        const key = fill.field as keyof LayoutHardware;
        if (key in nextSecLHs[sn] && nextSecLHs[sn][key] !== fill.value) {
          nextSecLHs[sn] = { ...nextSecLHs[sn], [key]: fill.value };
          secLHsChanged = true;
        }
      }
    }
    if (secEPsChanged) params.setSectionElectricals(nextSecEPs);
    if (secLHsChanged) params.setSectionLayouts(nextSecLHs);
  }, [
    fieldIntelligence,
    params.systemParameters,
    params.setSystemParameters,
    params.section1ElectricalProtection,
    params.setSection1ElectricalProtection,
    params.section1LayoutHardware,
    params.setSection1LayoutHardware,
    params.sectionElectricals,
    params.setSectionElectricals,
    params.sectionLayouts,
    params.setSectionLayouts,
  ]);

  // ── Apply resets for incompatible fields ──
  const applyResets = useCallback(() => {
    if (fieldIntelligence.resetFields.length === 0) return;

    for (const reset of fieldIntelligence.resetFields) {
      if (reset.section === null) {
        // System-level reset
        const key = reset.field as keyof SystemParameters;
        if (params.systemParameters[key]) {
          params.setSystemParameters({
            ...params.systemParameters,
            [key]: "",
          });
        }
      } else if (reset.section === 1) {
        if (reset.panel === "electricalProtection") {
          const key = reset.field as keyof ElectricalProtection;
          if (params.section1ElectricalProtection[key]) {
            params.setSection1ElectricalProtection({
              ...params.section1ElectricalProtection,
              [key]: "",
            });
          }
        } else if (reset.panel === "layoutHardware") {
          const key = reset.field as keyof LayoutHardware;
          if (params.section1LayoutHardware[key]) {
            params.setSection1LayoutHardware({
              ...params.section1LayoutHardware,
              [key]: "",
            });
          }
        }
      } else {
        const sn = reset.section;
        if (reset.panel === "electricalProtection" && params.sectionElectricals[sn]) {
          const key = reset.field as keyof ElectricalProtection;
          if (params.sectionElectricals[sn][key]) {
            params.setSectionElectricals({
              ...params.sectionElectricals,
              [sn]: { ...params.sectionElectricals[sn], [key]: "" },
            });
          }
        } else if (reset.panel === "layoutHardware" && params.sectionLayouts[sn]) {
          const key = reset.field as keyof LayoutHardware;
          if (params.sectionLayouts[sn][key]) {
            params.setSectionLayouts({
              ...params.sectionLayouts,
              [sn]: { ...params.sectionLayouts[sn], [key]: "" },
            });
          }
        }
      }
    }
  }, [
    fieldIntelligence.resetFields,
    params.systemParameters,
    params.setSystemParameters,
    params.section1ElectricalProtection,
    params.setSection1ElectricalProtection,
    params.section1LayoutHardware,
    params.setSection1LayoutHardware,
    params.sectionElectricals,
    params.setSectionElectricals,
    params.sectionLayouts,
    params.setSectionLayouts,
  ]);

  // ── Effect: apply auto-fills and resets ──
  useEffect(() => {
    applyAutoFills();
    applyResets();
  }, [applyAutoFills, applyResets]);

  return { fieldIntelligence };
}
