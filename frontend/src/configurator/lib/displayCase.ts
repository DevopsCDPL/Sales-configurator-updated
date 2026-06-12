/**
 * displayCase — human-readable casing for legacy ALL-CAPS catalog strings.
 * compactSku  — strip leading zeros from the numeric part of a SKU code.
 */

const ACRONYMS = new Set([
  'UL','NEMA','SPD','ATS','CT','VT','CPT','CU','AL','LED','THHN','DLO','AWG','KCMIL','MCM',
  'LSI','LSIG','TMF','TMA','TM','MCCB','ACB','MCB','ERMS','RFQ','SQD','ABB','NW','NT','MTZ',
  'EO','MO','FTA','UTA','DC','AC','SKRU','MKII','CBCS','GEN','PRI','SEC','VA','KVA',
  'BRN','ORG','YEL','GRN','WHT','BLK','RED','BLU','POS','MISC','QC','TST','ENG','CAD',
  'ASM','CNT','LBR','HRDWR','FMC','FLXCOR','R&D','CB','VAC','VDC','SD','IO','IFE',
  'RS485','MM','MECH','COMP','ID','PDU','RPP',
]);

function caseToken(token: string): string {
  if (!token) return token;
  // Token contains a digit → keep verbatim
  if (/\d/.test(token)) return token;
  // Strip trailing punctuation to check acronym list, but preserve the punctuation
  const trailingPunct = token.match(/([^A-Za-z0-9&]+)$/);
  const trailing = trailingPunct ? trailingPunct[1] : '';
  const base = trailing ? token.slice(0, token.length - trailing.length) : token;
  if (ACRONYMS.has(base.toUpperCase())) return base.toUpperCase() + trailing;
  // First letter upper, rest lower
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() + trailing;
}

export function displayCase(input?: string | null): string {
  if (!input) return '';
  // Insert a space after commas that lack one, and after "/" where there's content
  const normalized = input.replace(/,(?=[^\s])/g, ', ');
  // Split on whitespace into tokens and apply casing
  const tokens = normalized.split(/\s+/);
  return tokens.map(caseToken).join(' ');
}

export function compactSku(pn?: string | null): string {
  if (!pn) return pn ?? '';
  const m = pn.match(/^([A-Za-z]+)-0*(\d+)$/);
  if (m) return `${m[1]}-${m[2]}`;
  return pn;
}
