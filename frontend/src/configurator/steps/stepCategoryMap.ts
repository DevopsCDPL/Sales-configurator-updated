/**
 * Substep → category-set mapping.
 *
 * Each configurator substep loads its candidate components by category
 * (path-style alias `/api/configurator/components/category/:category` is
 * supported; the frontend uses query-style `?category=` for compactness).
 *
 * `null` substeps (system_design, plus_comp, sld) are non-catalogue steps.
 */
import { COMPONENT_CATEGORIES } from '../lib/component-categories';
import type { ConfiguratorStepKey } from '../../services/configuratorService';

export interface StepCategoryMeta {
  /** Friendly substep title. */
  label: string;
  /** Short description rendered under the step header. */
  blurb: string;
  /**
   * Backend category strings consumed by `/components?category=…`.
   * Multiple values mean the picker concatenates listings.
   * `null` = non-catalogue step (renders a custom panel).
   */
  categories: string[] | null;
}

export const STEP_CATEGORY_MAP: Record<ConfiguratorStepKey, StepCategoryMeta> = {
  system_design: {
    label: 'System Design',
    blurb: 'Define switchboard topology, ratings, and per-section electrical/layout parameters.',
    categories: null,
  },
  enclosure: {
    label: 'Enclosure',
    blurb: 'Select the enclosure model that matches the switchboard footprint and IP rating.',
    categories: [COMPONENT_CATEGORIES.ENCLOSURE],
  },
  bussing: {
    label: 'Bussing',
    blurb: 'Pick bussing conductors, lugs, and supports. Live copper price is applied to costs.',
    categories: [COMPONENT_CATEGORIES.LUGS, COMPONENT_CATEGORIES.HARDWARE],
  },
  glastic: {
    label: 'Glastic',
    blurb: 'Choose glastic plates and barriers for insulation and segregation.',
    categories: [COMPONENT_CATEGORIES.GLASTIC],
  },
  cam_lock_panel: {
    label: 'Cam Lock Panel',
    blurb: 'Choose CAMLOCK connectors for portable/emergency power interfaces.',
    categories: [COMPONENT_CATEGORIES.CAMLOCK],
  },
  spd_ats: {
    label: 'SPD / ATS',
    blurb: 'Surge protection devices and automatic transfer switches.',
    categories: [COMPONENT_CATEGORIES.SPD, COMPONENT_CATEGORIES.ATS],
  },
  controls: {
    label: 'Controls',
    blurb: 'Pilot devices, relays, control circuits, indicator lights, switches.',
    categories: [COMPONENT_CATEGORIES.CONTROLS, COMPONENT_CATEGORIES.LIGHT, COMPONENT_CATEGORIES.SWITCH, COMPONENT_CATEGORIES.POWER_SUPPLY],
  },
  ct_vt_cpt: {
    label: 'CT / VT / CPT',
    blurb: 'Instrument transformers (current, voltage) and control power transformers.',
    categories: [COMPONENT_CATEGORIES.CURRENT_TRANSFORMER, COMPONENT_CATEGORIES.VOLTAGE_TRANSFORMER],
  },
  conduit_fittings: {
    label: 'Conduit & Fittings',
    blurb: 'Conduit runs, fittings, and accessories.',
    categories: [COMPONENT_CATEGORIES.CONDUIT],
  },
  wire_cable: {
    label: 'Wire & Cable',
    blurb: 'Internal wiring, terminations, and bundle hardware.',
    categories: [COMPONENT_CATEGORIES.WIRE_CABLE, COMPONENT_CATEGORIES.TERMINALS],
  },
  standard_bom: {
    label: 'Standard BOM',
    blurb: 'Standard products and shop-supplied items added by default.',
    categories: [COMPONENT_CATEGORIES.STANDARD_PRODUCT],
  },
  labour: {
    label: 'Labour',
    blurb: 'Labour line items (hours × rate). Backend computes labour from `labour` config.',
    categories: [COMPONENT_CATEGORIES.LABOR],
  },
  plus_comp: {
    label: '+ Comp',
    blurb: 'Free-form additional components, line adders, or one-off charges.',
    categories: null,
  },
  sld: {
    label: 'SLD',
    blurb: 'Single-line diagram notes & attachments.',
    categories: null,
  },
};
