// Frontend optimistic quotation computation mirroring backend logic
// This should stay in sync with backend app/services/quotation_calc.py

export type LaborCategory = 'CU'|'ASM'|'CNT'|'QC'|'TST'|'ENG'|'CAD';
const CATS: LaborCategory[] = ['CU','ASM','CNT','QC','TST','ENG','CAD'];

export interface SectionLaborHoursPerUnit { CU:number; ASM:number; CNT:number; QC:number; TST:number; ENG:number; CAD:number; }
export interface SectionLineItem { desc:string; value:number; }
export interface SectionInput {
  id:string;
  description:string;
  unit_material_cost:number;
  qty:number;
  labor_hours_per_unit:SectionLaborHoursPerUnit;
  copper_weight_per_unit?:number;
  line_items?:SectionLineItem[];
}
export interface LookupRates {
  LBR_CU_rate:number; LBR_ASM_rate:number; LBR_CNT_rate:number; LBR_QC_rate:number; LBR_TST_rate:number; LBR_ENG_rate:number; LBR_CAD_rate:number;
}
export interface PricingStrategy { strategy:'DESIRED GM%'|'DESIRED PRICE'; desired_gm_pct?:number; desired_price?:number; roundup_factor:number; }

export interface QuoteInput {
  sections:SectionInput[];
  lookup:LookupRates;
  pricing:PricingStrategy;
}

export function roundup(value:number, factor:number){
  // New rule: always round DOWN to the nearest 10 regardless of factor passed
  const step = 10;
  if (!Number.isFinite(value) || step <= 0) return 0;
  const v2 = Math.round(value * 100) / 100; // stabilize floating point at 2 decimals
  return Math.floor(v2 / step) * step;
}

export interface ComputedQuoteResult {
  section_breakdown: any[];
  totals: { material_total:number; section_cost_total:number };
  labor_costs: Record<string,number>;
  labor_hours: Record<string,number>;
  adders_grouped: {desc:string; total:number}[];
  total_line_adders:number;
  total_cost:number;
  pricing:{ target_price:number; rounded_price:number; actual_profit:number; actual_gm:number; roundup_factor:number };
  copper_total:number;
}

export function computeQuoteOptimistic(input:QuoteInput): ComputedQuoteResult {
  const labor_costs:Record<string,number> = {}; CATS.forEach(c=>labor_costs[c]=0);
  const labor_hours:Record<string,number> = {}; CATS.forEach(c=>labor_hours[c]=0);
  let material_total=0; let section_cost_total=0; let copper_total=0;
  const section_breakdown = input.sections.map(sec=>{
    const qty = sec.qty;
    const matTotal = sec.unit_material_cost * qty;
    material_total += matTotal;
    const copper = (sec.copper_weight_per_unit||0) * qty; copper_total += copper;
    let laborSum=0; const perCat:Record<string, any> = {};
    CATS.forEach(cat=>{
      const hpu = (sec.labor_hours_per_unit as any)[cat] || 0;
      const hours = hpu * qty;
      const rate = (input.lookup as any)[`LBR_${cat}_rate`];
      const cost = hours * rate;
      perCat[cat] = { hours, cost, rate };
      labor_costs[cat] += cost; labor_hours[cat] += hours; laborSum += cost;
    });
    const sectionTotal = matTotal + laborSum;
    section_cost_total += sectionTotal;
    return { id:sec.id, description:sec.description, qty, material_total:matTotal, labor:perCat, section_total:sectionTotal, copper_total:copper };
  });

  const adders:Record<string,number> = {};
  input.sections.forEach(sec=>{
    (sec.line_items||[]).forEach(li=>{
      adders[li.desc] = (adders[li.desc]||0) + li.value;
    });
  });
  const adders_grouped = Object.entries(adders).map(([desc,total])=>({desc,total})).sort((a,b)=>a.desc.localeCompare(b.desc));
  const total_line_adders = adders_grouped.reduce((s,a)=>s+a.total,0);
  const total_cost = section_cost_total + total_line_adders;

  let target_price:number;
  if(input.pricing.strategy === 'DESIRED GM%'){
    target_price = total_cost / (1 - (input.pricing.desired_gm_pct || 0));
  } else {
    target_price = input.pricing.desired_price || total_cost;
  }
  const rounded_price = roundup(target_price, input.pricing.roundup_factor);
  const actual_profit = rounded_price - total_cost;
  const actual_gm = rounded_price ? actual_profit / rounded_price : 0;

  return {
    section_breakdown,
    totals:{ material_total, section_cost_total },
    labor_costs, labor_hours,
    adders_grouped, total_line_adders,
    total_cost,
    pricing:{ target_price, rounded_price, actual_profit, actual_gm, roundup_factor: input.pricing.roundup_factor },
    copper_total
  };
}

export async function fetchQuoteComputation(payload: any){
  const res = await fetch('/api/quotation/compute', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  if(!res.ok) throw new Error('Compute failed');
  return res.json();
}
