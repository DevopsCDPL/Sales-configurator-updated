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
  DialogTitle, DialogContent, DialogActions, MenuItem,
  Tabs, Tab, InputAdornment, Tooltip,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { configuratorService, ConfiguratorComponent } from '../../services/configuratorService';
import configuratorV2Service from '../../services/configuratorV2Service';
import PriceSourceDot from '../components/PriceSourceDot';
import CbFilterPanel from '../components/CbFilterPanel';
import CatalogNumberBuilderDialog from '../components/CatalogNumberBuilderDialog';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const BUCKETS = ['lbr_cu', 'lbr_asm', 'lbr_cnt', 'lbr_qc', 'lbr_tst', 'lbr_eng', 'lbr_cad'] as const;
const BUCKET_SHORT: Record<string, string> = {
  lbr_cu: 'CU', lbr_asm: 'ASM', lbr_cnt: 'CNT', lbr_qc: 'QC', lbr_tst: 'TST', lbr_eng: 'ENG', lbr_cad: 'CAD',
};

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.55 };
const headSx = { color: C.sub, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, borderBottom: '1px solid ' + C.border, py: 0.7, whiteSpace: 'nowrap' };
const usd = (n: number) => Math.ceil(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.surface, color: C.text, fontSize: 12.5,
    '& fieldset': { borderColor: C.border },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
  '& input': { color: C.text },
  '& .MuiInputLabel-root': { color: C.sub, fontSize: 12 },
};

interface EditState {
  id?: string;
  name: string; category: string; part_number: string; description: string;
  price: string; priceType: string;
  spec_deviceClass: string; spec_catalogNumber: string; spec_manufacturer: string;
  spec_series: string; spec_frameModel: string; spec_ratedCurrentA: string;
  spec_poles: string; spec_interruptingKA: string;
  __origSpec?: any;
  [k: string]: any;
}
const emptyEdit = (cat?: string): EditState => ({
  name: '', category: cat ?? 'HARDWARE', part_number: '', description: '', price: '',
  priceType: 'FIRM',
  lbr_cu: '', lbr_asm: '', lbr_cnt: '', lbr_qc: '', lbr_tst: '', lbr_eng: '', lbr_cad: '',
  spec_deviceClass: '', spec_catalogNumber: '', spec_manufacturer: '',
  spec_series: '', spec_frameModel: '', spec_ratedCurrentA: '',
  spec_poles: '', spec_interruptingKA: '',
  __origSpec: {},
});

const DEFAULT_CATEGORIES = [
  'CIRCUIT BREAKER','ENCLOSURE','BUSSING','HARDWARE','LUGS','TERMINALS','CONTROLS',
  'WIRE CABLE','CONDUIT','CT / VT / CPT','SPD','ATS','RELAY','SWITCH','CAMLOCK',
  'GLASTIC','LIGHT','STANDARD PRODUCT',
];

const CatalogManagerPanel: React.FC = () => {
  const [counts, setCounts] = useState<{ category: string; count: number }[]>([]);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ConfiguratorComponent[]>([]);
  const [filteredRows, setFilteredRows] = useState<ConfiguratorComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [builderFor, setBuilderFor] = useState<ConfiguratorComponent | null>(null);
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
  // CIRCUIT BREAKER tab gets a cascading filter slot; others render all rows.
  useEffect(() => { setFilteredRows(rows); }, [rows, category]);
  const isCb = (category || '').toUpperCase() === 'CIRCUIT BREAKER';
  const gridRows = isCb ? filteredRows : rows;

  const openEdit = (r?: ConfiguratorComponent, duplicate = false) => {
    if (!r) { setEdit(emptyEdit(category || undefined)); return; }
    const e: EditState = {
      id: duplicate ? undefined : r.id,
      name: duplicate ? (r.name ?? '') + ' (copy)' : r.name ?? '',
      category: r.category ?? 'HARDWARE',
      part_number: duplicate ? '' : r.part_number ?? '',
      description: r.description ?? '',
      price: String(r.price ?? r.mat_cost ?? ''),
      priceType: (r as any).price_status === 'ESTIMATED' ? 'ESTIMATED' : 'FIRM',
      spec_deviceClass: String((r as any).specifications?.deviceClass ?? ''),
      spec_catalogNumber: String((r as any).specifications?.catalogNumber ?? ''),
      spec_manufacturer: String((r as any).specifications?.manufacturer ?? ''),
      spec_series: String((r as any).specifications?.series ?? ''),
      spec_frameModel: String((r as any).specifications?.frameModel ?? ''),
      spec_ratedCurrentA: String((r as any).specifications?.ratedCurrentA ?? ''),
      spec_poles: String((r as any).specifications?.poles ?? ''),
      spec_interruptingKA: String((r as any).specifications?.interruptingKA ?? ''),
      __origSpec: (r as any).specifications ?? {},
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
        price_status: (Number(edit.price) || 0) > 0 ? (edit.priceType === 'ESTIMATED' ? 'ESTIMATED' : 'FIRM') : 'PENDING_RFQ',
        is_active: true,
      };
      BUCKETS.forEach((b) => { payload[b] = Number(edit[b]) || 0; });
      const isCbSave = edit.category.toUpperCase().trim() === 'CIRCUIT BREAKER';
      const specFields = {
        deviceClass: edit.spec_deviceClass, catalogNumber: edit.spec_catalogNumber,
        manufacturer: edit.spec_manufacturer, series: edit.spec_series,
        frameModel: edit.spec_frameModel, ratedCurrentA: edit.spec_ratedCurrentA,
        poles: edit.spec_poles, interruptingKA: edit.spec_interruptingKA,
      };
      const hasAnySpec = Object.values(specFields).some((v) => v.trim() !== '');
      if (isCbSave || hasAnySpec) {
        const specEdits: any = {};
        if (specFields.deviceClass.trim()) specEdits.deviceClass = specFields.deviceClass.trim();
        if (specFields.catalogNumber.trim()) specEdits.catalogNumber = specFields.catalogNumber.trim();
        if (specFields.manufacturer.trim()) specEdits.manufacturer = specFields.manufacturer.trim();
        if (specFields.series.trim()) specEdits.series = specFields.series.trim();
        if (specFields.frameModel.trim()) specEdits.frameModel = specFields.frameModel.trim();
        const rca = specFields.ratedCurrentA.trim();
        if (rca) specEdits.ratedCurrentA = /^[\d.]+$/.test(rca) ? Number(rca) : rca;
        const pol = specFields.poles.trim();
        if (pol) specEdits.poles = /^[\d.]+$/.test(pol) ? Number(pol) : pol;
        const ika = specFields.interruptingKA.trim();
        if (ika) specEdits.interruptingKA = /^[\d.]+$/.test(ika) ? Number(ika) : ika;
        payload.specifications = { ...(edit.__origSpec ?? {}), ...specEdits };
      }
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
        <TextField
          size="small" placeholder="Search name, part #, description…" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={search} sx={{ color: C.sub, p: 0.3, '&:hover': { color: C.blue } }}>
                  <SearchRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ ...inputSx, maxWidth: 360 }}
        />
        <Box sx={{ flex: 1 }} />
        <input
          ref={fileRef} type="file" accept=".xlsm,.xlsx" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importWb(f); }}
        />
        <Button
          startIcon={<UploadFileRoundedIcon sx={{ fontSize: 16 }} />}
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          sx={{ color: C.text, textTransform: 'none', fontSize: 12.5, border: '1px solid ' + C.border, bgcolor: C.bg, '&:hover': { borderColor: C.blue } }}
        >
          {importing ? 'Importing…' : 'Import TPS workbook'}
        </Button>
        <Button
          startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={() => openEdit()}
          sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 600, fontSize: 12.5, '&:hover': { bgcolor: '#33d4ff' } }}
        >
          Add component
        </Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>{error}</Alert>}
      {info && <Alert severity="success" onClose={() => setInfo(null)} sx={{ mb: 1.5, bgcolor: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid ' + C.border, fontSize: 12 }}>{info}</Alert>}

      {/* Category tabs */}
      <Tabs
        value={category}
        onChange={(_e, v) => setCategory(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 1.5,
          minHeight: 36,
          '& .MuiTabs-indicator': { bgcolor: '#00c8ff', height: 2 },
          '& .MuiTab-root': {
            textTransform: 'none', fontSize: '0.78rem', minHeight: 36,
            color: 'rgba(217,228,251,0.7)',
            '&.Mui-selected': { color: '#00c8ff' },
          },
        }}
      >
        <Tab label="All" value="" />
        {(() => {
          const serverMap = new Map(counts.map((c) => [c.category.toUpperCase(), c.count]));
          const merged: { category: string; count: number }[] = DEFAULT_CATEGORIES.map((cat) => ({
            category: cat,
            count: serverMap.get(cat) ?? 0,
          }));
          counts.forEach((c) => {
            if (!DEFAULT_CATEGORIES.includes(c.category.toUpperCase())) {
              merged.push({ category: c.category, count: c.count });
            }
          });
          return merged.map((c) => (
            <Tab key={c.category} label={`${c.category} (${c.count})`} value={c.category} />
          ));
        })()}
      </Tabs>

      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={0}>
          {([['cards', GridViewRoundedIcon], ['list', TableRowsRoundedIcon]] as const).map(([key, Icon]) => (
            <IconButton
              key={key} size="small" onClick={() => setView(key)}
              sx={{
                color: view === key ? '#06151c' : C.sub, borderRadius: '6px',
                bgcolor: view === key ? C.blue : 'transparent',
                border: '1px solid ' + (view === key ? C.blue : C.border),
                ml: key === 'list' ? 0.5 : 0,
              }}
            >
              <Icon sx={{ fontSize: 16 }} />
            </IconButton>
          ))}
        </Stack>
      </Stack>

      {isCb && !loading && (
        <CbFilterPanel items={rows} onFiltered={setFilteredRows} />
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={22} sx={{ color: C.blue }} /></Stack>
      ) : view === 'cards' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 1.5 }}>
          {gridRows.map((r) => {
            const spec = (r as any).specifications ?? {};
            const priceStatus = (r as any).price_status ?? 'PENDING_RFQ';
            const isCbCard = (r.category ?? '').toUpperCase() === 'CIRCUIT BREAKER';
            // Derive device class title
            const deviceTitle = spec.deviceClass
              ? spec.deviceClass
              : (r.name ?? '').split(/[\s,_\-]+/).slice(0, 2).join(' ') || (r.category ?? '—');
            // Specification row value
            const specValue = isCbCard
              ? [spec.ratedCurrentA && spec.ratedCurrentA + 'A', spec.interruptingKA && spec.interruptingKA + 'kA', spec.poles && spec.poles + 'P'].filter(Boolean).join(' / ') || '—'
              : ((r.description ?? '').slice(0, 60) || '—');
            // SKU display
            const skuFull = r.part_number ?? '';
            const skuShort = skuFull.length > 12 ? skuFull.slice(0, 12) + '…' : skuFull || '—';
            // Status dot color + tooltip
            const dotColor = priceStatus === 'FIRM' ? C.green : priceStatus === 'ESTIMATED' ? C.amber : C.red;
            const dotTip   = priceStatus === 'FIRM' ? 'Firm price' : priceStatus === 'ESTIMATED' ? 'Estimated price' : 'No firm price — RFQ required';
            return (
              <Box
                key={r.id}
                sx={{
                  bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', p: 1.5,
                  transition: 'border-color .15s, box-shadow .15s',
                  '&:hover': { borderColor: '#00c8ff', boxShadow: '0 0 14px rgba(0,200,255,0.3)' },
                  display: 'flex', flexDirection: 'column', gap: 0.75, minHeight: 150,
                }}
              >
                {/* ROW 1 — category chip + spacer + 3 action icons */}
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Chip
                    label={r.category}
                    size="small"
                    sx={{ bgcolor: 'rgba(0,200,255,0.10)', color: '#00c8ff', fontSize: 9.5, height: 18, maxWidth: 120, '& .MuiChip-label': { px: 1 } }}
                  />
                  <Box sx={{ flex: 1 }} />
                  <IconButton size="small" onClick={() => openEdit(r)} sx={{ color: C.sub, p: 0.4, '&:hover': { color: C.blue } }}><EditRoundedIcon sx={{ fontSize: 14 }} /></IconButton>
                  <IconButton size="small" onClick={() => openEdit(r, true)} sx={{ color: C.sub, p: 0.4, '&:hover': { color: C.blue } }}><ContentCopyRoundedIcon sx={{ fontSize: 13 }} /></IconButton>
                  <IconButton size="small" onClick={() => remove(r)} sx={{ color: C.sub, p: 0.4, '&:hover': { color: C.red } }}><DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} /></IconButton>
                </Stack>

                {/* ROW 2 — device class title + SKU chip + status dot */}
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Typography sx={{ color: '#F0F6FF', fontSize: 17, fontWeight: 800, flex: 1, lineHeight: 1.15 }} noWrap title={deviceTitle}>
                    {deviceTitle}
                  </Typography>
                  <Tooltip title={skuFull || 'No part number'}>
                    <Chip
                      label={'SKU: ' + skuShort}
                      size="small"
                      sx={{ bgcolor: 'transparent', border: '1px solid #1E2235', color: '#A9B6C9', fontSize: 9.5, height: 18, flexShrink: 0, '& .MuiChip-label': { px: 1 } }}
                    />
                  </Tooltip>
                  <Tooltip title={dotTip}>
                    <Box
                      sx={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        bgcolor: dotColor, boxShadow: `0 0 6px ${dotColor}`,
                      }}
                    />
                  </Tooltip>
                </Stack>

                {/* ROW 3-5 — labeled info rows */}
                {([
                  ['Catalog Number', spec.catalogNumber ?? '—'],
                  ['Manufacturer',   [spec.manufacturer, spec.series, spec.frameModel].filter(Boolean).join(', ') || '—'],
                  ['Specification',  specValue],
                ] as [string, string][]).map(([label, value]) => (
                  <Stack key={label} direction="row" alignItems="flex-start" spacing={0.5}>
                    <Typography sx={{ color: '#8E9AAD', fontSize: 11.5, width: 110, flexShrink: 0, lineHeight: 1.4 }}>{label}</Typography>
                    <Typography sx={{ color: '#E2E8F0', fontSize: 11.5, flex: 1, lineHeight: 1.4 }} noWrap title={value}>{value}</Typography>
                  </Stack>
                ))}

                {/* ROW 6 — footer: builder button (CB only) + price */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 'auto', pt: 0.5 }}>
                  {isCbCard ? (
                    <Button
                      size="small"
                      onClick={() => setBuilderFor(r)}
                      sx={{
                        bgcolor: '#00c8ff', color: '#06151c',
                        textTransform: 'none', fontWeight: 700, fontSize: 11.5,
                        px: 1.5, borderRadius: '8px', minWidth: 0,
                        border: '1px solid transparent', transition: 'all .15s',
                        '&:hover': { bgcolor: 'transparent', color: '#00c8ff', border: '1px solid #00c8ff', boxShadow: '0 0 10px rgba(0,200,255,0.35)' },
                      }}
                    >
                      Generate Catalog No.
                    </Button>
                  ) : (
                    <Box />
                  )}
                  <Stack direction="row" alignItems="center">
                    {Number(r.price) > 0 ? (
                      <>
                        <PriceSourceDot source={spec.priceSource} />
                        <Typography sx={{ color: '#00c8ff', fontSize: 16, fontWeight: 800 }}>
                          {usd(Number(r.price))}
                        </Typography>
                      </>
                    ) : (
                      <Tooltip title="No quote received yet — raise an RFQ">
                        <Typography sx={{ color: C.red, fontSize: 14, fontWeight: 800 }}>
                          RFQ $
                        </Typography>
                      </Tooltip>
                    )}
                  </Stack>
                </Stack>
              </Box>
            );
          })}
          {!gridRows.length && (
            <Typography sx={{ color: C.sub, fontSize: 12.5, p: 3 }}>
              No components in this view — add one or import the TPS workbook.
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'auto' }}>
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
              {gridRows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{r.category}</TableCell>
                  <TableCell sx={cellSx}>{r.name}</TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{r.part_number ?? '—'}</TableCell>
                  <TableCell sx={cellSx} align="right">
                    {Number(r.price) > 0 ? (
                      <><PriceSourceDot source={(r as any).specifications?.priceSource} />{usd(Number(r.price))}</>
                    ) : (
                      <Tooltip title="No quote received yet — raise an RFQ">
                        <Typography component="span" sx={{ color: C.red, fontSize: 12, fontWeight: 800 }}>RFQ $</Typography>
                      </Tooltip>
                    )}
                  </TableCell>
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
          {!gridRows.length && (
            <Typography sx={{ color: C.sub, fontSize: 12.5, p: 3, textAlign: 'center' }}>
              No components in this view — add one or import the TPS workbook.
            </Typography>
          )}
        </Box>
      )}

      {/* Catalog Number Builder dialog */}
      <CatalogNumberBuilderDialog
        open={!!builderFor}
        component={builderFor}
        onClose={() => setBuilderFor(null)}
        onSaved={() => { setInfo('Catalog number saved'); search(); }}
      />

      {/* Add/Edit dialog */}
      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: C.bg, border: '1px solid ' + C.border, backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: C.text, fontSize: 15, fontWeight: 700 }}>
          {edit?.id ? 'Edit component' : 'Add component'}
        </DialogTitle>
        {edit && (
          <DialogContent>
            <Stack spacing={1.5} sx={{ mt: 0.5 }}>
              <TextField size="small" label="Name *" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} sx={inputSx} fullWidth />
              <Stack direction="row" spacing={1.5}>
                <Autocomplete
                  freeSolo
                  options={[...new Set([edit.category, ...counts.map((c) => c.category)])]}
                  value={edit.category}
                  onInputChange={(_e, v) => setEdit({ ...edit, category: (v || '').toUpperCase() })}
                  sx={{ minWidth: 200 }}
                  renderInput={(params) => (
                    <TextField
                      {...params} size="small" label="Category (type to create new)"
                      sx={inputSx}
                    />
                  )}
                />
                <TextField size="small" label="Part number" value={edit.part_number} onChange={(e) => setEdit({ ...edit, part_number: e.target.value })} sx={inputSx} fullWidth />
              </Stack>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <TextField size="small" label="Price ($)" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value.replace(/[^0-9.]/g, '') })} sx={{ ...inputSx, width: 140 }} />
                <TextField
                  select size="small" label="Price type" value={edit.priceType}
                  onChange={(e) => setEdit({ ...edit, priceType: e.target.value })}
                  sx={{ ...inputSx, width: 180 }}
                >
                  <MenuItem value="FIRM">Firm price</MenuItem>
                  <MenuItem value="ESTIMATED">Approximate / estimated</MenuItem>
                </TextField>
                <TextField size="small" label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} sx={inputSx} fullWidth />
              </Stack>
              <Typography sx={{ color: C.sub, fontSize: 10.5 }}>
                Leave price empty → component shows RFQ $ until a quote is received.
              </Typography>
              {edit.category.toUpperCase().trim() === 'CIRCUIT BREAKER' && (
                <>
                  <Typography sx={{ color: C.sub, fontSize: 11, fontWeight: 700, mt: 0.5 }}>
                    Circuit breaker details (drive the card + filters)
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                    {([
                      ['spec_deviceClass', 'Breaker Type (ACB / MCCB…)'],
                      ['spec_catalogNumber', 'Catalog Number'],
                      ['spec_manufacturer', 'Manufacturer'],
                      ['spec_series', 'Series / Product Family'],
                      ['spec_frameModel', 'Frame / Model'],
                      ['spec_ratedCurrentA', 'Rated Current (A)'],
                      ['spec_poles', 'No. of Poles'],
                      ['spec_interruptingKA', 'Breaking Capacity (kA)'],
                    ] as [string, string][]).map(([key, label]) => (
                      <TextField
                        key={key} size="small" label={label}
                        value={edit[key] ?? ''}
                        onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                        sx={inputSx}
                      />
                    ))}
                  </Box>
                </>
              )}
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
          <Button disabled={saving} onClick={save} sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#33d4ff' } }}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CatalogManagerPanel;
