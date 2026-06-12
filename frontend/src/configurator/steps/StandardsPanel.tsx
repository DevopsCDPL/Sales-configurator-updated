/**
 * StandardsPanel — Engineering Standards editor (Phase B on screen)
 *
 * Versioned [SEED] tables that drive every engine decision (bus
 * schedule, support spacing, frames, ladders, motor FLA, safety map).
 * Saving NEVER overwrites: it writes version N+1 and marks it current —
 * old quotes keep pointing at the version they were built with.
 * Cells are edited as a JSON grid; TPS engineering signs off by
 * replacing seed:true rows with verified values.
 *
 * "Import TPS workbook" lives here because the workbook carries
 * standards + labour rates — it belongs with Engineering Standards,
 * not the component catalog.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress, TextField,
  Table, TableHead, TableRow, TableCell, TableBody, MenuItem, Select,
} from '@mui/material';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import configuratorV2Service, { StandardsTableRow } from '../../services/configuratorV2Service';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const TABLES: { key: string; label: string }[] = [
  { key: 'costing_defaults', label: 'Costing defaults (rates, GM%, copper $/lb)' },
  { key: 'component_rules', label: 'Component auto-rules (qty factors, conditions)' },
  { key: 'neutral_bus_schedule', label: 'Neutral bus schedule' },
  { key: 'bus_schedule', label: 'Bus schedule (A → bars)' },
  { key: 'bus_support_spacing', label: 'Bus support spacing (SCCR)' },
  { key: 'frame_library', label: 'Frame library' },
  { key: 'voltage_systems', label: 'Voltage systems' },
  { key: 'ratings_ladders', label: 'Ratings ladders' },
  { key: 'motor_fla', label: 'Motor FLA (NEC 430.250)' },
  { key: 'safety_items_map', label: 'Safety items map' },
];

const cellSx = { color: C.text, fontSize: 11.5, borderBottom: '1px solid ' + C.border, py: 0.4, px: 1 };
const headSx = { color: C.sub, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, borderBottom: '1px solid ' + C.border, py: 0.6, px: 1, whiteSpace: 'nowrap' };

const StandardsPanel: React.FC = () => {
  const [tableKey, setTableKey] = useState('bus_schedule');
  const [table, setTable] = useState<StandardsTableRow | null>(null);
  const [draft, setDraft] = useState<any[] | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const wbRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      setTable(await configuratorV2Service.getStandard(key));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to load table');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tableKey); }, [tableKey, load]);

  const importWb = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const out = await configuratorV2Service.importWorkbook(file);
      setInfo(
        `Workbook imported — ${out.componentsCreated} new / ${out.componentsUpdated} updated components, ` +
        `bus schedule ${out.busScheduleRows} rows, neutral ${out.neutralRows} rows, ` +
        `copper $${out.copperPricePerLb}/lb, rates ${Object.keys(out.ratesFound).length} buckets.` +
        (out.warnings.length ? ` ${out.warnings.length} warning(s).` : '')
      );
      // Reload the current standards table so freshly imported values are visible
      await load(tableKey);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Workbook import failed');
    } finally {
      setImporting(false);
      if (wbRef.current) wbRef.current.value = '';
    }
  };

  const rows: any[] = draft ?? table?.rows ?? [];
  const columns = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r ?? {}).forEach((k) => keys.add(k)));
    return [...keys];
  }, [rows]);

  const edit = (ri: number, col: string, raw: string) => {
    const next = (draft ?? table?.rows ?? []).map((r, i) => {
      if (i !== ri) return r;
      let v: any = raw;
      if (raw === 'true') v = true;
      else if (raw === 'false') v = false;
      else if (raw !== '' && !Number.isNaN(Number(raw))) v = Number(raw);
      else if (raw === '') v = null;
      return { ...r, [col]: v };
    });
    setDraft(next);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await configuratorV2Service.saveStandard(tableKey, draft, notes || undefined);
      setTable(saved);
      setDraft(null);
      setNotes('');
      setInfo('Saved as version ' + saved.version + ' (previous versions retained).');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const seedCount = rows.filter((r) => r?.seed).length;

  return (
    <Box sx={{ px: 3, pb: 4, pt: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Box sx={{ mr: 1 }}>
          <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Engineering Standards</Typography>
          <Typography sx={{ color: C.sub, fontSize: 12 }}>
            Versioned tables that drive the engines. Saving creates a new version — nothing is overwritten.
          </Typography>
        </Box>
        <Select
          size="small" value={tableKey} onChange={(e) => setTableKey(e.target.value)}
          sx={{ minWidth: 240, bgcolor: C.bg, color: C.text, fontSize: 13, '& fieldset': { borderColor: C.border } }}
        >
          {TABLES.map((t) => <MenuItem key={t.key} value={t.key} sx={{ fontSize: 13 }}>{t.label}</MenuItem>)}
        </Select>
        {table && (
          <Chip label={'v' + table.version} size="small" sx={{ bgcolor: 'rgba(0,200,255,0.12)', color: '#60A5FA', fontSize: 10.5, height: 20 }} />
        )}
        {seedCount > 0 && (
          <Chip label={seedCount + ' [SEED] rows — unverified by TPS'} size="small" sx={{ bgcolor: 'transparent', border: '1px solid ' + C.amber, color: C.amber, fontSize: 10.5, height: 20 }} />
        )}
        <Box sx={{ flex: 1 }} />
        {/* Import TPS workbook — ingests standards + labour rates from TPS_Estimate_23XX.xlsm */}
        <input
          ref={wbRef} type="file" accept=".xlsm,.xlsx" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importWb(f); }}
        />
        <Button
          startIcon={<UploadFileRoundedIcon sx={{ fontSize: 16 }} />}
          disabled={importing}
          onClick={() => wbRef.current?.click()}
          sx={{ color: C.text, border: '1px solid ' + C.border, bgcolor: C.bg, textTransform: 'none', fontSize: 12.5, '&:hover': { borderColor: C.blue } }}
        >
          {importing ? 'Importing…' : 'Import TPS workbook'}
        </Button>
        {draft && (
          <>
            <TextField
              size="small" placeholder="Change note (who verified / source)" value={notes}
              onChange={(e) => setNotes(e.target.value)}
              sx={{ width: 260, '& .MuiOutlinedInput-root': { bgcolor: C.surface, color: C.text, fontSize: 12, '& fieldset': { borderColor: C.border } }, '& input': { color: C.text } }}
            />
            <Button
              startIcon={<SaveRoundedIcon sx={{ fontSize: 15 }} />} disabled={saving} onClick={save}
              sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 600, fontSize: 12.5, '&:hover': { bgcolor: '#33d4ff' } }}
            >
              {saving ? 'Saving…' : 'Save as v' + ((table?.version ?? 0) + 1)}
            </Button>
            <Button size="small" onClick={() => setDraft(null)} sx={{ color: C.sub, textTransform: 'none', fontSize: 12 }}>
              Discard
            </Button>
          </>
        )}
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="success" onClose={() => setInfo(null)} sx={{ mb: 1.5, bgcolor: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid ' + C.border, fontSize: 12 }}>
          {info}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={24} sx={{ color: C.blue }} /></Stack>
      ) : !rows.length ? (
        <Box sx={{ bgcolor: C.bg, border: '1px dashed ' + C.border, borderRadius: '10px', p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: C.sub, fontSize: 13 }}>No rows in this table yet.</Typography>
        </Box>
      ) : (
        <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'auto' }}>
          <Table size="small" sx={{ minWidth: 600 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>#</TableCell>
                {columns.map((c) => <TableCell key={c} sx={headSx}>{c.toUpperCase()}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r, ri) => (
                <TableRow key={ri}>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{ri + 1}</TableCell>
                  {columns.map((c) => {
                    const v = r?.[c];
                    const display = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                    const editable = typeof v !== 'object' || v == null;
                    return (
                      <TableCell key={c} sx={cellSx}>
                        {editable ? (
                          <TextField
                            variant="standard" value={display}
                            onChange={(e) => edit(ri, c, e.target.value)}
                            InputProps={{ disableUnderline: true }}
                            sx={{ '& input': { color: c === 'seed' && v === true ? C.amber : C.text, fontSize: 11.5, p: 0 }, minWidth: 50 }}
                          />
                        ) : (
                          <Typography sx={{ color: C.sub, fontSize: 11 }}>{display.slice(0, 40)}</Typography>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
};

export default StandardsPanel;
