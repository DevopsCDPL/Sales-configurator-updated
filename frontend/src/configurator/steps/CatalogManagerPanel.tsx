/**
 * CatalogManagerPanel — the component catalog, owned by the user.
 *
 * Categories are first-class (breakers separate, every class its own
 * filter). Components are addable, editable, duplicatable, deletable —
 * price, part number and all 7 labour-hour buckets. "Import TPS
 * workbook" ingests TPS_Estimate_23XX.xlsm: components + labour hours
 * + real bus schedule + copper $/lb + labour rates in one shot.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress, TextField,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, MenuItem, Select,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import { configuratorService, ConfiguratorComponent } from '../../services/configuratorService';
import configuratorV2Service from '../../services/configuratorV2Service';

const C = {
  bg: '#0D0D14', surface: '#13131E', border: '#1E2235', blue: '#1976D2',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const BUCKETS = ['lbr_cu', 'lbr_asm', 'lbr_cnt', 'lbr_qc', 'lbr_tst', 'lbr_eng', 'lbr_cad'] as const;
const BUCKET_SHORT: Record<string, string> = {
  lbr_cu: 'CU', lbr_asm: 'ASM', lbr_cnt: 'CNT', lbr_qc: 'QC', lbr_tst: 'TST', lbr_eng: 'ENG', lbr_cad: 'CAD',
};

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.55 };
const headSx = { color: C.sub, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, borderBottom: '1px solid ' + C.border, py: 0.7, whiteSpace: 'nowrap' };
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.bg, color: C.text, fontSize: 12.5,
    '& fieldset': { borderColor: C.border },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
  '& input': { color: C.text },
  '& .MuiInputLabel-root': { color: C.sub, fontSize: 12 },
};

interface EditState {
  id?: string;
  name: string; category: string; part_number: string; description: string;
  price: string; [k: string]: any;
}
const emptyEdit = (cat?: string): EditState => ({
  name: '', category: cat ?? 'HARDWARE', part_number: '', description: '', price: '',
  lbr_cu: '', lbr_asm: '', lbr_cnt: '', lbr_qc: '', lbr_tst: '', lbr_eng: '', lbr_cad: '',
});

const CatalogManagerPanel: React.FC = () => {
  const [counts, setCounts] = useState<{ category: string; count: number }[]>([]);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ConfiguratorComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCounts = useCallback(async () => {
    try { setCounts((await configuratorService.componentCategoryCounts()).filter((c) => c.count > 0)); } catch { /* */ }
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: 200 };
      if (category) params.category = category;
      if (q.trim()) params.q = q.trim();
      setRows(await configuratorService.listComponents(params));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Catalog load failed');
    } finally {
      setLoading(false);
    }
  }, [category, q]);

  useEffect(() => { loadCounts(); }, [loadCounts]);
  useEffect(() => { search(); }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = (r?: ConfiguratorComponent, duplicate = false) => {
    if (!r) { setEdit(emptyEdit(category || undefined)); return; }
    const e: EditState = {
      id: duplicate ? undefined : r.id,
      name: duplicate ? (r.name ?? '') + ' (copy)' : r.name ?? '',
      category: r.category ?? 'HARDWARE',
      part_number: duplicate ? '' : r.part_number ?? '',
      description: r.description ?? '',
      price: String(r.price ?? r.mat_cost ?? ''),
    };
    BUCKETS.forEach((b) => { e[b] = String((r as any)[b] ?? '') === '0' ? '' : String((r as any)[b] ?? ''); });
    setEdit(e);
  };

  const save = async () => {
    if (!edit || !edit.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        name: edit.name.trim(),
        category: edit.category,
        part_number: edit.part_number.trim() || null,
        description: edit.description.trim() || null,
        price: Number(edit.price) || 0,
        mat_cost: Number(edit.price) || 0,
        material_cost: Number(edit.price) || 0,
        price_status: (Number(edit.price) || 0) > 0 ? 'FIRM' : 'PENDING_RFQ',
        is_active: true,
      };
      BUCKETS.forEach((b) => { payload[b] = Number(edit[b]) || 0; });
      if (edit.id) await configuratorService.updateComponent(edit.id, payload);
      else await configuratorService.createComponent(payload);
      setInfo(edit.id ? 'Component updated' : 'Component added');
      setEdit(null);
      await Promise.all([search(), loadCounts()]);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: ConfiguratorComponent) => {
    try {
      await configuratorService.deleteComponent(r.id);
      await Promise.all([search(), loadCounts()]);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Delete failed');
    }
  };

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
      await Promise.all([search(), loadCounts()]);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Workbook import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Box sx={{ px: 3, pb: 4, pt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Box sx={{ mr: 1 }}>
          <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Component catalog</Typography>
          <Typography sx={{ color: C.sub, fontSize: 12 }}>
            One source for every screen — prices, part numbers and labour-hour buckets, separated by category.
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <input
          ref={fileRef} type="file" accept=".xlsm,.xlsx" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importWb(f); }}
        />
        <Button
          startIcon={<UploadFileRoundedIcon sx={{ fontSize: 16 }} />}
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          sx={{ color: C.text, textTransform: 'none', fontSize: 12.5, border: '1px solid ' + C.border, bgcolor: C.surface, '&:hover': { borderColor: C.blue } }}
        >
          {importing ? 'Importing…' : 'Import TPS workbook'}
        </Button>
        <Button
          startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={() => openEdit()}
          sx={{ bgcolor: C.blue, color: '#fff', textTransform: 'none', fontWeight: 600, fontSize: 12.5, '&:hover': { bgcolor: '#1565C0' } }}
        >
          Add component
        </Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>{error}</Alert>}
      {info && <Alert severity="success" onClose={() => setInfo(null)} sx={{ mb: 1.5, bgcolor: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid ' + C.border, fontSize: 12 }}>{info}</Alert>}

      {/* Category chips */}
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Chip
          label="All" size="small" onClick={() => setCategory('')}
          sx={{ bgcolor: !category ? C.blue : 'transparent', color: !category ? '#fff' : C.sub, border: '1px solid ' + (!category ? C.blue : C.border), fontSize: 11 }}
        />
        {counts.map((c) => (
          <Chip
            key={c.category}
            label={`${c.category} (${c.count})`}
            size="small"
            onClick={() => setCategory(c.category)}
            sx={{
              bgcolor: category === c.category ? C.blue : 'transparent',
              color: category === c.category ? '#fff' : C.sub,
              border: '1px solid ' + (category === c.category ? C.blue : C.border), fontSize: 11,
            }}
          />
        ))}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <TextField
          size="small" placeholder="Search name, part #, description… (Enter)" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          sx={{ ...inputSx, flex: 1, maxWidth: 420 }}
        />
        <Button onClick={search} sx={{ color: C.sub, textTransform: 'none', fontSize: 12, border: '1px solid ' + C.border }}>Search</Button>
      </Stack>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={22} sx={{ color: C.blue }} /></Stack>
      ) : (
        <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'auto' }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>CATEGORY</TableCell>
                <TableCell sx={headSx}>NAME</TableCell>
                <TableCell sx={headSx}>PART #</TableCell>
                <TableCell sx={headSx} align="right">PRICE</TableCell>
                {BUCKETS.map((b) => <TableCell key={b} sx={headSx} align="right">{BUCKET_SHORT[b]}</TableCell>)}
                <TableCell sx={headSx}>STATUS</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{r.category}</TableCell>
                  <TableCell sx={cellSx}>{r.name}</TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{r.part_number ?? '—'}</TableCell>
                  <TableCell sx={cellSx} align="right">{Number(r.price) ? usd(Number(r.price)) : '—'}</TableCell>
                  {BUCKETS.map((b) => (
                    <TableCell key={b} sx={{ ...cellSx, color: Number((r as any)[b]) ? C.text : '#2A3050' }} align="right">
                      {Number((r as any)[b]) || '·'}
                    </TableCell>
                  ))}
                  <TableCell sx={cellSx}>
                    <Chip
                      label={(r as any).price_status === 'PENDING_RFQ' ? 'RFQ' : 'FIRM'}
                      size="small"
                      sx={{ bgcolor: 'transparent', border: '1px solid ' + ((r as any).price_status === 'PENDING_RFQ' ? C.amber : C.green), color: (r as any).price_status === 'PENDING_RFQ' ? C.amber : C.green, fontSize: 9, height: 17 }}
                    />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }} align="right">
                    <IconButton size="small" onClick={() => openEdit(r)} sx={{ color: C.sub, '&:hover': { color: C.blue } }}><EditRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                    <IconButton size="small" onClick={() => openEdit(r, true)} sx={{ color: C.sub, '&:hover': { color: C.blue } }}><ContentCopyRoundedIcon sx={{ fontSize: 14 }} /></IconButton>
                    <IconButton size="small" onClick={() => remove(r)} sx={{ color: C.sub, '&:hover': { color: C.red } }}><DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!rows.length && (
            <Typography sx={{ color: C.sub, fontSize: 12.5, p: 3, textAlign: 'center' }}>
              No components in this view — add one or import the TPS workbook.
            </Typography>
          )}
        </Box>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: C.surface, border: '1px solid ' + C.border, backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: C.text, fontSize: 15, fontWeight: 700 }}>
          {edit?.id ? 'Edit component' : 'Add component'}
        </DialogTitle>
        {edit && (
          <DialogContent>
            <Stack spacing={1.5} sx={{ mt: 0.5 }}>
              <TextField size="small" label="Name *" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} sx={inputSx} fullWidth />
              <Stack direction="row" spacing={1.5}>
                <Select
                  size="small" value={edit.category}
                  onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                  sx={{ minWidth: 200, bgcolor: C.bg, color: C.text, fontSize: 13, '& fieldset': { borderColor: C.border } }}
                >
                  {[...new Set([edit.category, ...counts.map((c) => c.category)])].map((c) => (
                    <MenuItem key={c} value={c} sx={{ fontSize: 12.5 }}>{c}</MenuItem>
                  ))}
                </Select>
                <TextField size="small" label="Part number" value={edit.part_number} onChange={(e) => setEdit({ ...edit, part_number: e.target.value })} sx={inputSx} fullWidth />
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <TextField size="small" label="Price ($)" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value.replace(/[^0-9.]/g, '') })} sx={{ ...inputSx, width: 160 }} />
                <TextField size="small" label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} sx={inputSx} fullWidth />
              </Stack>
              <Typography sx={{ color: C.sub, fontSize: 11.5 }}>Labour hours per unit (drive the quote automatically)</Typography>
              <Stack direction="row" spacing={1}>
                {BUCKETS.map((b) => (
                  <TextField
                    key={b} size="small" label={BUCKET_SHORT[b]} value={edit[b]}
                    onChange={(e) => setEdit({ ...edit, [b]: e.target.value.replace(/[^0-9.]/g, '') })}
                    sx={{ ...inputSx, width: 76 }}
                  />
                ))}
              </Stack>
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setEdit(null)} sx={{ color: C.sub, textTransform: 'none' }}>Cancel</Button>
          <Button disabled={saving} onClick={save} sx={{ bgcolor: C.blue, color: '#fff', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#1565C0' } }}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CatalogManagerPanel;
