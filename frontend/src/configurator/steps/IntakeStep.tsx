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
import ContentPasteRoundedIcon from '@mui/icons-material/ContentPasteRounded';

import { DEFAULT_STANDARDS, StandardsSet } from '../lib/us-standards';
import {
  proposeLineup, IntakeInput, FeederRowInput, LineupProposal, LineupOptions,
} from '../lib/lineup-proposal';

const C = {
  bg: '#0D0D14', surface: '#13131E', border: '#1E2235', blue: '#1976D2',
  blueSoft: 'rgba(25,118,210,0.12)', text: '#E2E8F0', sub: '#64748B',
  muted: '#3D4663', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const LOAD_TYPES = ['General', 'Motor', 'Lighting', 'HVAC', 'Capacitor', 'Spare', 'Space'] as const;
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

  const runProposal = () => {
    const p = proposeLineup(std, intake, {
      maxSections: props.maxSections ?? 10,
      candidateProvider: props.candidateProvider,
    });
    setProposal(p);
  };

  return (
    <Box sx={{ p: 3, bgcolor: C.bg }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 16 }}>Requirements Intake</Typography>
          <Typography sx={{ color: C.sub, fontSize: 12 }}>
            Capture the customer requirement — the engine proposes the full line-up from here.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={() => props.onSaveIntake(intake)} sx={{ color: C.sub, textTransform: 'none', border: `1px solid ${C.border}` }}>
            Save intake
          </Button>
          <Button
            variant="contained" startIcon={<AutoAwesomeRoundedIcon />}
            onClick={runProposal}
            sx={{ bgcolor: C.blue, textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#1565C0' } }}
          >
            Propose line-up
          </Button>
        </Stack>
      </Stack>

      {/* Board-level intake */}
      <Box sx={card}>
        <Typography sx={cardTitle}>System</Typography>
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
      <Box sx={{ ...card, mt: 2 }} onPaste={handlePaste}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography sx={cardTitle}>Feeder Schedule</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Copy rows in Excel (description, type, unit, value, PF, continuous, poles, qty) and paste anywhere in this panel">
              <Chip icon={<ContentPasteRoundedIcon sx={{ fontSize: 14 }} />} label="Paste from Excel supported"
                size="small" sx={{ bgcolor: 'transparent', border: `1px solid ${C.border}`, color: C.sub, fontSize: 11 }} />
            </Tooltip>
            <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => patch({ feeders: [...intake.feeders, newRow()] })}
              sx={{ color: C.blue, textTransform: 'none', fontSize: 12 }}>
              Add feeder
            </Button>
          </Stack>
        </Stack>
        {pasteInfo && <Alert severity="info" sx={alertSx} onClose={() => setPasteInfo(null)}>{pasteInfo}</Alert>}

        <Table size="small" sx={{ mt: 1, '& td, & th': { borderColor: C.border, color: C.text, fontSize: 12.5, py: 0.6 } }}>
          <TableHead>
            <TableRow>
              {['#', 'Description', 'Load Type', 'Unit', 'Value', 'PF', 'Cont.', 'Poles', 'Qty', ''].map((h) => (
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
                      loadInputMode: e.target.value === 'Motor' ? 'HP' : r.loadInputMode === 'HP' ? 'A' : r.loadInputMode,
                    })}>
                    {LOAD_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ fontSize: 12.5 }}>{t}</MenuItem>)}
                  </Select>
                </TableCell>
                <TableCell sx={{ width: 70 }}>
                  <Select variant="standard" disableUnderline value={r.loadInputMode} fullWidth sx={cell}
                    onChange={(e) => patchRow(r.rowId, { loadInputMode: e.target.value as any })}>
                    {MODES.filter((m) => (r.loadType === 'Motor' ? true : m !== 'HP')).map((m) => (
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
        <Typography sx={{ color: C.muted, fontSize: 11, mt: 1 }}>
          {totals.rows} row(s) • {totals.devices} device position(s) • Spare reserves a device, Space reserves room only
        </Typography>
      </Box>

      {/* Proposal diff preview — nothing applies silently (Phase C §4.3) */}
      <Dialog open={!!proposal} onClose={() => setProposal(null)} fullWidth maxWidth="md"
        PaperProps={{ sx: { bgcolor: C.surface, border: `1px solid ${C.border}`, backgroundImage: 'none' } }}>
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
                      <Typography sx={{ color: C.text, fontSize: 12.5 }}>
                        {d.device ? `${d.device.manufacturer} ${d.device.frameModel} — ${d.device.ratedA} A, ${d.device.interruptingKA} kA, ${d.device.mounting}` : 'No candidate found'}
                      </Typography>
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
    <Box sx={{ bgcolor: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', p: 1.25 }}>
      <Typography sx={{ color: C.muted, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.7px' }}>{label}</Typography>
      <Typography sx={{ color: C.text, fontSize: 16, fontWeight: 700, mt: 0.25 }}>{value}</Typography>
    </Box>
  );
}

const card = { bgcolor: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', p: 2.25 };
const cardTitle = { color: '#CBD5E1', fontSize: 13.5, fontWeight: 600, mb: 1.5 };
const input = {
  color: C.text, fontSize: 13, bgcolor: C.bg,
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
