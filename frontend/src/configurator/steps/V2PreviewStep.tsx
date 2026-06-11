/**
 * DesignerStep (file kept as V2PreviewStep.tsx for router stability)
 *
 * THE actual switchgear designer — persistence-backed:
 *   cards ⇄ DB switchboards · intake saved per board · accepted
 *   proposals write sections + device lines atomically · reopening a
 *   board rebuilds the SLD from what is stored. Refresh-safe.
 *
 * Still pending (next build steps): DB catalog candidates (bundled CB
 * data meanwhile), section detail editing, BOM/quote from Designer.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Typography, Stack, Chip, Button, Alert, CircularProgress, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import SwitchboardCardsScreen, { SwitchboardCardData } from './SwitchboardCardsScreen';
import IntakeStep from './IntakeStep';
import BomViewer from './BomViewer';
import QuotePanel from './QuotePanel';
import DrawingsPanel from './DrawingsPanel';
import PriceQueuePanel from './PriceQueuePanel';
import StandardsPanel from './StandardsPanel';
import CatalogManagerPanel from './CatalogManagerPanel';
import ComponentsPanel from './ComponentsPanel';
import DeviceListPanel from './DeviceListPanel';
import { CIRCUIT_BREAKER_V2_DATA } from '../data/circuitBreakerV2Data';
import type { CandidateDevice, LineupProposal, IntakeInput } from '../lib/lineup-proposal';
import { generateSld, SldDevice } from '../lib/sld-generator';
import type { SectionRole } from '../lib/safety-rules';
import { useConfigurator } from '../state/ConfiguratorProvider';
import configuratorV2Service, { FullBoard, SwitchboardRow, CatalogCb } from '../../services/configuratorV2Service';

const C = {
  bg: '#0D0D14', surface: '#13131E', border: '#1E2235', blue: '#1976D2',
  text: '#E2E8F0', sub: '#64748B', amber: '#D97706', green: '#22C55E', red: '#EF4444',
};

/* candidate provider over bundled catalog (until DB catalog import) */
function providerFromList(parsed: CandidateDevice[]) {
  return (q: { role: SectionRole; designCurrentA: number; sccrKA: number; poles: number }) => {
    const wantClass = q.role === 'FEEDER' ? ['MCCB', 'MCB'] : ['ACB', 'ICCB'];
    let pool = parsed.filter((c) => c.ratedA >= q.designCurrentA && wantClass.includes(c.deviceClass));
    const kaOk = pool.filter((c) => c.interruptingKA >= q.sccrKA);
    if (kaOk.length) pool = kaOk;
    if (!pool.length) pool = parsed.filter((c) => c.ratedA >= q.designCurrentA);
    return pool.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.ratedA - b.ratedA).slice(0, 8);
  };
}

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

  return providerFromList(parsed);
}

function rowToCard(b: SwitchboardRow, sectionCount?: number): SwitchboardCardData {
  const bd = b.board_data || {};
  return {
    id: b.id,
    name: b.name,
    boardType: b.board_type ?? 'SWITCHBOARD_UL891',
    status: b.status,
    voltageSystem: bd.voltageSystemCode ?? null,
    mainBusRatingA: Number(bd.mainBusRating) || null,
    sccrKA: Number(bd.shortCircuitRating) || null,
    sectionCount: sectionCount ?? (Number(bd.sectionCount) || 1),
    drawingsStatus: b.drawings_status ?? 'none',
    updatedAt: b.updated_at,
  };
}

/** Rebuild SLD input from PERSISTED rows — refresh-safe rendering. */
function sldFromFull(full: FullBoard): { svg: string } | null {
  const bd = full.board.board_data || {};
  const deviceLines = full.lines.filter((l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER');
  if (!deviceLines.length) return null;
  const mains = deviceLines.filter((l) => l.meta?.role === 'MAIN');
  const devices: SldDevice[] = deviceLines.map((l) => ({
    designation: l.meta?.designation ?? '?',
    role: (l.meta?.role ?? 'FEEDER') as SectionRole,
    ratingA: Number(l.meta?.ratedA) || null,
    frameModel: l.meta?.frameModel ?? l.name ?? undefined,
    sectionIndex: Number(l.meta?.sectionIndex) || 1,
    busSegment: l.meta?.role === 'MAIN' && l.meta?.designation === 'M2' ? 1 : 0,
  }));
  const twoSeg = mains.length >= 2;
  const { svg } = generateSld({
    title: full.board.name,
    configCode: 'Saved design',
    voltageSystem: bd.voltageSystemCode ?? '—',
    mainBusRatingA: Number(bd.mainBusRating) || null,
    sccrKA: Number(bd.shortCircuitRating) || null,
    devices,
    busSegments: twoSeg ? 2 : 1,
  });
  return { svg };
}

const V2PreviewStep: React.FC = () => {
  const { configuration } = useConfigurator();
  const configurationId = configuration?.id ?? null;
  const [catalogCbs, setCatalogCbs] = useState<CatalogCb[] | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<{ count: number; withPrice: number } | null>(null);
  const [importing, setImporting] = useState(false);

  const provider = useMemo(() => {
    if (catalogCbs && catalogCbs.length > 0) {
      return providerFromList(catalogCbs.map((c) => ({ ...c, frameModel: c.frameModel ?? '', manufacturer: c.manufacturer ?? '' } as CandidateDevice)));
    }
    return makeCandidateProvider();
  }, [catalogCbs]);

  const refreshCatalog = useCallback(async () => {
    try {
      const status = await configuratorV2Service.catalogStatus();
      setCatalogStatus(status);
      if (status.count > 0) setCatalogCbs(await configuratorV2Service.catalogCbs());
    } catch { /* fall back to bundled silently */ }
  }, []);

  const importCatalog = async () => {
    setImporting(true);
    try {
      const out = await configuratorV2Service.catalogImportBundled();
      setToast('Catalog imported - ' + out.total + ' breakers in database');
      await refreshCatalog();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Catalog import failed');
    } finally {
      setImporting(false);
    }
  };

  const [boards, setBoards] = useState<SwitchboardRow[]>([]);
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});
  const [loadable, setLoadable] = useState<SwitchboardRow[]>([]);
  const [openBoard, setOpenBoard] = useState<FullBoard | null>(null);
  const FLOW_STEPS = [
    ['system', 'System Design'],
    ['sections', 'Section Design'],
    ['components', 'Components'],
    ['sld', 'SLD'],
    ['elevation', 'Elevation'],
    ['bom', 'Bill of Materials'],
    ['quote', 'Quote'],
    ['drawings', 'Drawings'],
  ] as const;
  type FlowKey = typeof FLOW_STEPS[number][0];
  const [boardView, setBoardView] = useState<FlowKey>('system');
  const [coDialog, setCoDialog] = useState(false);
  const [coReason, setCoReason] = useState('');
  const [coOrigin, setCoOrigin] = useState<'internal' | 'customer'>('internal');
  const [homeView, setHomeView] = useState<'boards' | 'catalog' | 'prices' | 'standards'>('boards');
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!configurationId) return;
    setLoading(true);
    setError(null);
    try {
      const [mine, all] = await Promise.all([
        configuratorV2Service.listBoards(configurationId),
        configuratorV2Service.listAllBoards(),
      ]);
      setLoadable(all);
      if (!mine.length) {
        const created = await configuratorV2Service.createBoard(configurationId, 'Switchboard 1');
        setBoards([created]);
      } else {
        setBoards(mine);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load switchboards');
    } finally {
      setLoading(false);
    }
  }, [configurationId]);

  useEffect(() => { reload(); refreshCatalog(); }, [reload, refreshCatalog]);

  const openById = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const full = await configuratorV2Service.getFull(id);
      setOpenBoard(full);
      setBoardView('system');
      setSectionCounts((m) => ({ ...m, [id]: full.sections.length || 1 }));
      setSvg(sldFromFull(full)?.svg ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to open switchboard');
    } finally {
      setBusy(false);
    }
  };

  const saveIntake = async (intake: IntakeInput) => {
    if (!openBoard) return;
    setBusy(true);
    try {
      const updated = await configuratorV2Service.patchBoard(openBoard.board.id, { intake });
      setOpenBoard({ ...openBoard, board: updated });
      setBoards((bs) => bs.map((b) => (b.id === updated.id ? updated : b)));
      setToast('Intake saved');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const acceptProposal = async (proposal: LineupProposal, intake: IntakeInput) => {
    if (!openBoard) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        intake,
        boardPatch: { ...proposal.boardPatch, totalFeederLoadA: proposal.totalFeederLoadA },
        sections: proposal.sections.map((s) => ({
          sectionIndex: s.sectionIndex,
          role: s.role,
          frame: s.frame as any,
          usedHeightIn: s.usedHeightIn,
          remainingHeightIn: s.remainingHeightIn,
          devices: s.devices.map((d) => ({
            designation: d.designation,
            role: d.role,
            partNumber: d.device?.partNumber,
            manufacturer: d.device?.manufacturer,
            frameModel: d.device?.frameModel,
            ratedA: d.device?.ratedA ?? d.recommendedRatingA,
            poles: d.device?.poles ?? 3,
            mounting: d.device?.mounting ?? 'Fixed',
            interruptingKA: d.device?.interruptingKA,
            price: d.device?.price ?? null,
            priceStatus: d.device?.priceStatus ?? 'PENDING_RFQ',
            componentId: d.device?.componentId,
          })),
        })),
      };
      const full = await configuratorV2Service.applyProposal(openBoard.board.id, payload);
      setOpenBoard({ board: full.board, sections: full.sections, lines: full.lines });
      setBoards((bs) => bs.map((b) => (b.id === full.board.id ? full.board : b)));
      setSectionCounts((m) => ({ ...m, [full.board.id]: full.sections.length }));
      setSvg(sldFromFull({ board: full.board, sections: full.sections, lines: full.lines })?.svg ?? null);
      setToast('Line-up saved to database — ' + full.sections.length + ' section(s)');
      setBoardView('sections');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Apply failed');
    } finally {
      setBusy(false);
    }
  };

  const cards = boards.map((b) => rowToCard(b, sectionCounts[b.id]));

  if (!configurationId) {
    return (
      <Box sx={{ p: 4, bgcolor: C.bg }}>
        <Typography sx={{ color: C.sub, fontSize: 13 }}>
          Open or create a configuration (CFG) first — the Designer attaches switchboards to it.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: C.bg, minHeight: 400 }}>
      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{ m: 2, mb: 0, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}
        >
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 3, pt: 2 }}>
        {catalogStatus && catalogStatus.count > 0 ? (
          <Chip
            size="small"
            label={'Catalog: ' + catalogStatus.count + ' breakers in database (' + catalogStatus.withPrice + ' priced)'}
            sx={{ bgcolor: 'transparent', border: '1px solid ' + C.green, color: C.green, fontSize: 11, height: 22 }}
          />
        ) : (
          <>
            <Chip
              size="small"
              label="Catalog: bundled fallback (not in database)"
              sx={{ bgcolor: 'transparent', border: '1px solid ' + C.amber, color: C.amber, fontSize: 11, height: 22 }}
            />
            <Button
              size="small"
              disabled={importing}
              onClick={importCatalog}
              sx={{ color: C.blue, textTransform: 'none', fontSize: 12, border: '1px solid ' + C.border }}
            >
              {importing ? 'Importing...' : 'Import 308 breakers to database'}
            </Button>
          </>
        )}
      </Stack>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={26} sx={{ color: C.blue }} />
          <Typography sx={{ color: C.sub, fontSize: 12, mt: 1.5 }}>Loading switchboards…</Typography>
        </Stack>
      ) : !openBoard ? (
        <Box>
          <Stack direction="row" spacing={1} sx={{ px: 3, pt: 1.5 }} alignItems="center">
            {homeView !== 'boards' ? (
              <Button size="small" onClick={() => setHomeView('boards')}
                sx={{ color: C.sub, textTransform: 'none', fontSize: 12, border: '1px solid ' + C.border }}>
                ← Boards
              </Button>
            ) : (
              <Typography sx={{ color: C.sub, fontSize: 11, letterSpacing: 0.5 }}>LIBRARY:</Typography>
            )}
            {([['catalog', 'Catalog'], ['prices', 'Awaiting price'], ['standards', 'Standards']] as const).map(([key, label]) => (
              <Button
                key={key}
                size="small"
                onClick={() => setHomeView(key)}
                sx={{
                  textTransform: 'none', fontSize: 11.5, px: 1, minWidth: 0,
                  color: homeView === key ? '#00c8ff' : C.sub,
                  bgcolor: 'transparent',
                  border: 'none',
                  textDecoration: homeView === key ? 'none' : 'underline',
                  textUnderlineOffset: '3px',
                  '&:hover': { color: '#00c8ff', bgcolor: 'transparent' },
                }}
              >
                {label}
              </Button>
            ))}
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              onClick={async () => {
                try {
                  if (configurationId) await configuratorV2Service.downloadProposalPdf(configurationId);
                } catch (e: any) {
                  setError(e?.response?.status === 422
                    ? 'No issued quotations yet — open a board, go to Quote and issue first.'
                    : (e?.response?.data?.error ?? 'Proposal generation failed'));
                }
              }}
              sx={{
                textTransform: 'none', fontSize: 12, px: 1.5, color: '#fff',
                bgcolor: C.green, fontWeight: 700, '&:hover': { bgcolor: '#16A34A' },
              }}
            >
              Client proposal (PDF)
            </Button>
          </Stack>
          {homeView === 'catalog' ? (
            <CatalogManagerPanel />
          ) : homeView === 'prices' ? (
            <PriceQueuePanel />
          ) : homeView === 'standards' ? (
            <StandardsPanel />
          ) : (
        <SwitchboardCardsScreen
          boards={cards}
          loadableBoards={loadable.map((b) => ({
            id: b.id,
            name: b.name,
            project: b.configuration_id === configurationId ? 'This configuration' : 'Other configuration',
          }))}
          onOpen={openById}
          onCreateNew={async (name) => {
            const created = await configuratorV2Service.createBoard(configurationId, name);
            setBoards((bs) => [...bs, created]);
          }}
          onLoadFrom={async (srcId, name) => {
            const created = await configuratorV2Service.createBoard(configurationId, name, srcId);
            setBoards((bs) => [...bs, created]);
            setToast('Configuration cloned with all sections and components');
          }}
          onRename={async (id, name) => {
            const updated = await configuratorV2Service.patchBoard(id, { name });
            setBoards((bs) => bs.map((b) => (b.id === id ? updated : b)));
          }}
          onDuplicate={async (id) => {
            const src = boards.find((b) => b.id === id);
            const created = await configuratorV2Service.createBoard(
              configurationId,
              (src?.name ?? 'Switchboard') + ' (copy)',
              id
            );
            setBoards((bs) => [...bs, created]);
          }}
          onDelete={async (id) => {
            try {
              await configuratorV2Service.deleteBoard(id);
              setBoards((bs) => bs.filter((b) => b.id !== id));
            } catch (e: any) {
              setError(e?.response?.data?.error ?? 'Delete failed');
            }
          }}
        />
          )}
        </Box>
      ) : (
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 3, pt: 2 }}>
            <Button
              size="small"
              onClick={() => { setOpenBoard(null); setSvg(null); }}
              sx={{ color: C.sub, textTransform: 'none', border: '1px solid ' + C.border }}
            >
              ← Boards
            </Button>
            <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15 }}>
              {openBoard.board.name}
            </Typography>
            <Chip
              label={openBoard.sections.length ? 'saved — ' + openBoard.sections.length + ' section(s)' : 'draft'}
              size="small"
              sx={{
                bgcolor: 'transparent', fontSize: 10.5, height: 20,
                border: '1px solid ' + (openBoard.sections.length ? C.green : C.border),
                color: openBoard.sections.length ? C.green : C.sub,
              }}
            />
            {openBoard.board.status === 'locked' && (
              <>
                <Chip label="design frozen" size="small"
                  sx={{ bgcolor: 'transparent', border: '1px solid ' + C.amber, color: C.amber, fontSize: 10.5, height: 20 }} />
                <Button size="small" onClick={() => { setCoDialog(true); setCoReason(''); }}
                  sx={{ color: C.amber, textTransform: 'none', fontSize: 11.5, border: '1px solid ' + C.border }}>
                  Raise change order
                </Button>
              </>
            )}
            {busy && <CircularProgress size={14} sx={{ color: C.blue }} />}
          </Stack>

          <Dialog open={coDialog} onClose={() => setCoDialog(false)} maxWidth="sm" fullWidth
            PaperProps={{ sx: { bgcolor: C.surface, border: '1px solid ' + C.border, backgroundImage: 'none' } }}>
            <DialogTitle sx={{ color: C.text, fontSize: 15, fontWeight: 700 }}>
              Raise change order — {openBoard.board.name}
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ color: C.sub, fontSize: 12, mb: 1.5 }}>
                This design is frozen because its quote was accepted. A change order reopens it for
                editing with a full audit trail — the next issued revision is linked to this change order.
              </Typography>
              <TextField
                autoFocus fullWidth multiline minRows={2} placeholder="Reason (required) — what changed and why"
                value={coReason} onChange={(e) => setCoReason(e.target.value)}
                sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: C.bg, color: C.text, fontSize: 13, '& fieldset': { borderColor: C.border } }, '& textarea': { color: C.text } }}
              />
              <Stack direction="row" spacing={1}>
                {(['internal', 'customer'] as const).map((o) => (
                  <Button key={o} size="small" onClick={() => setCoOrigin(o)}
                    sx={{
                      textTransform: 'none', fontSize: 11.5,
                      color: coOrigin === o ? '#fff' : C.sub,
                      bgcolor: coOrigin === o ? C.blue : 'transparent',
                      border: '1px solid ' + (coOrigin === o ? C.blue : C.border),
                    }}>
                    {o === 'internal' ? 'Internal change' : 'Customer requested'}
                  </Button>
                ))}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCoDialog(false)} sx={{ color: C.sub, textTransform: 'none' }}>Cancel</Button>
              <Button
                disabled={coReason.trim().length < 5 || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await configuratorV2Service.raiseChangeOrder(openBoard.board.id, { reason: coReason.trim(), origin: coOrigin });
                    const full = await configuratorV2Service.getFull(openBoard.board.id);
                    setOpenBoard(full);
                    setCoDialog(false);
                    setToast('Change order raised — design unlocked for editing');
                  } catch (e: any) {
                    setError(e?.response?.data?.error ?? 'Change order failed');
                  } finally {
                    setBusy(false);
                  }
                }}
                sx={{ bgcolor: C.amber, color: '#1A1206', textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: '#B45309' } }}>
                Unlock design
              </Button>
            </DialogActions>
          </Dialog>

          {/* ── Engineering flow chips (old strip style: black/grey/sky-blue) ── */}
          {(() => {
            const accepted = openBoard.sections.length > 0;
            const idx = FLOW_STEPS.findIndex(([k]) => k === boardView);
            const enabled = (k: FlowKey) => k === 'system' || accepted;
            return (
              <Box sx={{ px: 3, pt: 1.5 }}>
                <Box sx={{
                  display: 'flex', gap: 0.75, overflowX: 'auto', alignItems: 'center',
                  pb: 1, borderBottom: '1px solid rgba(255,255,255,0.04)',
                  '&::-webkit-scrollbar': { height: 0 },
                }}>
                  {FLOW_STEPS.map(([key, label], i) => {
                    const active = boardView === key;
                    const ok = enabled(key);
                    const accent = '#00c8ff';
                    return (
                      <Chip
                        key={key}
                        size="small"
                        label={(i + 1) + '. ' + label}
                        onClick={() => ok && setBoardView(key)}
                        sx={{
                          flexShrink: 0,
                          cursor: ok ? 'pointer' : 'not-allowed',
                          opacity: ok ? 1 : 0.35,
                          fontWeight: active ? 700 : 500,
                          fontSize: '0.745rem', height: 28, px: 0.5,
                          border: '1px solid ' + (active ? accent : 'rgba(255,255,255,0.07)'),
                          bgcolor: active ? accent : 'transparent',
                          color: active ? '#06151c' : 'rgba(217,228,251,0.78)',
                          borderRadius: '8px',
                          '& .MuiChip-label': { px: 1 },
                          '&:hover': ok ? {
                            bgcolor: active ? accent : 'rgba(255,255,255,0.05)',
                            borderColor: active ? accent : 'rgba(255,255,255,0.16)',
                          } : {},
                        }}
                      />
                    );
                  })}
                  <Box sx={{ flex: 1 }} />
                  <Button
                    size="small" disabled={idx <= 0}
                    onClick={() => setBoardView(FLOW_STEPS[idx - 1][0])}
                    sx={{ flexShrink: 0, color: C.sub, textTransform: 'none', fontSize: 11.5, minWidth: 0, border: '1px solid ' + C.border }}
                  >
                    ← Back
                  </Button>
                  <Button
                    size="small"
                    disabled={idx >= FLOW_STEPS.length - 1 || !enabled(FLOW_STEPS[idx + 1][0])}
                    onClick={() => setBoardView(FLOW_STEPS[idx + 1][0])}
                    sx={{
                      flexShrink: 0, textTransform: 'none', fontSize: 11.5, fontWeight: 700, minWidth: 0,
                      color: '#06151c', bgcolor: '#00c8ff', px: 1.5,
                      '&:hover': { bgcolor: '#33d4ff' },
                      '&.Mui-disabled': { bgcolor: 'rgba(0,200,255,0.15)', color: 'rgba(6,21,28,0.5)' },
                    }}
                  >
                    Next →
                  </Button>
                </Box>
                {!accepted && (
                  <Typography sx={{ color: C.sub, fontSize: 11, mt: 0.75 }}>
                    Steps 2–8 unlock after you propose and accept a line-up in System Design.
                  </Typography>
                )}
              </Box>
            );
          })()}

          {boardView === 'system' ? (
            <IntakeStep
              key={openBoard.board.id}
              initial={(openBoard.board.intake as Partial<IntakeInput>) ?? undefined}
              candidateProvider={provider}
              onSaveIntake={saveIntake}
              onAcceptProposal={acceptProposal}
            />
          ) : boardView === 'sections' ? (
            <Box sx={{ pt: 1 }}>
              <DeviceListPanel
                lines={openBoard.lines}
                catalogCbs={catalogCbs}
                sccrKA={Number(openBoard.board.board_data?.shortCircuitRating) || 65}
                locked={openBoard.board.status === 'locked'}
                onSwapped={async () => {
                  const full = await configuratorV2Service.getFull(openBoard.board.id);
                  setOpenBoard(full);
                  setSvg(sldFromFull(full)?.svg ?? null);
                  setToast('Device swapped — cost updated, quote flagged for review');
                }}
              />
            </Box>
          ) : boardView === 'sld' ? (
            <Box sx={{ px: 3, pb: 4, pt: 1 }}>
              <Typography sx={{ color: '#CBD5E1', fontSize: 13.5, fontWeight: 600, mb: 1 }}>
                One-Line Diagram (from saved design)
              </Typography>
              {svg ? (
                <Box
                  sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', p: 2, overflowX: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <Typography sx={{ color: C.sub, fontSize: 12.5 }}>No saved design yet.</Typography>
              )}
            </Box>
          ) : boardView === 'elevation' ? (
            <Box sx={{ px: 3, pb: 4, pt: 1 }}>
              <Typography sx={{ color: '#CBD5E1', fontSize: 13.5, fontWeight: 600, mb: 1 }}>
                Front Elevation (estimate only)
              </Typography>
              <Box sx={{ bgcolor: C.surface, border: '1px dashed ' + C.border, borderRadius: '10px', p: 4, textAlign: 'center' }}>
                <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
                  Parametric elevation drawing is being built next — it will render here from the saved frames and device layout.
                </Typography>
              </Box>
            </Box>
          ) : boardView === 'components' ? (
            <ComponentsPanel
              key={'comp-' + openBoard.board.id}
              board={openBoard}
              onLinesChanged={(lines) => setOpenBoard((ob) => (ob ? { ...ob, lines } : ob))}
            />
          ) : boardView === 'bom' ? (
            <BomViewer key={'bom-' + openBoard.board.id} switchboardId={openBoard.board.id} />
          ) : boardView === 'quote' ? (
            <QuotePanel key={'quote-' + openBoard.board.id} switchboardId={openBoard.board.id} />
          ) : (
            <DrawingsPanel key={'dwg-' + openBoard.board.id} switchboardId={openBoard.board.id} />
          )}
        </Box>
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default V2PreviewStep;
