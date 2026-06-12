/**
 * IntakeStep — Phase C spec §3 (Stage 1: Requirements Intake)
 *
 * Board-level intake fields + the feeder schedule grid with
 * paste-from-Excel (TSV clipboard). "Propose line-up" runs the greedy
 * engine and presents a diff preview — nothing applies silently.
 */
import React, { useMemo, useState } from 'react';
import {
  Box, Typography, Stack, MenuItem, TextField, Select, Button, IconButton,
  Table, TableHead, TableRow, TableCell, TableBody, Checkbox, Chip, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider, Tooltip,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import { DEFAULT_STANDARDS, StandardsSet, nextLadder } from '../lib/us-standards';
import { computeLoadV2 } from '../lib/load-calculation-v2';
import {
  proposeLineup, IntakeInput, FeederRowInput, LineupProposal, LineupOptions,
} from '../lib/lineup-proposal';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  blueSoft: 'rgba(0,200,255,0.12)', text: '#E2E8F0', sub: '#64748B',
  muted: '#3D4663', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const LOAD_TYPES = ['General', 'Motor', 'Fire Pump', 'HVAC', 'Lighting', 'Heating', 'Receptacle', 'UPS / IT', 'EV Charger', 'Transformer', 'Panel Feeder', 'Capacitor', 'Spare', 'Space'] as const;
const MODES = ['kW', 'kVA', 'A', 'HP'] as const;

export interface IntakeStepProps {
  standards?: StandardsSet;
  initial?: Partial<IntakeInput>;
  candidateProvider: LineupOptions['candidateProvider'];
  maxSections?: number;
  onSaveIntake: (intake: IntakeInput) => void;
  onAcceptProposal: (proposal: LineupProposal, intake: IntakeInput) => void;
}

let rowSeq = 0;
const newRow = (): FeederRowInput => ({
  rowId: `fr-${Date.now()}-${rowSeq++}`,
  description: '', loadType: 'General', loadInputMode: 'A',
  loadValue: 0, powerFactor: 0.85, continuous: true, poles: 3, qty: 1,
});

export default function IntakeStep(props: IntakeStepProps) {
  const std = props.standards ?? DEFAULT_STANDARDS;
  const [intake, setIntake] = useState<IntakeInput>({
    voltageSystemCode: (props.initial?.voltageSystemCode as string) ?? '480Y/277',
    serviceEntrance: props.initial?.serviceEntrance ?? false,
    utilityFaultKA: props.initial?.utilityFaultKA ?? 'Unknown',
    sourceScheme: props.initial?.sourceScheme ?? 'SINGLE',
    environment: props.initial?.environment ?? 'Indoor',
    specialEnvironment: props.initial?.specialEnvironment ?? 'None',
    totalLoadHint: props.initial?.totalLoadHint ?? null,
    feeders: props.initial?.feeders?.length ? [...props.initial.feeders] : [newRow()],
  });
  const [proposal, setProposal] = useState<LineupProposal | null>(null);
  const [pasteInfo, setPasteInfo] = useState<string | null>(null);

  /* Live NEC load summary — recomputes as the schedule is typed */
  const summary = useMemo(() => {
    const byType = new Map<string, number>();
    let totalA = 0; let devices = 0; let largestMotorA = 0;
    for (const f of intake.feeders) {
      if (f.loadType === 'Space' || !f.loadValue) continue;
      try {
        const res = computeLoadV2(std, {
          voltageSystemCode: intake.voltageSystemCode,
          loadInputMode: f.loadInputMode, loadValue: f.loadValue,
          powerFactor: f.powerFactor, continuous: f.continuous ?? true,
          isLargestMotorInSection: f.loadType === 'Motor' || f.loadType === 'Fire Pump',
        });
        const a = (res.designCurrentA || 0) * Math.max(1, f.qty ?? 1);
        totalA += a;
        devices += Math.max(1, f.qty ?? 1);
        byType.set(f.loadType, (byType.get(f.loadType) ?? 0) + a);
        if ((f.loadType === 'Motor' || f.loadType === 'Fire Pump') && res.designCurrentA > largestMotorA) largestMotorA = res.designCurrentA;
      } catch { /* incomplete row */ }
    }
    const busA = nextLadder(std.mainBusLadder_A, totalA);
    return { totalA: Math.round(totalA * 10) / 10, devices, largestMotorA: Math.round(largestMotorA), busA, byType: [...byType.entries()].sort((a, b) => b[1] - a[1]) };
  }, [intake.feeders, intake.voltageSystemCode, std]);

  const patch = (p: Partial<IntakeInput>) => setIntake((s) => ({ ...s, ...p }));
  const patchRow = (rowId: string, p: Partial<FeederRowInput>) =>
    setIntake((s) => ({ ...s, feeders: s.feeders.map((r) => (r.rowId === rowId ? { ...r, ...p } : r)) }));

  /** Paste-from-Excel: description, loadType, mode, value, pf, continuous, poles, qty */
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || !text.includes('\t')) return;
    e.preventDefault();
    const rows: FeederRowInput[] = [];
    let rejected = 0;
    for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const c = line.split('\t').map((x) => x.trim());
      const value = Number(c[3] ?? c[1]);
      if (!c[0] || !Number.isFinite(value)) { rejected += 1; continue; }
      const lt = LOAD_TYPES.find((t) => t.toLowerCase() === (c[1] ?? '').toLowerCase()) ?? 'General';
      const mode = MODES.find((m) => m.toLowerCase() === (c[2] ?? '').toLowerCase()) ?? 'A';
      rows.push({
        ...newRow(),
        description: c[0],
        loadType: lt,
        loadInputMode: mode,
        loadValue: value,
        powerFactor: Number(c[4]) || 0.85,
        continuous: !/^(n|no|false)$/i.test(c[5] ?? ''),
        poles: c[6] === '2' ? 2 : 3,
        qty: Math.max(1, Number(c[7]) || 1),
      });
    }
    if (rows.length) {
      setIntake((s) => ({ ...s, feeders: [...s.feeders.filter((r) => r.description || r.loadValue), ...rows] }));
    }
    setPasteInfo(`Pasted ${rows.length} feeder row(s)${rejected ? `, ${rejected} rejected (missing description/value)` : ''}`);
  };

  const totals = useMemo(() => {
    const n = intake.feeders.filter((f) => f.loadType !== 'Space').length;
    return { rows: intake.feeders.length, devices: n };
  }, [intake.feeders]);

  /** Engineer overrides the engine's pick with a close alternative. */
  const swapDevice = (sectionIndex: number, designation: string, partNumber: string) => {
    setProposal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((sec) => {
          if (sec.sectionIndex !== sectionIndex) return sec;
          return {
            ...sec,
            devices: sec.devices.map((d) => {
              if (d.designation !== designation || !d.device) return d;
              const pool = [d.device, ...d.alternatives];
              const next = pool.find((c) => c.partNumber === partNumber);
              if (!next || next === d.device) return d;
              const alternatives = pool.filter((c) => c !== next).slice(0, 5);
              const warnings = d.warnings.filter((w) => !w.startsWith('Selected device price'));
              if (next.priceStatus !== 'FIRM') warnings.push(`Selected device price is ${next.priceStatus}`);
              return { ...d, device: next, alternatives, warnings };
            }),
          };
        }),
      };
    });
  };

  const runProposal = () => {
    const p = proposeLineup(std, intake, {
      maxSections: props.maxSections ?? 10,
      candidateProvider: props.candidateProvider,
    });
    setProposal(p);
  };

  return (
    <Box sx={{ p: 1.5, bgcolor: C.surface }}>
      {/* Board-level intake */}
      <Box sx={card}>
        <Typography sx={cardTitle}>System Parameters</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1.5 }}>
          <Field label="Voltage System">
            <Select size="small" value={intake.voltageSystemCode} onChange={(e) => patch({ voltageSystemCode: e.target.value })} sx={input} fullWidth>
              {std.voltageSystems.map((v) => (
                <MenuItem key={v.code} value={v.code} sx={{ fontSize: 13 }}>
                  {v.code} — {v.phase}Ø{v.wires}W
                </MenuItem>
              ))}
            </Select>
          </Field>
          <Field label="Source Scheme">
            <Select size="small" value={intake.sourceScheme} onChange={(e) => patch({ sourceScheme: e.target.value as any })} sx={input} fullWidth>
              <MenuItem value="SINGLE" sx={{ fontSize: 13 }}>Single Main</MenuItem>
              <MenuItem value="MAIN_TIE_MAIN" sx={{ fontSize: 13 }}>Main-Tie-Main</MenuItem>
              <MenuItem value="MULTI_SOURCE" sx={{ fontSize: 13 }}>Multi-source (gen paralleling)</MenuItem>
            </Select>
          </Field>
          <Field label="Utility Fault (kA)">
            <TextField
              size="small" fullWidth placeholder="Unknown"
              value={intake.utilityFaultKA === 'Unknown' ? '' : intake.utilityFaultKA}
              onChange={(e) => {
                const v = e.target.value.trim();
                patch({ utilityFaultKA: v === '' ? 'Unknown' : Number(v) || 'Unknown' });
              }}
              sx={input}
            />
          </Field>
          <Field label="Service Entrance">
            <Select size="small" value={intake.serviceEntrance ? 'yes' : 'no'} onChange={(e) => patch({ serviceEntrance: e.target.value === 'yes' })} sx={input} fullWidth>
              <MenuItem value="no" sx={{ fontSize: 13 }}>No</MenuItem>
              <MenuItem value="yes" sx={{ fontSize: 13 }}>Yes (SUSE)</MenuItem>
            </Select>
          </Field>
          <Field label="Environment">
            <Select size="small" value={intake.environment} onChange={(e) => patch({ environment: e.target.value as any })} sx={input} fullWidth>
              <MenuItem value="Indoor" sx={{ fontSize: 13 }}>Indoor</MenuItem>
              <MenuItem value="Outdoor" sx={{ fontSize: 13 }}>Outdoor</MenuItem>
            </Select>
          </Field>
          <Field label="Special Environment">
            <Select size="small" value={intake.specialEnvironment} onChange={(e) => patch({ specialEnvironment: e.target.value as any })} sx={input} fullWidth>
              {['None', 'Corrosive', 'Marine', 'Dusty'].map((x) => <MenuItem key={x} value={x} sx={{ fontSize: 13 }}>{x}</MenuItem>)}
            </Select>
          </Field>
        </Box>
        {intake.utilityFaultKA === 'Unknown' && (
          <Alert severity="warning" sx={alertSx}>
            Utility fault data unknown — SCCR will be assumed 65 kA [SEED]. Verify with the utility before issuing the quote.
          </Alert>
        )}
      </Box>

      {/* Feeder schedule */}
      <Box sx={{ ...card, mt: 1.5 }} onPaste={handlePaste}>
        {pasteInfo && <Alert severity="info" sx={alertSx} onClose={() => setPasteInfo(null)}>{pasteInfo}</Alert>}

        <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mt: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 560 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={0}>
            <Typography sx={{ ...cardTitle, mb: 0 }}>Load &amp; Feeder Schedule</Typography>
            <Tooltip title="Capture the customer requirement — the engine proposes the full line-up from this schedule. Paste rows from Excel anywhere in this panel."><InfoOutlinedIcon sx={{ fontSize: 15, color: '#64748B', ml: 0.5, cursor: 'help' }} /></Tooltip>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => patch({ feeders: [...intake.feeders, newRow()] })}
              sx={{ color: C.blue, textTransform: 'none', fontSize: 12, border: `1px solid ${C.border}` }}>
              Add feeder
            </Button>
            <Button size="small" startIcon={<AutoAwesomeRoundedIcon sx={{ fontSize: 14 }} />} onClick={runProposal}
              sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 700, fontSize: 12, px: 1.5, '&:hover': { bgcolor: '#33d4ff' } }}>
              Propose line-up
            </Button>
            <Button size="small" onClick={() => props.onSaveIntake(intake)}
              sx={{ color: C.sub, textTransform: 'none', fontSize: 12, border: `1px solid ${C.border}` }}>
              Save intake
            </Button>
          </Stack>
        </Stack>
        <Box sx={{ maxHeight: '56vh', overflowY: 'auto', '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: '#1E2235', borderRadius: 3 } }}>
        <Table size="small" sx={{
          '& td, & th': { borderColor: C.border, color: C.text, fontSize: 12.5, py: 0.5 },
          '& thead th': { position: 'sticky', top: 0, zIndex: 2, bgcolor: '#000' },
          '& td .MuiInputBase-root': {
            bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '6px',
            px: 0.75, minHeight: 28,
            '&:hover': { borderColor: '#2A3050' },
            '&.Mui-focused': { borderColor: C.blue },
          },
          '& td input[type=number]': {
            MozAppearance: 'textfield', textAlign: 'center', minWidth: 44,
          },
          '& td input[type=number]::-webkit-outer-spin-button, & td input[type=number]::-webkit-inner-spin-button': {
            WebkitAppearance: 'none', margin: 0,
          },
        }}>
          <TableHead>
            <TableRow>
              {['#', 'Description', 'Load Type', 'Unit', 'Load Value', 'PF', 'Cont.', 'Poles', 'Qty', ''].map((h) => (
                <TableCell key={h} sx={{ color: C.muted, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.5px' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {intake.feeders.map((r, i) => (
              <TableRow key={r.rowId} sx={{ '&:hover': { bgcolor: 'rgba(30,34,53,0.35)' } }}>
                <TableCell sx={{ color: C.muted, width: 28 }}>{i + 1}</TableCell>
                <TableCell sx={{ minWidth: 180 }}>
                  <TextField variant="standard" fullWidth placeholder="e.g. Chiller CH-1" value={r.description}
                    onChange={(e) => patchRow(r.rowId, { description: e.target.value })} InputProps={{ disableUnderline: true, sx: cell }} />
                </TableCell>
                <TableCell sx={{ width: 110 }}>
                  <Select variant="standard" disableUnderline value={r.loadType} fullWidth sx={cell}
                    onChange={(e) => patchRow(r.rowId, {
                      loadType: e.target.value as any,
                      loadInputMode: (e.target.value === 'Motor' || e.target.value === 'Fire Pump') ? 'HP' : r.loadInputMode === 'HP' ? 'A' : r.loadInputMode,
                    })}>
                    {LOAD_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ fontSize: 12.5 }}>{t}</MenuItem>)}
                  </Select>
                </TableCell>
                <TableCell sx={{ width: 70 }}>
                  <Select variant="standard" disableUnderline value={r.loadInputMode} fullWidth sx={cell}
                    onChange={(e) => patchRow(r.rowId, { loadInputMode: e.target.value as any })}>
                    {MODES.filter((m) => (r.loadType === 'Motor' || r.loadType === 'Fire Pump' ? true : m !== 'HP')).map((m) => (
                      <MenuItem key={m} value={m} sx={{ fontSize: 12.5 }}>{m}</MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={{ width: 80 }}>
                  <TextField variant="standard" type="number" value={r.loadValue || ''}
                    onChange={(e) => patchRow(r.rowId, { loadValue: Number(e.target.value) })}
                    InputProps={{ disableUnderline: true, sx: cell }} />
                </TableCell>
                <TableCell sx={{ width: 60 }}>
                  <TextField variant="standard" type="number" value={r.powerFactor ?? 0.85}
                    onChange={(e) => patchRow(r.rowId, { powerFactor: Number(e.target.value) })}
                    InputProps={{ disableUnderline: true, sx: cell }} disabled={r.loadInputMode !== 'kW'} />
                </TableCell>
                <TableCell sx={{ width: 50 }}>
                  <Checkbox size="small" checked={r.continuous ?? true}
                    onChange={(e) => patchRow(r.rowId, { continuous: e.target.checked })}
                    sx={{ color: C.muted, '&.Mui-checked': { color: C.blue }, p: 0.25 }} />
                </TableCell>
                <TableCell sx={{ width: 58 }}>
                  <Select variant="standard" disableUnderline value={r.poles ?? 3} fullWidth sx={cell}
                    onChange={(e) => patchRow(r.rowId, { poles: Number(e.target.value) as 2 | 3 })}>
                    <MenuItem value={2} sx={{ fontSize: 12.5 }}>2P</MenuItem>
                    <MenuItem value={3} sx={{ fontSize: 12.5 }}>3P</MenuItem>
                  </Select>
                </TableCell>
                <TableCell sx={{ width: 55 }}>
                  <TextField variant="standard" type="number" value={r.qty ?? 1}
                    onChange={(e) => patchRow(r.rowId, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    InputProps={{ disableUnderline: true, sx: cell }} />
                </TableCell>
                <TableCell sx={{ width: 36 }}>
                  <IconButton size="small" onClick={() => patch({ feeders: intake.feeders.filter((x) => x.rowId !== r.rowId) })}
                    sx={{ color: C.muted, '&:hover': { color: C.red } }}>
                    <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </Box>
        </Box>

        {/* Right column: paste hint + sticky live summary */}
        <Box sx={{ width: 250, flexShrink: 0, alignSelf: 'flex-start' }}>
        <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', p: 1.5, position: 'sticky', top: 148 }}>
          <Typography sx={{ color: '#A9B6C9', fontSize: 10.5, letterSpacing: 0.5, mb: 1 }}>LIVE LOAD SUMMARY</Typography>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
            <Typography sx={{ color: '#A9B6C9', fontSize: 11.5 }}>Design current</Typography>
            <Typography sx={{ color: '#00c8ff', fontSize: 15, fontWeight: 800 }}>{summary.totalA} A</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
            <Typography sx={{ color: '#A9B6C9', fontSize: 11.5 }}>Suggested main bus</Typography>
            <Typography sx={{ color: C.text, fontSize: 12.5, fontWeight: 700 }}>{summary.busA ? summary.busA + ' A' : '—'}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
            <Typography sx={{ color: '#A9B6C9', fontSize: 11.5 }}>Device positions</Typography>
            <Typography sx={{ color: C.text, fontSize: 12.5, fontWeight: 700 }}>{summary.devices}</Typography>
          </Stack>
          {summary.largestMotorA > 0 && (
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
              <Typography sx={{ color: '#A9B6C9', fontSize: 11.5 }}>Largest motor</Typography>
              <Typography sx={{ color: C.text, fontSize: 12.5, fontWeight: 700 }}>{summary.largestMotorA} A</Typography>
            </Stack>
          )}
          {summary.byType.length > 0 && (
            <Box sx={{ mt: 1.25, pt: 1, borderTop: '1px solid ' + C.border }}>
              {summary.byType.map(([t, a]) => (
                <Box key={t} sx={{ mb: 0.75 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography sx={{ color: '#A9B6C9', fontSize: 10.5 }}>{t}</Typography>
                    <Typography sx={{ color: '#A9B6C9', fontSize: 10.5 }}>{Math.round(a)} A</Typography>
                  </Stack>
                  <Box sx={{ height: 4, bgcolor: '#000000', borderRadius: 2 }}>
                    <Box sx={{ height: 4, width: `${summary.totalA ? Math.min(100, (a / summary.totalA) * 100) : 0}%`, bgcolor: '#00c8ff', borderRadius: 2, opacity: 0.85 }} />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
          <Typography sx={{ color: '#8E9AAD', fontSize: 10, mt: 1 }}>
            NEC 125% continuous + motor rules applied per row. Propose line-up turns this into sections + breakers.
          </Typography>
        </Box>
        </Box>
        </Stack>
        <Typography sx={{ color: C.muted, fontSize: 11, mt: 1 }}>
          {totals.rows} row(s) • {totals.devices} device position(s) • Spare reserves a device, Space reserves room only
        </Typography>
      </Box>

      {/* Proposal diff preview — nothing applies silently (Phase C §4.3) */}
      <Dialog open={!!proposal} onClose={() => setProposal(null)} fullWidth maxWidth="md"
        PaperProps={{ sx: { bgcolor: C.bg, border: `1px solid ${C.border}`, backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: C.text, fontSize: 15 }}>
          Proposed Line-up — review before applying
        </DialogTitle>
        <DialogContent>
          {proposal && (
            <>
              {proposal.errors.map((e, i) => <Alert key={i} severity="error" sx={alertSx}>{e}</Alert>)}
              {proposal.warnings.map((w, i) => <Alert key={i} severity="warning" sx={alertSx}>{w}</Alert>)}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, my: 1.5 }}>
                <Stat label="TOTAL LOAD" value={`${proposal.totalFeederLoadA} A`} />
                <Stat label="MAIN BUS" value={proposal.boardPatch.mainBusRatingA ? `${proposal.boardPatch.mainBusRatingA} A` : '—'} />
                <Stat label="SCCR" value={`${proposal.boardPatch.sccrKA} kA${proposal.boardPatch.sccrAssumed ? ' *' : ''}`} />
                <Stat label="SECTIONS" value={String(proposal.sections.length)} />
              </Box>
              <Divider sx={{ borderColor: C.border, my: 1 }} />
              {proposal.sections.map((s) => (
                <Box key={s.sectionIndex} sx={{ border: `1px solid ${C.border}`, borderRadius: '8px', p: 1.5, mb: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
                      Section {s.sectionIndex} — {s.role}
                      <Typography component="span" sx={{ color: C.sub, fontSize: 11.5, ml: 1 }}>
                        {s.frame.frameCode} ({s.frame.width_in}"W × {s.frame.depth_in}"D × {s.frame.height_in}"H)
                      </Typography>
                    </Typography>
                    <Typography sx={{ color: C.muted, fontSize: 11 }}>
                      {Math.round((s.usedHeightIn / s.frame.usableDeviceHeight_in) * 100)}% used
                    </Typography>
                  </Stack>
                  {s.devices.map((d) => (
                    <Stack key={d.designation} direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.75 }}>
                      <Chip label={d.designation} size="small"
                        sx={{ bgcolor: C.blueSoft, color: C.blue, fontWeight: 700, fontSize: 11, height: 20 }} />
                      {d.device && d.alternatives.length > 0 ? (
                        <Select
                          size="small"
                          value={d.device.partNumber}
                          onChange={(e) => swapDevice(s.sectionIndex, d.designation, e.target.value)}
                          sx={{ minWidth: 320, bgcolor: C.surface, color: C.text, fontSize: 12, '& fieldset': { borderColor: C.border } }}
                        >
                          {[d.device, ...d.alternatives].map((c) => (
                            <MenuItem key={c.partNumber} value={c.partNumber} sx={{ fontSize: 12 }}>
                              {c.manufacturer} {c.frameModel} — {c.ratedA} A, {c.interruptingKA} kA, {c.mounting}
                              {c.price != null ? ` · $${c.price.toLocaleString()}` : ' · RFQ'}
                            </MenuItem>
                          ))}
                        </Select>
                      ) : (
                        <Typography sx={{ color: C.text, fontSize: 12.5 }}>
                          {d.device ? `${d.device.manufacturer} ${d.device.frameModel} — ${d.device.ratedA} A, ${d.device.interruptingKA} kA, ${d.device.mounting}` : 'No candidate found'}
                        </Typography>
                      )}
                      <Typography sx={{ color: C.muted, fontSize: 11 }}>
                        design {d.designCurrentA} A → {d.recommendedRatingA ?? '—'} A
                      </Typography>
                      {d.device && d.device.priceStatus !== 'FIRM' && (
                        <Chip label={d.device.priceStatus} size="small"
                          sx={{ bgcolor: 'transparent', border: `1px solid ${C.amber}`, color: C.amber, fontSize: 10, height: 18 }} />
                      )}
                    </Stack>
                  ))}
                </Box>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProposal(null)} sx={{ color: C.sub, textTransform: 'none' }}>Edit intake</Button>
          <Button
            variant="contained" disabled={!proposal?.ok}
            onClick={() => { if (proposal) { props.onAcceptProposal(proposal, intake); setProposal(null); } }}
            sx={{ bgcolor: C.blue, textTransform: 'none', fontWeight: 600 }}
          >
            Accept & apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ color: C.sub, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', mb: 0.5 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ bgcolor: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', p: 1.25 }}>
      <Typography sx={{ color: C.muted, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.7px' }}>{label}</Typography>
      <Typography sx={{ color: C.text, fontSize: 16, fontWeight: 700, mt: 0.25 }}>{value}</Typography>
    </Box>
  );
}

const card = { bgcolor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', p: 1.75 };
const cardTitle = { color: '#CBD5E1', fontSize: 13.5, fontWeight: 600, mb: 1 };
const input = {
  color: C.text, fontSize: 13, bgcolor: C.surface,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.blue },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.blue },
  '& .MuiSelect-icon': { color: C.muted },
  '& input': { color: C.text },
};
const cell = { color: C.text, fontSize: 12.5 };
const alertSx = {
  mt: 1.5, bgcolor: 'rgba(30,34,53,0.5)', color: '#CBD5E1', border: `1px solid ${C.border}`,
  '& .MuiAlert-icon': { fontSize: 18 }, py: 0.25, fontSize: 12,
};
