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
import { Box, Typography, Stack, Chip, Button, Alert, CircularProgress, Snackbar } from '@mui/material';
import SwitchboardCardsScreen, { SwitchboardCardData } from './SwitchboardCardsScreen';
import IntakeStep from './IntakeStep';
import BomViewer from './BomViewer';
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
    return pool.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.ratedA - b.ratedA).slice(0, 5);
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
  const [boardView, setBoardView] = useState<'design' | 'bom'>('design');
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
      setBoardView('design');
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
            {busy && <CircularProgress size={14} sx={{ color: C.blue }} />}
          </Stack>

          {openBoard.sections.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ px: 3, pt: 1.5 }}>
              {([['design', 'Design'], ['bom', 'Bill of Materials']] as const).map(([key, label]) => (
                <Button
                  key={key}
                  size="small"
                  onClick={() => setBoardView(key)}
                  sx={{
                    textTransform: 'none', fontSize: 12, px: 1.5,
                    color: boardView === key ? '#fff' : C.sub,
                    bgcolor: boardView === key ? C.blue : 'transparent',
                    border: '1px solid ' + (boardView === key ? C.blue : C.border),
                    '&:hover': { bgcolor: boardView === key ? '#1565C0' : 'rgba(255,255,255,0.04)' },
                  }}
                >
                  {label}
                </Button>
              ))}
            </Stack>
          )}

          {boardView === 'design' ? (
            <>
              <IntakeStep
                key={openBoard.board.id}
                initial={(openBoard.board.intake as Partial<IntakeInput>) ?? undefined}
                candidateProvider={provider}
                onSaveIntake={saveIntake}
                onAcceptProposal={acceptProposal}
              />

              {svg && (
                <Box sx={{ px: 3, pb: 4 }}>
                  <Typography sx={{ color: '#CBD5E1', fontSize: 13.5, fontWeight: 600, mb: 1 }}>
                    One-Line Diagram (from saved design)
                  </Typography>
                  <Box
                    sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', p: 2, overflowX: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                </Box>
              )}
            </>
          ) : (
            <BomViewer key={'bom-' + openBoard.board.id} switchboardId={openBoard.board.id} />
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
