/**
 * SectionEditorPanel — the Section Editor (chip 2 augmentation).
 *
 * A 4-up grid of section cards. Each card: editable name + role, a
 * frame selector (from the engineering-standards `frame_library`), a
 * utilization bar (device heights vs frame usable height — falls back to
 * device count when dimension data is missing), and the section's device
 * list with per-device move left/right (fit-checked), swap (opens picker
 * in swap mode), remove (waiver prompt), and a footer "+ Add breaker" that
 * opens the shared ComponentPickerDialog in add mode locked to CIRCUIT BREAKER.
 * Row controls: + Add section (max 10), per-card reorder left/right and delete
 * (only when empty). Every edit persists immediately and triggers the
 * parent reload so BOM/quote/SLD recompute.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Box, Typography, Stack, Chip, IconButton, Button, TextField, Select, MenuItem,
  Tooltip, Alert, CircularProgress, LinearProgress,
} from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import configuratorV2Service, { FullBoard, SectionRow, ComponentLineRow } from '../../services/configuratorV2Service';
import { ConfiguratorComponent } from '../../services/configuratorService';
import ComponentPickerDialog from '../components/ComponentPickerDialog';
import DesignSummaryCard from '../components/DesignSummaryCard';
import { displayCase } from '../lib/displayCase';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', title: '#F0F6FF', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const MAX_SECTIONS = 10;
/** Device height fallback (inches) by role when a line carries no dims. */
const ACB_FALLBACK_H = 20;
const FEEDER_FALLBACK_H = 8;

interface FrameRow {
  frameCode: string;
  width_in?: number;
  depth_in?: number;
  height_in?: number;
  usableDeviceHeight_in?: number;
  maxBusRating_A?: number;
  drawoutCapable?: boolean;
  [k: string]: any;
}

export interface SectionEditorPanelProps {
  board: FullBoard;
  locked: boolean;
  /** Reload the full board so downstream BOM/quote/SLD recompute. */
  onChanged: () => Promise<void>;
}

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.bg, color: C.text, fontSize: 12.5,
    '& fieldset': { borderColor: C.border },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
  '& input': { color: C.text },
};

/** Whether the height came from actual dims (false) or a role fallback (true). */
function deviceHeightIsEstimate(l: ComponentLineRow): boolean {
  const h = Number(l.meta?.heightIn ?? l.meta?.dims_h_in);
  return !(Number.isFinite(h) && h > 0);
}

/** Device height in inches: prefer carried dims, else role-based fallback. */
function deviceHeightIn(l: ComponentLineRow): number | null {
  const h = Number(l.meta?.heightIn ?? l.meta?.dims_h_in);
  if (Number.isFinite(h) && h > 0) return h;
  const role = String(l.meta?.role ?? '').toUpperCase();
  if (!l.meta) return null;
  return role && role !== 'FEEDER' ? ACB_FALLBACK_H : FEEDER_FALLBACK_H;
}

const SectionEditorPanel: React.FC<SectionEditorPanelProps> = ({ board, locked, onChanged }) => {
  const [frames, setFrames] = useState<FrameRow[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingDesig, setEditingDesig] = useState<string | null>(null);
  const [desigDraft, setDesigDraft] = useState<Record<string, string>>({});
  // add picker state
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  // swap picker state
  const [swapLine, setSwapLine] = useState<ComponentLineRow | null>(null);
  const [swapPickerOpen, setSwapPickerOpen] = useState(false);

  const sccrKA = Number(board.board.board_data?.shortCircuitRating) || null;

  // Lazy-load the frame library from the engineering standards table.
  const loadFrames = useCallback(async () => {
    if (frames) return;
    try {
      const std = await configuratorV2Service.getStandard('frame_library');
      setFrames(((std?.rows as FrameRow[]) ?? []).filter((f) => !!f.frameCode));
    } catch {
      setFrames([]);
    }
  }, [frames]);

  React.useEffect(() => { loadFrames(); }, [loadFrames]);

  const sections = useMemo(
    () => [...board.sections].sort((a, b) => a.section_number - b.section_number),
    [board.sections]
  );

  const devicesBySection = useMemo(() => {
    const m = new Map<string, ComponentLineRow[]>();
    for (const l of board.lines) {
      if (l.scope !== 'section' || !l.section_id) continue;
      if ((l.category || '').toUpperCase() !== 'CIRCUIT BREAKER') continue;
      const arr = m.get(l.section_id) ?? [];
      arr.push(l);
      m.set(l.section_id, arr);
    }
    return m;
  }, [board.lines]);

  // All CB lines across every section - used for the summary card
  const allDeviceLines = useMemo(
    () => board.lines.filter((l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER'),
    [board.lines]
  );

  const summaryMains = useMemo(
    () => allDeviceLines.filter((l) => String(l.meta?.role).toUpperCase() === 'MAIN').length,
    [allDeviceLines]
  );
  const summaryFeeders = useMemo(
    () => allDeviceLines.filter((l) => String(l.meta?.role).toUpperCase() === 'FEEDER').length,
    [allDeviceLines]
  );
  const summaryDrawout = useMemo(
    () => allDeviceLines.filter((l) => String(l.meta?.mounting || '').toLowerCase().includes('draw')).length,
    [allDeviceLines]
  );
  const summaryDeviceCost = useMemo(
    () => allDeviceLines.reduce((a, l) => a + (Number(l.unit_cost) || 0) * (Number(l.quantity) || 1), 0),
    [allDeviceLines]
  );

  const frameFor = (sec: SectionRow): FrameRow | null => {
    const code = sec.layout?.frameCode ?? sec.layout?.frame?.frameCode ?? null;
    if (code && frames) {
      const hit = frames.find((f) => f.frameCode === code);
      if (hit) return hit;
    }
    return (sec.layout?.frame as FrameRow) ?? null;
  };

  /** Utilization: used device height / frame usable height. */
  const utilizationFor = (sec: SectionRow, devices: ComponentLineRow[]) => {
    const frame = frameFor(sec);
    const usable = Number(frame?.usableDeviceHeight_in) || 0;
    const heights = devices.map(deviceHeightIn);
    const haveDims = heights.every((h) => h != null) && heights.length > 0;
    const usedIn = heights.reduce((a: number, h) => a + (h ?? 0), 0);
    if (!usable || !haveDims) {
      return { hasBar: false, usedIn, usable, pct: 0, overflow: false };
    }
    const pct = Math.min(100, Math.round((usedIn / usable) * 100));
    return { hasBar: true, usedIn, usable, pct, overflow: usedIn > usable };
  };

  /** Would adding `extraIn` to target section exceed its usable height? */
  const wouldExceed = (sec: SectionRow, extraIn: number): boolean => {
    const frame = frameFor(sec);
    const usable = Number(frame?.usableDeviceHeight_in) || 0;
    if (!usable) return false;
    const used = (devicesBySection.get(sec.id) ?? []).reduce((a, l) => a + (deviceHeightIn(l) ?? 0), 0);
    return used + extraIn > usable;
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusyKey(key);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Action failed');
    } finally {
      setBusyKey(null);
    }
  };

  // Section actions
  const addSection = () =>
    run('add-section', async () => {
      const last = sections[sections.length - 1];
      await configuratorV2Service.createSection(board.board.id, {
        afterSectionNumber: last?.section_number,
        role: 'FEEDER',
      });
    });

  const renameSection = (sec: SectionRow) => {
    const next = (nameDraft[sec.id] ?? '').trim();
    setEditingName(null);
    if (!next || next === (sec.name ?? '')) return;
    run('sec-name-' + sec.id, () => configuratorV2Service.patchSection(sec.id, { name: next }).then(() => {}));
  };

  const setRole = (sec: SectionRow, role: string) =>
    run('sec-role-' + sec.id, () => configuratorV2Service.patchSection(sec.id, { role }).then(() => {}));

  const setFrame = (sec: SectionRow, frameCode: string) => {
    const frame = (frames ?? []).find((f) => f.frameCode === frameCode) ?? null;
    run('sec-frame-' + sec.id, () =>
      configuratorV2Service.patchSection(sec.id, { frameCode, frame }).then(() => {}));
  };

  const reorderSection = (sec: SectionRow, dir: -1 | 1) => {
    const target = sec.section_number + dir;
    if (target < 1 || target > sections.length) return;
    run('sec-move-' + sec.id, () =>
      configuratorV2Service.patchSection(sec.id, { section_number: target }).then(() => {}));
  };

  const deleteSection = (sec: SectionRow) => {
    const count = (devicesBySection.get(sec.id) ?? []).length;
    if (count > 0) {
      setError('Move or remove devices first — section ' + sec.section_number + ' still has ' + count + ' device(s).');
      return;
    }
    run('sec-del-' + sec.id, () => configuratorV2Service.deleteSection(sec.id));
  };

  // Device actions
  const renameDesignation = (line: ComponentLineRow) => {
    const next = (desigDraft[line.id] ?? '').trim();
    setEditingDesig(null);
    if (!next || next === String(line.meta?.designation ?? '')) return;
    run('dev-desig-' + line.id, () =>
      configuratorV2Service.patchLine(line.id, { meta: { designation: next } }).then(() => {}));
  };

  const moveDevice = (line: ComponentLineRow, fromSec: SectionRow, dir: -1 | 1) => {
    const idx = sections.findIndex((s) => s.id === fromSec.id);
    const target = sections[idx + dir];
    if (!target) return;
    const h = deviceHeightIn(line) ?? 0;
    if (wouldExceed(target, h)) {
      const ok = window.confirm(
        'Section ' + target.section_number + ' may exceed its frame capacity with this device. Move anyway?'
      );
      if (!ok) return;
    }
    run('dev-move-' + line.id, () => relinkLine(line, target));
  };

  const relinkLine = async (line: ComponentLineRow, target: SectionRow) => {
    await configuratorV2Service.addLine(board.board.id, {
      scope: 'section',
      section_id: target.id,
      component_id: line.component_id ?? null,
      category: line.category ?? 'CIRCUIT BREAKER',
      part_number: line.part_number ?? null,
      name: line.name ?? null,
      quantity: line.quantity ?? 1,
      unit_cost: line.unit_cost ?? 0,
      price_status: line.price_status,
      source: line.source,
      meta: { ...(line.meta ?? {}), sectionIndex: target.section_number },
    });
    await configuratorV2Service.deleteLine(line.id, line.source === 'auto' ? 'Moved to another section' : undefined);
  };

  const removeDevice = (line: ComponentLineRow) => {
    const label = String(line.meta?.designation ?? line.part_number ?? 'device');
    const reason = window.prompt('Remove ' + label + '? Enter a waiver reason (required for auto-added lines):', '');
    if (reason === null) return;
    if (line.source === 'auto' && !reason.trim()) {
      setError('A waiver reason is required to remove this auto-added line.');
      return;
    }
    run('dev-del-' + line.id, () => configuratorV2Service.deleteLine(line.id, reason.trim() || undefined));
  };

  const addDeviceToSection = (sec: SectionRow) => (c: ConfiguratorComponent, qty: number) => {
    const sp: any = (c as any).specifications ?? {};
    return run('dev-add-' + sec.id, async () => {
      await configuratorV2Service.addLine(board.board.id, {
        scope: 'section',
        section_id: sec.id,
        component_id: c.id && String(c.id).length === 36 ? c.id : null,
        category: 'CIRCUIT BREAKER',
        part_number: c.part_number ?? null,
        name: c.name ?? c.part_number ?? null,
        quantity: Math.max(1, qty),
        unit_cost: Number(c.price ?? c.mat_cost ?? c.material_cost) || 0,
        price_status: (Number(c.price) > 0 ? 'FIRM' : 'PENDING_RFQ'),
        source: 'user',
        meta: {
          designation: '',
          role: String(sec.setup?.role ?? 'FEEDER'),
          ratedA: Number(sp.ratedCurrentA) || null,
          poles: Number(sp.poles) || 3,
          mounting: sp.mounting ?? 'Fixed',
          interruptingKA: Number(sp.interruptingKA) || null,
          heightIn: Number((c as any).dims_h_in) || null,
          sectionIndex: sec.section_number,
        },
      });
    });
  };

  /** Swap a device - mirrors DeviceListPanel.doSwap using patchLine. */
  const doSwapDevice = (line: ComponentLineRow, c: ConfiguratorComponent) => {
    const sp: any = (c as any).specifications ?? {};
    return run('dev-swap-' + line.id, async () => {
      await configuratorV2Service.patchLine(line.id, {
        component_id: c.id && String(c.id).length === 36 ? c.id : null,
        part_number: c.part_number ?? null,
        name: c.name ?? c.part_number ?? null,
        unit_cost: Number(c.price ?? (c as any).mat_cost ?? (c as any).material_cost) || 0,
        price_status: Number(c.price) > 0 ? 'FIRM' : 'PENDING_RFQ',
        meta: {
          ratedA: Number(sp.ratedCurrentA) || null,
          poles: Number(sp.poles) || 3,
          mounting: sp.mounting ?? 'Fixed',
          interruptingKA: Number(sp.interruptingKA) || null,
          frameModel: sp.frameModel ?? null,
          manufacturer: sp.manufacturer ?? null,
          swapped: true,
          swapped_from: line.part_number ?? null,
        },
      });
      setSwapPickerOpen(false);
      setSwapLine(null);
    });
  };

  const pickerSection = sections.find((s) => s.id === pickerSectionId) ?? null;

  // boardContext for add picker
  const addBoardContext = useMemo(() => {
    if (!pickerSection) return undefined;
    const frame = frameFor(pickerSection);
    const usable = Number(frame?.usableDeviceHeight_in) || null;
    const devices = devicesBySection.get(pickerSection.id) ?? [];
    const used = devices.reduce((a, l) => a + (deviceHeightIn(l) ?? 0), 0);
    const remaining = usable != null ? usable - used : null;
    return { sccrKA: sccrKA ?? null, remainingHeightIn: remaining };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerSection, devicesBySection, frames, sccrKA]);

  // boardContext for swap picker
  const swapBoardContext = useMemo(() => {
    if (!swapLine) return undefined;
    let swapSec: SectionRow | undefined;
    for (const sec of sections) {
      const devs = devicesBySection.get(sec.id) ?? [];
      if (devs.some((d) => d.id === swapLine.id)) { swapSec = sec; break; }
    }
    if (!swapSec) return { sccrKA: sccrKA ?? null, remainingHeightIn: null };
    const frame = frameFor(swapSec);
    const usable = Number(frame?.usableDeviceHeight_in) || null;
    const devices = devicesBySection.get(swapSec.id) ?? [];
    const used = devices.reduce((a, l) => a + (deviceHeightIn(l) ?? 0), 0);
    const outgoingH = deviceHeightIn(swapLine) ?? 0;
    const remaining = usable != null ? usable - used + outgoingH : null;
    return { sccrKA: sccrKA ?? null, remainingHeightIn: remaining };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapLine, sections, devicesBySection, frames, sccrKA]);

  return (
    <Box sx={{ px: 3, pt: 2, pb: 1 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography sx={{ color: C.title, fontSize: 13.5, fontWeight: 600 }}>
              Section editor — frames, capacity and device placement
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              {busyKey && <CircularProgress size={14} sx={{ color: C.blue }} />}
              <Tooltip title={sections.length >= MAX_SECTIONS ? `Maximum ${MAX_SECTIONS} sections` : 'Append a new section'}>
                <span>
                  <Button
                    size="small"
                    startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
                    disabled={locked || sections.length >= MAX_SECTIONS || !!busyKey}
                    onClick={addSection}
                    sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 600, fontSize: 12, '&:hover': { bgcolor: '#33d4ff' } }}
                  >
                    Add section
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Stack>

          {error && (
            <Alert
              severity="error"
              onClose={() => setError(null)}
              sx={{ mb: 1.5, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}
            >
              {error}
            </Alert>
          )}

          {!sections.length ? (
            <Box sx={{ bgcolor: C.bg, border: '1px dashed ' + C.border, borderRadius: '10px', p: 3, textAlign: 'center' }}>
              <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
                No sections yet — accept a line-up proposal, or add a section to start placing devices.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
              {sections.map((sec) => {
                const devices = devicesBySection.get(sec.id) ?? [];
                const frame = frameFor(sec);
                const util = utilizationFor(sec, devices);
                const role = String(sec.setup?.role ?? 'FEEDER');
                const idx = sections.findIndex((s) => s.id === sec.id);

                // Tooltip content for the utilization bar
                const frameHeight = Number(frame?.height_in) || null;
                const busCableZone = frameHeight && util.usable ? frameHeight - util.usable : null;
                const utilTooltip = util.hasBar ? (
                  <Box sx={{ fontSize: 11, minWidth: 180 }}>
                    <Typography sx={{ fontSize: 11, color: C.sub, mb: 0.5 }}>
                      {'Usable height: ' + util.usable.toFixed(1) + ' in' +
                        (frameHeight ? ' (frame ' + frameHeight.toFixed(0) + ' in' +
                          (busCableZone ? ' − bus/cable zones ' + busCableZone.toFixed(1) + ' in' : '') + ')' : '')}
                    </Typography>
                    {devices.map((d) => {
                      const h = deviceHeightIn(d);
                      const est = deviceHeightIsEstimate(d);
                      const label = d.meta?.designation || d.part_number || d.name || '—';
                      return (
                        <Typography key={d.id} sx={{ fontSize: 11, color: C.text }}>
                          {label + ' — ' + (h != null ? h.toFixed(1) : '?') + ' in' + (est ? ' (est.)' : '')}
                        </Typography>
                      );
                    })}
                    <Typography sx={{ fontSize: 11, color: C.text, mt: 0.5, borderTop: '1px solid #1E2235', pt: 0.5 }}>
                      {'Used: ' + util.usedIn.toFixed(1) + ' in'}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: util.overflow ? C.red : C.green }}>
                      {'Remaining: ' + (util.usable - util.usedIn).toFixed(1) + ' in'}
                    </Typography>
                  </Box>
                ) : '';

                return (
                  <Box
                    key={sec.id}
                    sx={{
                      minWidth: 0,
                      bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px',
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {/* Header */}
                    <Box sx={{ p: 1.25, borderBottom: '1px solid ' + C.border }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography sx={{ color: C.title, fontSize: 13, fontWeight: 700 }}>
                            Section {sec.section_number}
                          </Typography>
                          <Tooltip title="Move section left">
                            <span>
                              <IconButton size="small" disabled={locked || idx === 0 || !!busyKey} onClick={() => reorderSection(sec, -1)} sx={{ color: C.sub, p: 0.25 }}>
                                <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Move section right">
                            <span>
                              <IconButton size="small" disabled={locked || idx === sections.length - 1 || !!busyKey} onClick={() => reorderSection(sec, 1)} sx={{ color: C.sub, p: 0.25 }}>
                                <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                        <Tooltip title={devices.length ? 'Move or remove devices before deleting this section' : 'Delete section'}>
                          <span>
                            <IconButton size="small" disabled={locked || !!busyKey || devices.length > 0} onClick={() => deleteSection(sec)} sx={{ color: devices.length ? C.sub : C.red, p: 0.25 }}>
                              <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>

                      {/* Editable name */}
                      {editingName === sec.id ? (
                        <TextField
                          autoFocus size="small" fullWidth
                          value={nameDraft[sec.id] ?? sec.name ?? ''}
                          onChange={(e) => setNameDraft((m) => ({ ...m, [sec.id]: e.target.value }))}
                          onBlur={() => renameSection(sec)}
                          onKeyDown={(e) => { if (e.key === 'Enter') renameSection(sec); if (e.key === 'Escape') setEditingName(null); }}
                          sx={{ ...inputSx, mb: 0.75 }}
                        />
                      ) : (
                        <Typography
                          onClick={() => { if (!locked) { setNameDraft((m) => ({ ...m, [sec.id]: sec.name ?? '' })); setEditingName(sec.id); } }}
                          sx={{ color: C.text, fontSize: 12, mb: 0.75, cursor: locked ? 'default' : 'text', '&:hover': { color: locked ? C.text : C.blue } }}
                        >
                          {sec.name || 'Untitled section'}
                        </Typography>
                      )}

                      {/* Role + frame */}
                      <Stack direction="row" spacing={0.75} sx={{ mb: 0.75 }}>
                        <Select
                          size="small" value={role} disabled={locked || !!busyKey}
                          onChange={(e) => setRole(sec, String(e.target.value))}
                          sx={{ flex: 1, bgcolor: C.bg, color: C.text, fontSize: 11.5, '& fieldset': { borderColor: C.border } }}
                        >
                          {['MAIN', 'FEEDER', 'TIE', 'DISTRIBUTION', 'METERING'].map((r) => (
                            <MenuItem key={r} value={r} sx={{ fontSize: 11.5 }}>{displayCase(r)}</MenuItem>
                          ))}
                        </Select>
                      </Stack>
                      <Select
                        size="small" displayEmpty fullWidth disabled={locked || !!busyKey || !frames}
                        value={frame?.frameCode ?? ''}
                        onChange={(e) => setFrame(sec, String(e.target.value))}
                        sx={{ bgcolor: C.bg, color: C.text, fontSize: 11.5, '& fieldset': { borderColor: C.border } }}
                      >
                        <MenuItem value="" sx={{ fontSize: 11.5 }}>{frames ? 'Select frame...' : 'Loading frames...'}</MenuItem>
                        {(frames ?? []).map((f) => (
                          <MenuItem key={f.frameCode} value={f.frameCode} sx={{ fontSize: 11.5 }}>
                            {f.frameCode + ' — ' + f.width_in + '×' + f.depth_in + '×' + f.height_in + '" · ' + f.maxBusRating_A + 'A'}
                          </MenuItem>
                        ))}
                      </Select>

                      {/* Utilization */}
                      <Box sx={{ mt: 1 }}>
                        {util.hasBar ? (
                          <Tooltip
                            title={utilTooltip}
                            placement="right"
                            arrow
                            componentsProps={{
                              tooltip: { sx: { bgcolor: C.surface, border: '1px solid ' + C.border, p: 1, maxWidth: 280 } },
                              arrow: { sx: { color: C.border } },
                            }}
                          >
                            <Box sx={{ cursor: 'default' }}>
                              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                                <Typography sx={{ color: C.sub, fontSize: 10 }}>Utilization</Typography>
                                <Typography sx={{ color: util.overflow ? C.red : util.pct > 85 ? C.amber : C.green, fontSize: 10, fontWeight: 700 }}>
                                  {util.usedIn}{'"'} / {util.usable}{'"'} {'·'} {util.pct}{'%'}
                                </Typography>
                              </Stack>
                              <LinearProgress
                                variant="determinate" value={util.pct}
                                sx={{
                                  height: 5, borderRadius: 3, bgcolor: C.border,
                                  '& .MuiLinearProgress-bar': { bgcolor: util.overflow ? C.red : util.pct > 85 ? C.amber : C.green },
                                }}
                              />
                            </Box>
                          </Tooltip>
                        ) : (
                          <Typography sx={{ color: C.sub, fontSize: 10 }}>
                            {devices.length} device{devices.length === 1 ? '' : 's'}
                            {frame ? '' : ' · select a frame for capacity'}
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {/* Devices */}
                    <Box sx={{ p: 1, flex: 1 }}>
                      {!devices.length ? (
                        <Typography sx={{ color: C.sub, fontSize: 11, textAlign: 'center', py: 1.5 }}>No devices</Typography>
                      ) : (
                        <Stack spacing={0.5}>
                          {devices.map((l) => (
                            <Box key={l.id} sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '8px', p: 0.75 }}>
                              <Stack direction="row" alignItems="center" justifyContent="space-between">
                                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                                  {editingDesig === l.id ? (
                                    <TextField
                                      autoFocus size="small"
                                      value={desigDraft[l.id] ?? String(l.meta?.designation ?? '')}
                                      onChange={(e) => setDesigDraft((m) => ({ ...m, [l.id]: e.target.value }))}
                                      onBlur={() => renameDesignation(l)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') renameDesignation(l); if (e.key === 'Escape') setEditingDesig(null); }}
                                      sx={{ ...inputSx, width: 64, '& input': { padding: '2px 6px', fontSize: 10.5, color: C.text } }}
                                    />
                                  ) : (
                                    <Chip
                                      label={l.meta?.designation || '—'}
                                      size="small"
                                      onClick={() => { if (!locked) { setDesigDraft((m) => ({ ...m, [l.id]: String(l.meta?.designation ?? '') })); setEditingDesig(l.id); } }}
                                      sx={{ bgcolor: 'rgba(0,200,255,0.12)', color: '#60A5FA', fontWeight: 700, fontSize: 10, height: 18, cursor: locked ? 'default' : 'pointer' }}
                                    />
                                  )}
                                </Stack>
                                <Stack direction="row" alignItems="center" spacing={0}>
                                  <Tooltip title="Move to previous section">
                                    <span>
                                      <IconButton size="small" disabled={locked || idx === 0 || !!busyKey} onClick={() => moveDevice(l, sec, -1)} sx={{ color: C.sub, p: 0.2 }}>
                                        <ChevronLeftRoundedIcon sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Move to next section">
                                    <span>
                                      <IconButton size="small" disabled={locked || idx === sections.length - 1 || !!busyKey} onClick={() => moveDevice(l, sec, 1)} sx={{ color: C.sub, p: 0.2 }}>
                                        <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Swap breaker">
                                    <span>
                                      <IconButton
                                        size="small"
                                        disabled={locked || !!busyKey}
                                        onClick={() => { setSwapLine(l); setSwapPickerOpen(true); setError(null); }}
                                        sx={{ color: C.blue, p: 0.2 }}
                                      >
                                        <SwapHorizRoundedIcon sx={{ fontSize: 14 }} />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Remove device">
                                    <span>
                                      <IconButton size="small" disabled={locked || !!busyKey} onClick={() => removeDevice(l)} sx={{ color: C.red, p: 0.2 }}>
                                        <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Stack>
                              </Stack>
                              <Typography sx={{ color: C.text, fontSize: 11, mt: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {displayCase(l.name || l.part_number || '—')}
                              </Typography>
                              <Typography sx={{ color: C.sub, fontSize: 10 }}>
                                {l.meta?.ratedA ?? '—'} A
                                {l.meta?.interruptingKA ? ' / ' + l.meta.interruptingKA + ' kA' : ''}
                                {' · '}{l.meta?.role ?? role}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </Box>

                    {/* Footer */}
                    <Box sx={{ p: 1, borderTop: '1px solid ' + C.border }}>
                      <Button
                        size="small" fullWidth
                        startIcon={<AddRoundedIcon sx={{ fontSize: 15 }} />}
                        disabled={locked || !!busyKey}
                        aria-label="Add breaker"
                        onClick={() => { setError(null); setPickerSectionId(sec.id); }}
                        sx={{ color: C.blue, textTransform: 'none', fontSize: 11.5, border: '1px solid ' + C.border }}
                      >
                        Add breaker
                      </Button>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        {/* Right: sticky design summary card */}
        <DesignSummaryCard
          devices={allDeviceLines.length}
          mains={summaryMains}
          feeders={summaryFeeders}
          drawout={summaryDrawout}
          deviceCost={summaryDeviceCost}
          note="Select a frame per section to see capacity utilization."
        />
      </Stack>

      {/* Add breaker picker */}
      <ComponentPickerDialog
        open={!!pickerSection}
        mode="add"
        lockedCategory="CIRCUIT BREAKER"
        boardContext={addBoardContext}
        onClose={() => setPickerSectionId(null)}
        onPick={pickerSection ? addDeviceToSection(pickerSection) : async () => {}}
      />

      {/* Swap breaker picker */}
      <ComponentPickerDialog
        open={swapPickerOpen}
        mode="swap"
        lockedCategory="CIRCUIT BREAKER"
        boardContext={swapBoardContext}
        onClose={() => { setSwapPickerOpen(false); setSwapLine(null); }}
        onPick={(c: ConfiguratorComponent, _qty: number) => {
          if (swapLine) doSwapDevice(swapLine, c);
        }}
      />
    </Box>
  );
};

export default SectionEditorPanel;
