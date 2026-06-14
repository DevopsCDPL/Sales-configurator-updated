/**
 * partNumberEngine.ts — Universal (multi-manufacturer) catalog-number engine.
 *
 * "Universal" does NOT mean one format for all — each manufacturer numbers
 * its breakers differently. This engine holds one PACK per manufacturer, and
 * each pack encodes THAT manufacturer's own rules, so the number it emits
 * matches that manufacturer's catalogue scheme.
 *
 * Two pack modes:
 *   - 'positional'      builds a number position-by-position (Schneider — reuses
 *                        the verified decoder in data/schneiderDecoderData.ts).
 *   - 'lookup'          resolves a catalogue number from the already-vetted
 *                        in-app catalog data (Schneider + ABB Tmax/Emax2 1SDA).
 *   - 'reference-needed' pack not loaded — needs verified reference data before
 *                        any RFQ use. NEVER guesses a number.
 *
 * SAFETY: lookup packs only ever return numbers that already exist in the
 * shipped catalog data — they are not synthesised. Manufacturers without
 * loaded data are returned as `verified:false` so the UI/RFQ flow can refuse
 * to emit an unverified part number.
 */
import { buildCatalogNumber } from '../data/schneiderDecoderData';
import { CIRCUIT_BREAKER_V2_DATA } from '../data/circuitBreakerV2Data';
import { CIRCUIT_BREAKER_V2_ABB_ENTRIES } from '../data/circuitBreakerV2AbbData';

export type PnMode = 'positional' | 'lookup' | 'reference-needed';

export interface PnLookupCriteria {
  frameModel?: string;
  ratedCurrentA?: string | number;
  breakingCapacityKA?: string | number;
  numberOfPoles?: string;
  tripUnitType?: string;
}

export interface PnLookupResult {
  catalogueNumber: string;
  manufacturer: string;
  series?: string;
  frameModel?: string;
  ratedCurrentA?: string;
  breakingCapacityKA?: string;
  numberOfPoles?: string;
  description?: string;
}

export interface PnPack {
  id: string;
  name: string;
  mode: PnMode;
  /** true only when the pack rests on verified data (in-app catalog or your sheet). */
  verified: boolean;
  note?: string;
  buildPositional?: (selections: Record<string, string>) => string;
  lookup?: (criteria: PnLookupCriteria) => PnLookupResult[];
}

/** Minimal structural view of a catalog seed row (both data files share these). */
interface CbEntryLike {
  manufacturer?: string;
  seriesProductFamily?: string;
  frameModel?: string;
  ratedCurrentA?: string;
  breakingCapacityKA?: string;
  numberOfPoles?: string;
  tripUnitType?: string;
  catalogueNumber?: string;
  description?: string;
}

/** Normalise a value for forgiving matching: "1600A" / "1600 A" / 1600 → "1600". */
function norm(v?: string | number): string {
  return String(v ?? '').toLowerCase().replace(/[^0-9a-z.]/g, '');
}

function makeLookup(entries: CbEntryLike[], manufacturer: string) {
  return (c: PnLookupCriteria): PnLookupResult[] => {
    const want = {
      frame: norm(c.frameModel),
      amp: norm(c.ratedCurrentA),
      ka: norm(c.breakingCapacityKA),
      poles: norm(c.numberOfPoles),
      trip: norm(c.tripUnitType),
    };
    return entries
      .filter((e) => !!e.catalogueNumber)
      .filter((e) => {
        if (want.frame && norm(e.frameModel) !== want.frame) return false;
        if (want.amp && norm(e.ratedCurrentA) !== want.amp) return false;
        if (want.ka && norm(e.breakingCapacityKA) !== want.ka) return false;
        if (want.poles && norm(e.numberOfPoles) !== want.poles) return false;
        if (want.trip && !norm(e.tripUnitType).includes(want.trip)) return false;
        return true;
      })
      .map((e) => ({
        catalogueNumber: e.catalogueNumber as string,
        manufacturer,
        series: e.seriesProductFamily,
        frameModel: e.frameModel,
        ratedCurrentA: e.ratedCurrentA,
        breakingCapacityKA: e.breakingCapacityKA,
        numberOfPoles: e.numberOfPoles,
        description: e.description,
      }));
  };
}

const SCHNEIDER_ENTRIES = CIRCUIT_BREAKER_V2_DATA as unknown as CbEntryLike[];
const ABB_ENTRIES = CIRCUIT_BREAKER_V2_ABB_ENTRIES as unknown as CbEntryLike[];

export const PN_PACKS: PnPack[] = [
  {
    id: 'schneider',
    name: 'Schneider Electric',
    mode: 'positional',
    verified: true,
    note: 'Position-by-position builder (Masterpact NT/NW) + lookup over the in-app Schneider catalog.',
    buildPositional: (selections) => buildCatalogNumber(selections),
    lookup: makeLookup(SCHNEIDER_ENTRIES, 'Schneider Electric'),
  },
  {
    id: 'abb',
    name: 'ABB',
    mode: 'lookup',
    verified: true,
    note: 'Lookup over the in-app ABB catalog (Tmax XT + Emax2 1SDA).',
    lookup: makeLookup(ABB_ENTRIES, 'ABB'),
  },
  {
    id: 'siemens',
    name: 'Siemens',
    mode: 'reference-needed',
    verified: false,
    note: 'Siemens 3VA ordering-code pack not loaded — provide a verified reference before RFQ use.',
  },
  {
    id: 'eaton',
    name: 'Eaton',
    mode: 'reference-needed',
    verified: false,
    note: 'Eaton positional pack not loaded — provide a verified reference before RFQ use.',
  },
];

export function listManufacturers(): Array<Pick<PnPack, 'id' | 'name' | 'mode' | 'verified' | 'note'>> {
  return PN_PACKS.map((p) => ({ id: p.id, name: p.name, mode: p.mode, verified: p.verified, note: p.note }));
}

export function getPack(id: string): PnPack | null {
  return PN_PACKS.find((p) => p.id === id) || null;
}

/** Resolve catalogue numbers from a manufacturer's lookup pack ([] if none/unverified). */
export function lookupCatalogNumber(manufacturerId: string, criteria: PnLookupCriteria): PnLookupResult[] {
  const pack = getPack(manufacturerId);
  if (!pack || !pack.lookup) return [];
  return pack.lookup(criteria);
}

/** Schneider position-by-position build (passthrough to the verified decoder). */
export function buildSchneider(selections: Record<string, string>): string {
  return buildCatalogNumber(selections);
}
