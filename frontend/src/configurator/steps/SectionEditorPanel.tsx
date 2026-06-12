/**
 * SectionEditorPanel — the Section Editor (chip 2 augmentation).
 *
 * A 4-up grid of section cards. Each card: editable name + role, a
 * frame selector (from the engineering-standards `frame_library`), a
 * utilization bar (device heights vs frame usable height — falls back to
 * device count when dimension data is missing), and the section's device
 * list with per-device move ◀ ▶ (fit-checked), remove (waiver prompt), and
 * a footer "+ Add device" that opens the shared ComponentPickerDialog in
 * add mode locked to CIRCUIT BREAKER. Row controls: + Add section (max 10),
 * per-card reorder ◀ ▶ and delete (only when empty). Every edit persists
 * immediately and triggers the parent reload so BOM/quote/SLD recompute.
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
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);

  const sccrKA = Number(board.board.board_data?.shortCircuitRating) || 65;

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

  // All CB lines across every section — used for the summary card
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

  /** Utilization: used device height / frame usable height. Returns null
   *  when no frame usable height is known (caller shows count fallback). */
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
    if (!usable) return false; // no dims → cannot fit-check, allow
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

  // ── Section actions ──
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

  // ── Device actions ──
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
      // Fit-check warning: still allow with explicit confirm.
      const ok = window.confirm(
        'Section ' + target.section_number + ' may exceed its frame capacity with this device. Move anyway?'
      );
      if (!ok) return;
    }
    run('dev-move-' + line.id, () => relinkLine(line, target));
  };

  /** Re-link a device line to a different section (patchLine can't touch
   *  section_id), by recreating the line under the target section and
   *  removing the original. Preserves all device fields + meta. */
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
    if (reason === null) return; // cancelled
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

  const pickerSection = sections.find((s) => s.id === pickerSectionId) ?? null;

  return (
    <Box sx={{ px: 3, pt: 2, pb: 1 }}>
      {/* Outer row: left content + right sticky summary */}
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        {/* Left: title row + grid */}
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
            /* 4-up wrapping grid — no horizontal scrollbar */
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
              {sections.map((sec) => {
                const devices = devicesBySection.get(sec.id) ?? [];
                const frame = frameFor(sec);
                const util = utilizationFor(sec, devices);
                const role = String(sec.setup?.role ?? 'FEEDER');
                const idx = sections.findIndex((s) => s.id === sec.id);
                return (
                  <Box
                    key={sec.id}
                    sx={{
                      minWidth: 0, /* let grid govern width */
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
                        <MenuItem value="" sx={{ fontSize: 11.5 }}>{frames ? 'Select frame…' : 'Loading frames…'}</MenuItem>
                        {(frames ?? []).map((f) => (
                          <MenuItem key={f.frameCode} value={f.frameCode} sx={{ fontSize: 11.5 }}>
                            {f.frameCode} — {f.width_in}×{f.depth_in}×{f.height_in}" · {f.maxBusRating_A}A
                          </MenuItem>
                        ))}
                      </Select>

                      {/* Utilization */}
                      <Box sx={{ mt: 1 }}>
                        {util.hasBar ? (
                          <>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                              <Typography sx={{ color: C.sub, fontSize: 10 }}>Utilization</Typography>
                              <Typography sx={{ color: util.overflow ? C.red : util.pct > 85 ? C.amber : C.green, fontSize: 10, fontWeight: 700 }}>
                                {util.usedIn}" / {util.usable}" · {util.pct}%
                              </Typography>
                            </Stack>
                            <LinearProgress
                              variant="determinate" value={util.pct}
                              sx={{
                                height: 5, borderRadius: 3, bgcolor: C.border,
                                '& .MuiLinearProgress-bar': { bgcolor: util.overflow ? C.red : util.pct > 85 ? C.amber : C.green },
                              }}
                            />
                          </>
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
                                        <ChevronRightRoundedIcon sx={{ fontSize: 16 }} />
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
                                {displayCase(l.name || l.part_number || '\u2014')}
                              </Typography>
                              <Typography sx={{ color: C.sub, fontSize: 10 }}>
                                {l.meta?.ratedA ?? '\u2014'} A
                                {l.meta?.interruptingKA ? ' / ' + l.meta.interruptingKA + ' kA' : ''}
                                {' \u00b7 '}{l.meta?.role ?? role}
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
                        onClick={() => { setError(null); setPickerSectionId(sec.id); }}
                        sx={{ color: C.blue, textTransform: 'none', fontSize: 11.5, border: '1px solid ' + C.border }}
                      >
                        Add device
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

      <ComponentPickerDialog
        open={!!pickerSection}
        mode="add"
        lockedCategory="CIRCUIT BREAKER"
        onClose={() => setPickerSectionId(null)}
        onPick={pickerSection ? addDeviceToSection(pickerSection) : async () => {}}
      />
    </Box>
  );
};

export default SectionEditorPanel;
