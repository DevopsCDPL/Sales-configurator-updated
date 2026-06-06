/**
 * Configurator shared types
 *
 * Extracted verbatim from `config/src/components/SystemDesignPanel.tsx` so that
 * pure engines / hooks can consume them without dragging in shadcn UI deps.
 */

export type SystemParameters = {
  switchboardType: string;
  applicationType: string;
  standards: string;
  specialEnvironment: string;
  designMode: string;
  systemVoltage: string;
  frequency: string;
  phase: string;
  shortCircuitRating: string;
  mainBusRating: string;
  neutralRating: string;
  connectionType: string;
  numberOfSections: string;
  accessType: string;
  cableType: string;
  sectionWidth: string;
  depth: string;
  height: string;
  cableEntry: string;
  cableExit: string;
  specialConnections: string;
  installationLocation: string;
  ipRating: string;
  ambientTemp: string;
  busMaterial: string;
  plating: string;
  busConfiguration: string;
};

export const DEFAULT_SYSTEM_PARAMETERS: SystemParameters = {
  switchboardType: "",
  applicationType: "",
  standards: "",
  specialEnvironment: "",
  designMode: "Auto",
  systemVoltage: "",
  frequency: "",
  phase: "",
  shortCircuitRating: "",
  mainBusRating: "",
  neutralRating: "",
  connectionType: "",
  numberOfSections: "",
  accessType: "",
  cableType: "",
  sectionWidth: "",
  depth: "",
  height: "",
  cableEntry: "",
  cableExit: "",
  specialConnections: "",
  installationLocation: "",
  ipRating: "",
  ambientTemp: "",
  busMaterial: "",
  plating: "",
  busConfiguration: "",
};

export type SectionDefinition = {
  sectionName: string;
  sectionType: string;
  sectionFunction: string;
  operationType: string;
  accessories: string;
  sectionRatedCurrent: string;
  loadType: string;
  connectedLoad: string;
  demandFactor: string;
  diversityFactor: string;
  continuousLoad: string;
  feederType: string;
  parentSection: string;
  redundancyType: string;
  protectionLevel: string;
  earthFaultProtection: string;
  arcFlashProtection: string;
  interlockingRequirement: string;
  position: string;
  compartmentSize: string;
  mountingStructure: string;
  stacking: string;
  busConnection: string;
  tapOffType: string;
  cableEntry: string;
  cableExit: string;
  cableTerminationType: string;
  metering: string;
  ctRequirement: string;
  ctType: string;
  controlType: string;
  indications: string;
};

export const DEFAULT_SECTION_DEFINITION: SectionDefinition = {
  sectionName: "",
  sectionType: "",
  sectionFunction: "",
  operationType: "",
  accessories: "",
  sectionRatedCurrent: "",
  loadType: "",
  connectedLoad: "",
  demandFactor: "",
  diversityFactor: "",
  continuousLoad: "",
  feederType: "",
  parentSection: "",
  redundancyType: "",
  protectionLevel: "",
  earthFaultProtection: "",
  arcFlashProtection: "",
  interlockingRequirement: "",
  position: "",
  compartmentSize: "",
  mountingStructure: "",
  stacking: "",
  busConnection: "",
  tapOffType: "",
  cableEntry: "",
  cableExit: "",
  cableTerminationType: "",
  metering: "",
  ctRequirement: "",
  ctType: "",
  controlType: "",
  indications: "",
};

export type ElectricalProtection = {
  sectionRatedCurrent: string;
  loadType: string;
  connectedLoad: string;
  demandFactor: string;
  diversityFactor: string;
  continuousLoad: string;
  feederType: string;
  parentSection: string;
  redundancyType: string;
  protectionLevel: string;
  earthFaultProtection: string;
  arcFlashProtection: string;
  interlockingRequirement: string;
};

export const DEFAULT_ELECTRICAL_PROTECTION: ElectricalProtection = {
  sectionRatedCurrent: "",
  loadType: "",
  connectedLoad: "",
  demandFactor: "",
  diversityFactor: "",
  continuousLoad: "",
  feederType: "",
  parentSection: "",
  redundancyType: "",
  protectionLevel: "",
  earthFaultProtection: "",
  arcFlashProtection: "",
  interlockingRequirement: "",
};

export type LayoutHardware = {
  position: string;
  compartmentSize: string;
  mountingStructure: string;
  stacking: string;
  busConnection: string;
  tapOffType: string;
  cableEntry: string;
  cableExit: string;
  cableTerminationType: string;
  metering: string;
  ctRequirement: string;
  ctType: string;
  controlType: string;
  indications: string;
};

export const DEFAULT_LAYOUT_HARDWARE: LayoutHardware = {
  position: "",
  compartmentSize: "",
  mountingStructure: "",
  stacking: "",
  busConnection: "",
  tapOffType: "",
  cableEntry: "",
  cableExit: "",
  cableTerminationType: "",
  metering: "",
  ctRequirement: "",
  ctType: "",
  controlType: "",
  indications: "",
};

/** Selected breaker row inside a section. */
export interface SelectedBreaker {
  breakerType: string;
  ratedCurrentA: string;
  breakingCapacityKA: string;
  mountingType: string;
  applicationTyp: string;
  dimensions: string;
  sNo: number;
  /** Manufacturer / series catalogue helpers (optional — depends on data source) */
  manufacturer?: string;
  series?: string;
  modelNumber?: string;
}

/** A line item selected for a non-breaker substep (enclosure, glastic, etc.). */
export interface SelectedComponentLine {
  /** Component PK from the backend catalogue. */
  componentId: string;
  /** Friendly part_number snapshot at selection time. */
  partNumber?: string;
  /** Friendly name snapshot. */
  name?: string;
  /** Snapshot of unit price at selection time. */
  unitPrice?: number;
  /** Selected quantity (default 1). */
  quantity: number;
  /** Per-line extra payload (e.g. user notes). */
  meta?: Record<string, unknown>;
}
