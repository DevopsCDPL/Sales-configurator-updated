import { migrateV1toV2, hydrateV2, reducerV2, EMPTY_STATE_V2, defaultScopeFor } from '../state/stateV2';
let p=0,f=0; const ok=(n: string,c: boolean,d?: any)=>{ if(c)p++; else {f++; console.log('FAIL',n,d??'')} };
const v1 = {
  systemParameters: { systemVoltage: '480', mainBusRating: '2000' },
  section1: { definition: { sectionName: 'Main' }, selectedBreakers: [{ breakerType:'ACB', manufacturer:'Schneider', modelNumber:'NW20' }] },
  sections: { definitions: { 2: { sectionName: 'Feeders' } }, selectedBreakers: { 2: [{ breakerType:'MCCB', modelNumber:'NSX400' }] } },
  stepLines: { enclosure: [{ componentId:'e1', partNumber:'TPS-ENC', quantity:2, unitPrice:1800 }], spd_ats: [{ componentId:'s1', quantity:1 }] },
  stepNotes: { sld: 'note' },
};
const v2 = migrateV1toV2(v1);
ok('one board', v2.switchboards.length === 1);
const b = v2.switchboards[0];
ok('params carried', (b.boardParameters as any).mainBusRating === '2000');
ok('2 sections', b.sections.length === 2, b.sections.length);
ok('s1 breaker line', b.sections[0].deviceLines.length === 1 && b.sections[0].deviceLines[0].category === 'CIRCUIT BREAKER');
ok('s2 breaker', b.sections[1].deviceLines[0].partNumber === 'NSX400');
ok('stepLines flagged', b.componentLines.length === 2 && b.componentLines.every(l => l.meta?.migratedScope === true));
ok('enclosure mapped', b.componentLines.some(l => l.category === 'ENCLOSURE' && l.quantity === 2));
ok('notes carried', b.stepNotes.sld === 'note');
ok('v2 passthrough', hydrateV2(v2 as any).switchboards[0].id === b.id);
let s = reducerV2(EMPTY_STATE_V2, { type: 'addSwitchboard', payload: { name: 'PDU-1' } });
ok('add board', s.switchboards.length === 2 && s.activeSwitchboardIndex === 1);
s = reducerV2(s, { type: 'addSection', boardIndex: 1 });
ok('add section', s.switchboards[1].sections.length === 2);
for (let i=0;i<12;i++) s = reducerV2(s, { type: 'addSection', boardIndex: 1 });
ok('MAX_SECTIONS cap', s.switchboards[1].sections.length === 10, s.switchboards[1].sections.length);
s = reducerV2(s, { type: 'upsertLine', boardIndex: 1, line: { lineId:'', scope:'section', sectionIndex:1, category:'CIRCUIT BREAKER', quantity:1, priceStatus:'FIRM', source:'user' } as any });
ok('device line to section', s.switchboards[1].sections[0].deviceLines.length === 1);
s = reducerV2(s, { type: 'removeSection', boardIndex: 1, sectionIndex: 1 });
ok('orphaned device line preserved', s.switchboards[1].componentLines.some(l => l.meta?.orphanedFromSection === 1));
ok('section really gone', !s.switchboards[1].sections.some(x => x.sectionIndex === 1));
ok('scope defaults', defaultScopeFor('ENCLOSURE') === 'section' && defaultScopeFor('SPD') === 'board');
console.log(`stateV2: ${p} passed, ${f} failed`);
process.exit(f?1:0);
