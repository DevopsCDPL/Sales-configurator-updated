/**
 * V2PreviewStep — flag-gated sandbox for the V2 spine (Phases A–C demo).
 *
 * Visible ONLY when the URL contains ?v2=1 (persisted to localStorage
 * key cfg_v2 for the session). The client never sees this tab.
 *
 * Everything runs client-side: switchboard cards → requirements intake
 * (paste-from-Excel) → greedy line-up proposal → generated SLD.
 * NOTHING is persisted — refresh resets. Candidate breakers come from
 * the bundled catalog data (until the DB catalog migration lands).
 */
import React, { useMemo, useState } from 'react';
import { Box, Typography, Stack, Chip, Button, Alert } from '@mui/material';
import SwitchboardCardsScreen, { SwitchboardCardData } from './SwitchboardCardsScreen';
import IntakeStep from './IntakeStep';
import { CIRCUIT_BREAKER_V2_DATA } from '../data/circuitBreakerV2Data';
import type { CandidateDevice, LineupProposal } from '../lib/lineup-proposal';
import { generateSld } from '../lib/sld-generator';
import type { SectionRole } from '../lib/safety-rules';

const C = {
  bg: '#0D0D14', surface: '#13131E', border: '#1E2235', blue: '#1976D2',
  text: '#E2E8F0', sub: '#64748B', amber: '#D97706', green: '#22C55E',
};

/** Show the V2 preview only for ?v2=1 visitors (sticky via localStorage). */
export function isV2PreviewEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('v2') === '1') {
      window.localStorage.setItem('cfg_v2', '1');
      return true;
    }
    if (params.get('v2') === '0') {
      window.localStorage.removeItem('cfg_v2');
      return false;
    }
    return window.localStorage.getItem('cfg_v2') === '1';
  } catch {
    return false;
  }
}

/** Candidate provider over the bundled CB catalog (lenient demo parsing). */
function makeCandidateProvider() {
  const parsed: CandidateDevice[] = (CIRCUIT_BREAKER_V2_DATA as any[]).map((e: any, i: number) => {
    const ratedA = parseInt(String(e.ratedCurrentA), 10) || 0;
    const kA = parseInt(String(e.breakingCapacityKA), 10) || 0;
    const price = Number(String(e.price).replace(/[^0-9.]/g, '')) || null;
    const cls = String(e.breakerType || '').toUpperCase();
    return {
      componentId: `demo-${i}`,
      partNumber: e.catalogueNumber || e.frameModel || `CB-${i}`,
      manufacturer: String(e.manufacturer || '').replace(/_/g, ' '),
      frameModel: e.frameModel || '',
      ratedA,
      interruptingKA: kA,
      poles: parseInt(String(e.numberOfPoles), 10) || 3,
      mounting: /draw/i.test(String(e.mountingType)) ? 'Drawout' : 'Fixed',
      pctRated: 80,
      deviceClass: (['ACB', 'ICCB', 'MCCB', 'MCB'].includes(cls) ? cls : 'MCCB') as CandidateDevice['deviceClass'],
      heightIn: cls === 'ACB' ? 20 : 8,
      widthIn: cls === 'ACB' ? 16 : 7,
      depthIn: cls === 'ACB' ? 14 : 6,
      price,
      priceStatus: price ? 'FIRM' : 'PENDING_RFQ',
    } as CandidateDevice;
  }).filter((c: CandidateDevice) => c.ratedA > 0);

  return (q: { role: SectionRole; designCurrentA: number; sccrKA: number; poles: number }) => {
    const wantClass = q.role === 'FEEDER' ? ['MCCB', 'MCB'] : ['ACB', 'ICCB'];
    let pool = parsed.filter(
      (c) => c.ratedA >= q.designCurrentA && wantClass.includes(c.deviceClass)
    );
    // demo leniency: ignore kA shortfalls if nothing matches (IEC data, US ratings pending)
    const kaOk = pool.filter((c) => c.interruptingKA >= q.sccrKA);
    if (kaOk.length) pool = kaOk;
    if (!pool.length) {
      pool = parsed.filter((c) => c.ratedA >= q.designCurrentA);
    }
    return pool.sort((a, b) => a.ratedA - b.ratedA).slice(0, 5);
  };
}

let demoSeq = 2;

const V2PreviewStep: React.FC = () => {
  const provider = useMemo(makeCandidateProvider, []);
  const [boards, setBoards] = useState<SwitchboardCardData[]>([
    {
      id: 'demo-1', name: 'Switchboard 1', boardType: 'SWITCHBOARD_UL891', status: 'draft',
      voltageSystem: null, mainBusRatingA: null, sccrKA: null, sectionCount: 1, drawingsStatus: 'none',
    },
  ]);
  const [openBoardId, setOpenBoardId] = useState<string | null>(null);
  const [result, setResult] = useState<{ proposal: LineupProposal; svg: string } | null>(null);

  const patchBoard = (id: string, p: Partial<SwitchboardCardData>) =>
    setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)));

  const onAccept = (proposal: LineupProposal) => {
    const devices = proposal.sections.flatMap((s) =>
      s.devices.map((d) => ({
        designation: d.designation,
        role: d.role,
        ratingA: d.device?.ratedA ?? d.recommendedRatingA,
        frameModel: d.device?.frameModel,
        sectionIndex: s.sectionIndex,
        busSegment: d.role === 'MAIN' && d.designation === 'M2' ? 1 : 0,
      }))
    );
    const { svg } = generateSld({
      title: boards.find((b) => b.id === openBoardId)?.name ?? 'Switchboard',
      configCode: 'V2 PREVIEW (not saved)',
      voltageSystem: proposal.boardPatch.voltageSystemCode,
      mainBusRatingA: proposal.boardPatch.mainBusRatingA,
      sccrKA: proposal.boardPatch.sccrKA,
      devices,
      busSegments: devices.some((d) => d.busSegment === 1) ? 2 : 1,
    });
    setResult({ proposal, svg });
    if (openBoardId) {
      patchBoard(openBoardId, {
        voltageSystem: proposal.boardPatch.voltageSystemCode,
        mainBusRatingA: proposal.boardPatch.mainBusRatingA,
        sccrKA: proposal.boardPatch.sccrKA,
        sectionCount: proposal.sections.length,
        status: 'complete',
      });
    }
  };

  return (
    <Box sx={{ bgcolor: C.bg, minHeight: 400 }}>
      <Alert
        severity="info"
        sx={{
          m: 2, mb: 0, bgcolor: 'rgba(25,118,210,0.08)', color: '#CBD5E1',
          border: `1px solid ${C.border}`, fontSize: 12,
        }}
      >
        DESIGNER (build in progress) — intake, line-up proposal and SLD run live; persistence
        to the database is the next build step, so refresh still resets. Breaker candidates come from
        the bundled catalog until the DB catalog import lands.
      </Alert>

      {!openBoardId && (
        <SwitchboardCardsScreen
          boards={boards}
          loadableBoards={boards.map((b) => ({ id: b.id, name: b.name, project: 'This project' }))}
          onOpen={(id) => { setOpenBoardId(id); setResult(null); }}
          onCreateNew={(name) => {
            const id = `demo-${++demoSeq}`;
            setBoards((bs) => [...bs, {
              id, name, boardType: 'SWITCHBOARD_UL891', status: 'draft',
              voltageSystem: null, mainBusRatingA: null, sccrKA: null,
              sectionCount: 1, drawingsStatus: 'none',
            }]);
          }}
          onLoadFrom={(srcId, name) => {
            const src = boards.find((b) => b.id === srcId);
            if (!src) return;
            const id = `demo-${++demoSeq}`;
            setBoards((bs) => [...bs, { ...src, id, name, status: 'draft' }]);
          }}
          onRename={(id, name) => patchBoard(id, { name })}
          onDuplicate={(id) => {
            const src = boards.find((b) => b.id === id);
            if (!src) return;
            const nid = `demo-${++demoSeq}`;
            setBoards((bs) => [...bs, { ...src, id: nid, name: `${src.name} (copy)` }]);
          }}
          onDelete={(id) => setBoards((bs) => bs.filter((b) => b.id !== id))}
        />
      )}

      {openBoardId && (
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 3, pt: 2 }}>
            <Button
              size="small"
              onClick={() => { setOpenBoardId(null); setResult(null); }}
              sx={{ color: C.sub, textTransform: 'none', border: `1px solid ${C.border}` }}
            >
              ← Boards
            </Button>
            <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15 }}>
              {boards.find((b) => b.id === openBoardId)?.name}
            </Typography>
            <Chip label="sandbox — not saved" size="small"
              sx={{ bgcolor: 'transparent', border: `1px solid ${C.amber}`, color: C.amber, fontSize: 10.5, height: 20 }} />
          </Stack>

          <IntakeStep
            candidateProvider={provider}
            onSaveIntake={() => { /* sandbox: nothing persisted */ }}
            onAcceptProposal={onAccept}
          />

          {result && (
            <Box sx={{ px: 3, pb: 4 }}>
              <Typography sx={{ color: '#CBD5E1', fontSize: 13.5, fontWeight: 600, mb: 1 }}>
                Generated One-Line Diagram
              </Typography>
              <Box
                sx={{
                  bgcolor: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px',
                  p: 2, overflowX: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: result.svg }}
              />
              <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
                <Typography sx={{ color: C.sub, fontSize: 12 }}>
                  Total load {result.proposal.totalFeederLoadA} A • Bus {result.proposal.boardPatch.mainBusRatingA ?? '—'} A •
                  SCCR {result.proposal.boardPatch.sccrKA} kA • {result.proposal.sections.length} section(s)
                </Typography>
                {result.proposal.boardPatch.sccrAssumed && (
                  <Typography sx={{ color: C.amber, fontSize: 12 }}>SCCR assumed — verify utility fault data</Typography>
                )}
              </Stack>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default V2PreviewStep;
