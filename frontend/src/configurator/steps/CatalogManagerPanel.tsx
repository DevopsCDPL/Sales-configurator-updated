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
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { configuratorService, ConfiguratorComponent } from '../../services/configuratorService';
import configuratorV2Service from '../../services/configuratorV2Service';
import PriceSourceDot from '../components/PriceSourceDot';
import CbFilterPanel from '../components/CbFilterPanel';
import CategoryFilterPanel, { FilterFieldDef } from '../components/CategoryFilterPanel';
import CatalogNumberBuilderDialog from '../components/CatalogNumberBuilderDialog';
import { displayCase, compactSku } from '../lib/displayCase';
import { vendorService } from '../../services/vendorService';
import { Vendor } from '../../types';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

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
  price: string; priceType: string; priceSource: string;
  spec_deviceClass: string; spec_catalogNumber: string; spec_manufacturer: string;
  spec_series: string; spec_frameModel: string; spec_ratedCurrentA: string;
  spec_poles: string; spec_interruptingKA: string;
  vendorId: string;
  vendorName: string;
  __origSpec?: any;
  [k: string]: any;
}
const emptyEdit = (cat?: string): EditState => ({
  name: '', category: cat ?? 'HARDWARE', part_number: '', description: '', price: '',
  priceType: 'FIRM',
  priceSource: '',
  marginPct: '',
  lbr_cu: '', lbr_asm: '', lbr_cnt: '', lbr_qc: '', lbr_tst: '', lbr_eng: '', lbr_cad: '',
  spec_deviceClass: '', spec_catalogNumber: '', spec_manufacturer: '',
  spec_series: '', spec_frameModel: '', spec_ratedCurrentA: '',
  spec_poles: '', spec_interruptingKA: '',
  vendorId: '', vendorName: '',
  __origSpec: {},
});

const DEFAULT_CATEGORIES = [
  'CIRCUIT BREAKER','CB ACCESSORIES','ENCLOSURE','BUSSING','HARDWARE','LUGS','TERMINALS','CONTROLS',
  'WIRE CABLE','CONDUIT','CT / VT / CPT','SPD','ATS','RELAY','SWITCH','CAMLOCK',
  'GLASTIC','LIGHT','STANDARD PRODUCT','UNKNOWN PARTS',
];

const CATEGORY_FILTERS: Record<string, { title: string; fields: FilterFieldDef[] }> = {
  'ENCLOSURE': { title: 'Enclosure filters', fields: [
    { key: 'manufacturer', label: 'Manufacturer', source: 'spec' },
    { key: 'subcategory', label: 'Type', source: 'spec' },
    { key: 'nemaRating', label: 'NEMA rating', source: 'spec' },
    { key: 'material', label: 'Material', source: 'spec' },
  ]},
  'WIRE CABLE': { title: 'Wire & cable filters', fields: [
    { key: 'manufacturer', label: 'Manufacturer', source: 'spec' },
    { key: 'wireType', label: 'Type', source: 'spec', deriveFromName: /^(THHN|DLO)/i },
    { key: 'awgSize', label: 'Size (AWG/KCMIL)', source: 'spec', deriveFromName: /(?<![.\d])(#?\d+(?:\/\d+)?\s*(?:AWG|KCMIL|MCM))/i },
    { key: 'color', label: 'Color', source: 'spec', deriveFromName: /,\s*(BLK|WHT|GRN|RED|BLU)\s*$/i },
  ]},
  'LUGS': { title: 'Lug filters', fields: [
    { key: 'manufacturer', label: 'Manufacturer', source: 'spec' },
    { key: 'lugType', label: 'Type (mech/comp)', source: 'spec', deriveFromName: /LUG,\s*(MECH|COMP)/i },
    { key: 'holes', label: 'Holes', source: 'spec', deriveFromName: /(\d)-HOLE/i },
    { key: 'wireRange', label: 'Wire range', source: 'spec', deriveFromName: /HOLE,\s*([^,]+KCMIL)/i },
  ]},
  'CAMLOCK': { title: 'Camlock filters', fields: [
    { key: 'gender', label: 'Gender', source: 'spec', deriveFromName: /(MALE|FEMALE)/i },
    { key: 'color', label: 'Color', source: 'spec', deriveFromName: /,(BRN|ORG|YEL|GRN|WHT|BLK|RED|BLU),/i },
    { key: 'style', label: 'Style (stud/cap)', source: 'spec', deriveFromName: /(STUD|CAP)\s*$/i },
  ]},
  'CB ACCESSORIES': { title: 'Accessory filters', fields: [
    { key: 'manufacturer', label: 'Manufacturer', source: 'spec' },
    { key: 'legacyType', label: 'Type', source: 'spec' },
  ]},
};

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
  const xlsRef = useRef<HTMLInputElement>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  useEffect(() => { vendorService.getAll().then(setVendors).catch(() => {}); }, []);

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
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const sourceRows = React.useMemo(() => {
    let out = rows;
    // Axis 1 — PRICE SOURCE (provenance): where the price came from
    if (sourceFilter !== 'all') {
      out = sourceFilter === 'vendor-unresolved'
        ? out.filter((r) => !!(r as any).specifications?.vendorUnresolved)
        : sourceFilter === 'none'
          ? out.filter((r) => !((r as any).specifications?.priceSource))
          : out.filter((r) => (r as any).specifications?.priceSource === sourceFilter);
    }
    // Axis 2 — PRICE STATUS (firmness): FIRM / ESTIMATED / awaiting RFQ
    if (statusFilter !== 'all') {
      out = out.filter((r) => ((r as any).price_status ?? 'PENDING_RFQ') === statusFilter);
    }
    return out;
  }, [rows, sourceFilter, statusFilter]);
  useEffect(() => { setFilteredRows(sourceRows); }, [sourceRows, category]);
  const isCb = (category || '').toUpperCase() === 'CIRCUIT BREAKER';
  const hasFilter = isCb || !!CATEGORY_FILTERS[category];
  const gridRows = hasFilter ? filteredRows : sourceRows;

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
      priceSource: (r as any).specifications?.priceSource ?? '',
      spec_deviceClass: String((r as any).specifications?.deviceClass ?? ''),
      spec_catalogNumber: String((r as any).specifications?.catalogNumber ?? ''),
      spec_manufacturer: String((r as any).specifications?.manufacturer ?? ''),
      spec_series: String((r as any).specifications?.series ?? ''),
      spec_frameModel: String((r as any).specifications?.frameModel ?? ''),
      spec_ratedCurrentA: String((r as any).specifications?.ratedCurrentA ?? ''),
      spec_poles: String((r as any).specifications?.poles ?? ''),
      spec_interruptingKA: String((r as any).specifications?.interruptingKA ?? ''),
      vendorId: (r as any).specifications?.vendorId ?? '',
      vendorName: (r as any).specifications?.vendorName ?? '',
      marginPct: (r as any).specifications?.marginPct != null ? String((r as any).specifications.marginPct) : '',
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
      const marginRaw = String(edit.marginPct ?? '').trim();
      const hasMargin = marginRaw !== '';
      const hasAnySpec = Object.values(specFields).some((v) => v.trim() !== '');
      if (isCbSave || hasAnySpec || edit.vendorId || hasMargin || edit.priceSource) {
        const specEdits: any = {};
        // Per-component margin (spec §1): 0–90, stored on specifications.marginPct.
        // Empty clears it (→ inherit global GM); otherwise clamp into range.
        if (hasMargin) {
          const m = Math.max(0, Math.min(90, Number(marginRaw) || 0));
          specEdits.marginPct = m;
        }
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
        if (edit.vendorId) { specEdits.vendorId = edit.vendorId; specEdits.vendorName = edit.vendorName; }
        if (edit.priceSource) specEdits.priceSource = edit.priceSource;
        payload.specifications = { ...(edit.__origSpec ?? {}), ...specEdits };
        if (!hasMargin) delete payload.specifications.marginPct; // empty = inherit global GM

      }
      if (edit.id) {
        await configuratorService.updateComponent(edit.id, payload);
        setInfo('Component updated');
        setEdit(null);
        await Promise.all([search(), loadCounts()]);
      } else {
        await configuratorService.createComponent(payload);
        setInfo('Component added');
        setEdit(null);
        setSourceFilter('all');
        setStatusFilter('all');
        setCategory(payload.category);
        await loadCounts();
      }
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

  const importComponents = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const out = await configuratorV2Service.importComponentsXlsx(file);
      const msg = `Catalog imported — ${out.created} new, ${out.skipped} skipped${out.errors ? `, ${out.errors} errors` : ''}.`
        + ` Total: ${out.total}.`;
      setInfo(msg);
      await Promise.all([search(), loadCounts()]);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Excel import failed');
    } finally {
      setImporting(false);
      if (xlsRef.current) xlsRef.current.value = '';
    }
  };

  // Helper: format vendor offer price - avoids bare $ before {} in JSX text
  const fmtOfferPrice = (offer: any): string =>
    typeof offer.price === 'number' ? offer.price.toFixed(2) : String(offer.price || '');

  return (
    <Box sx={{ px: 3, pb: 4, pt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Box sx={{ mr: 1 }}>
          <Typography sx={{ color: '#F0F6FF', fontWeight: 800, fontSize: 15 }}>Component catalog</Typography>
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
          ref={xlsRef} type="file" accept=".xlsx" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importComponents(f); }}
        />
        <Button
          disabled={importing}
          onClick={async () => {
            setImporting(true); setError(null);
            try {
              const out = await configuratorV2Service.enrichBundled();
              setInfo(`Scraped catalog synced — ${out.created} new, ${out.updated} enriched, ${out.offersAdded} vendor offers${out.errors ? `, ${out.errors} errors` : ''}.`);
              await Promise.all([search(), loadCounts()]);
            } catch (e: any) {
              setError(e?.response?.data?.error ?? 'Scrape sync failed — no bundled data yet?');
            } finally { setImporting(false); }
          }}
          sx={{ color: C.text, textTransform: 'none', fontSize: 12.5, border: '1px solid ' + C.border, bgcolor: C.bg, '&:hover': { borderColor: C.blue } }}
        >
          Sync scraped catalog
        </Button>
        <Button
          startIcon={<FileDownloadRoundedIcon sx={{ fontSize: 16 }} />}
          disabled={importing}
          onClick={() => configuratorV2Service.exportCatalogXlsx().catch((e: any) => setError(e?.response?.data?.error ?? 'Export failed'))}
          sx={{ color: C.text, textTransform: 'none', fontSize: 12.5, border: '1px solid ' + C.border, bgcolor: C.bg, '&:hover': { borderColor: C.blue } }}
        >
          Download Excel
        </Button>
        <Button
          startIcon={<FileUploadRoundedIcon sx={{ fontSize: 16 }} />}
          disabled={importing}
          onClick={() => xlsRef.current?.click()}
          sx={{ color: C.text, textTransform: 'none', fontSize: 12.5, border: '1px solid ' + C.border, bgcolor: C.bg, '&:hover': { borderColor: C.blue } }}
        >
          {importing ? 'Importing…' : 'Upload Excel'}
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
            <Tab key={c.category} label={`${displayCase(c.category)} (${c.count})`} value={c.category} />
          ));
        })()}
      </Tabs>

      {/* Combined Source + Status filter row — segmented tab-block style */}
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1.5 }}>
        {/* Source segmented group */}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography sx={{ color: C.sub, fontSize: 10.5, mr: 0.25 }}>Source</Typography>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '8px', p: '2px', gap: '2px' }}>
            {([['all','All',''],['vendor-import','TPS','#00c8ff'],['rfq','RFQ','#22C55E'],['web','Web','#D97706'],['manual','Manual','#94A3B8'],['none','Unmarked','#475569'],['vendor-unresolved','Vendor?','#D97706']] as [string,string,string][]).map(([val,label,dot]) => (
              <Box
                key={val}
                onClick={() => setSourceFilter(val)}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  px: '7px', height: 22, borderRadius: '6px', cursor: 'pointer',
                  bgcolor: sourceFilter === val ? 'rgba(0,200,255,0.14)' : 'transparent',
                  color: sourceFilter === val ? C.blue : C.sub,
                  fontSize: 10.5, fontWeight: sourceFilter === val ? 600 : 400,
                  transition: 'all .12s',
                  userSelect: 'none',
                }}
              >
                {dot && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dot, flexShrink: 0 }} />}
                <span>{label}</span>
              </Box>
            ))}
          </Box>
        </Stack>

        {/* Status segmented group */}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography sx={{ color: C.sub, fontSize: 10.5, mr: 0.25 }}>Status</Typography>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '8px', p: '2px', gap: '2px' }}>
            {([['all','All',''],['FIRM','Firm','#22C55E'],['ESTIMATED','Est','#D97706'],['PENDING_RFQ','RFQ','#EF4444']] as [string,string,string][]).map(([val,label,dot]) => (
              <Box
                key={val}
                onClick={() => setStatusFilter(val)}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  px: '7px', height: 22, borderRadius: '6px', cursor: 'pointer',
                  bgcolor: statusFilter === val ? 'rgba(0,200,255,0.14)' : 'transparent',
                  color: statusFilter === val ? C.blue : C.sub,
                  fontSize: 10.5, fontWeight: statusFilter === val ? 600 : 400,
                  transition: 'all .12s',
                  userSelect: 'none',
                }}
              >
                {dot && <Box sx={{ width: 6, height: 6, borderRadius: '1px', bgcolor: dot, flexShrink: 0 }} />}
                <span>{label}</span>
              </Box>
            ))}
          </Box>
        </Stack>

        <Tooltip title="Two independent axes — Source = where the price came from (one per part); Status = whether that price is firm, estimated, or still awaiting an RFQ.">
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: C.sub, cursor: 'default' }}>
            <InfoOutlinedIcon sx={{ fontSize: 13 }} />
          </Box>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        {/* View toggle */}
        {([['cards', GridViewRoundedIcon], ['list', TableRowsRoundedIcon]] as const).map(([key, Icon]) => (
          <IconButton
            key={key} size="small" onClick={() => setView(key)}
            sx={{
              color: view === key ? '#06151c' : C.sub, borderRadius: '6px',
              bgcolor: view === key ? C.blue : 'transparent',
              border: '1px solid ' + (view === key ? C.blue : C.border),
            }}
          >
            <Icon sx={{ fontSize: 16 }} />
          </IconButton>
        ))}
      </Stack>

      {isCb && !loading && (
        <CbFilterPanel items={sourceRows} onFiltered={setFilteredRows} />
      )}
      {!isCb && !loading && !!CATEGORY_FILTERS[category] && (
        <CategoryFilterPanel
          title={CATEGORY_FILTERS[category].title}
          fields={CATEGORY_FILTERS[category].fields}
          items={sourceRows}
          onFiltered={setFilteredRows}
        />
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
            const deviceTitle = displayCase(spec.deviceClass && isCbCard ? String(spec.deviceClass) : (r.name ?? r.category ?? '—'));
            // SKU display
            const skuFull = r.part_number ?? '';
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
                    label={displayCase(r.category)}
                    size="small"
                    sx={{ bgcolor: 'rgba(0,200,255,0.10)', color: '#00c8ff', fontSize: 9.5, height: 18, maxWidth: 120, '& .MuiChip-label': { px: 1 } }}
                  />
                  <Tooltip title={'Price source: ' + (({ 'vendor-import': 'TPS (negotiated)', rfq: 'RFQ confirmed', web: 'Web (approximate)', manual: 'Manual entry' } as Record<string, string>)[spec.priceSource] || 'Unmarked')}>
                    <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0 }}><PriceSourceDot source={spec.priceSource} /></Box>
                  </Tooltip>
                  <Tooltip title={dotTip}>
                    <Chip
                      label={priceStatus === 'FIRM' ? 'FIRM' : priceStatus === 'ESTIMATED' ? 'EST' : 'RFQ'}
                      size="small"
                      sx={{ height: 16, fontSize: 8.5, fontWeight: 700, flexShrink: 0, bgcolor: 'transparent', border: '1px solid ' + dotColor, color: dotColor, borderRadius: '4px', '& .MuiChip-label': { px: 0.6 } }}
                    />
                  </Tooltip>
                  {(r as any).specifications?.vendorUnresolved && (
                    <Tooltip title="Vendor name from spreadsheet didn't match a vendor record — open Edit to assign">
                      <Chip
                        label="Vendor?"
                        size="small"
                        sx={{ bgcolor: 'rgba(217,119,6,0.12)', color: C.amber, border: '1px solid rgba(217,119,6,0.4)', fontSize: 9.5, height: 18, '& .MuiChip-label': { px: 1 } }}
                      />
                    </Tooltip>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <IconButton size="small" onClick={() => openEdit(r)} sx={{ color: C.sub, p: 0.4, '&:hover': { color: C.blue } }}><EditRoundedIcon sx={{ fontSize: 14 }} /></IconButton>
                  <IconButton size="small" onClick={() => openEdit(r, true)} sx={{ color: C.sub, p: 0.4, '&:hover': { color: C.blue } }}><ContentCopyRoundedIcon sx={{ fontSize: 13 }} /></IconButton>
                  <IconButton size="small" onClick={() => remove(r)} sx={{ color: C.sub, p: 0.4, '&:hover': { color: C.red } }}><DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} /></IconButton>
                </Stack>

                {/* ROW 2 — thumbnail + device class title + productUrl + SKU chip + quality star + status dot */}
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  {(r as any).image_url && (
                    <Box
                      component="img"
                      src={(r as any).image_url}
                      alt={r.name ?? ''}
                      sx={{ width: 34, height: 34, objectFit: 'cover', borderRadius: '6px', border: '1px solid #1E2235', flexShrink: 0 }}
                    />
                  )}
                  <Typography sx={{ color: '#F0F6FF', fontSize: 17, fontWeight: 800, flex: 1, lineHeight: 1.15 }} noWrap title={r.name ?? deviceTitle}>
                    {deviceTitle}
                  </Typography>
                  {spec.productUrl && (
                    <Tooltip title="Open product page">
                      <Box
                        component="a"
                        href={spec.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: C.sub, display: 'flex', alignItems: 'center', '&:hover': { color: C.blue } }}
                      >
                        <OpenInNewRoundedIcon sx={{ fontSize: 12 }} />
                      </Box>
                    </Tooltip>
                  )}
                  <Tooltip title={skuFull || 'No part number'}>
                    <Chip
                      label={'SKU: ' + (compactSku(skuFull) || '—')}
                      size="small"
                      sx={{ bgcolor: 'transparent', border: '1px solid #1E2235', color: '#A9B6C9', fontSize: 9.5, height: 18, flexShrink: 0, '& .MuiChip-label': { px: 1 } }}
                    />
                  </Tooltip>
                  {spec.qualityRating != null && (
                    <Tooltip title="Quality rating (web-derived)">
                      <Stack direction="row" alignItems="center" spacing={0.2} sx={{ flexShrink: 0 }}>
                        <StarRoundedIcon sx={{ fontSize: 10.5, color: C.amber }} />
                        <Typography sx={{ fontSize: 10.5, color: C.amber, lineHeight: 1 }}>{spec.qualityRating}</Typography>
                      </Stack>
                    </Tooltip>
                  )}
                </Stack>

                {/* ROW 3-5 — labeled info rows (per category) */}
                {isCbCard ? (
                  ([
                    ['Catalog Number', spec.catalogNumber ?? '—'],
                    ['Manufacturer',   [spec.manufacturer, spec.series, spec.frameModel].filter(Boolean).join(', ') || '—'],
                    ['Specification',  [spec.ratedCurrentA && spec.ratedCurrentA + 'A', spec.interruptingKA && spec.interruptingKA + 'kA', spec.poles && spec.poles + 'P'].filter(Boolean).join(' / ') || '—'],
                  ] as [string, string][]).map(([label, value]) => (
                    <Stack key={label} direction="row" alignItems="flex-start" spacing={0.5}>
                      <Typography sx={{ color: '#8E9AAD', fontSize: 11.5, width: 110, flexShrink: 0, lineHeight: 1.4 }}>{label}</Typography>
                      <Typography sx={{ color: '#E2E8F0', fontSize: 11.5, flex: 1, lineHeight: 1.4 }} noWrap title={value}>{value}</Typography>
                    </Stack>
                  ))
                ) : (
                  <>
                    <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                      <Typography sx={{ color: '#8E9AAD', fontSize: 11.5, width: 110, flexShrink: 0, lineHeight: 1.4 }}>Description</Typography>
                      <Typography
                        sx={{ color: '#E2E8F0', fontSize: 11.5, flex: 1, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        title={(r.description ?? r.name) ?? '—'}
                      >
                        {(r.description ?? r.name) ?? '—'}
                      </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                      <Typography sx={{ color: '#8E9AAD', fontSize: 11.5, width: 110, flexShrink: 0, lineHeight: 1.4 }}>Manufacturer</Typography>
                      <Typography sx={{ color: '#E2E8F0', fontSize: 11.5, flex: 1, lineHeight: 1.4 }} noWrap
                        title={[spec.manufacturer, spec.subcategory && spec.subcategory !== spec.manufacturer ? spec.subcategory : null, spec.legacyType].filter(Boolean).join(', ') || '—'}>
                        {[spec.manufacturer, spec.subcategory && spec.subcategory !== spec.manufacturer ? spec.subcategory : null, spec.legacyType].filter(Boolean).join(', ') || '—'}
                      </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                      <Typography sx={{ color: '#8E9AAD', fontSize: 11.5, width: 110, flexShrink: 0, lineHeight: 1.4 }}>Labour total (hr)</Typography>
                      <Typography sx={{ color: '#E2E8F0', fontSize: 11.5, flex: 1, lineHeight: 1.4 }} noWrap>
                        {(() => { const t = ['lbr_cu','lbr_asm','lbr_cnt','lbr_qc','lbr_tst','lbr_eng','lbr_cad'].reduce((a, k) => a + (Number((r as any)[k]) || 0), 0); return t > 0 ? t.toFixed(2) : '—'; })()}
                      </Typography>
                    </Stack>
                  </>
                )}

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
                      <Typography sx={{ color: '#00c8ff', fontSize: 16, fontWeight: 800 }}>
                        {usd(Number(r.price))}
                      </Typography>
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
                <TableCell sx={headSx}>Category</TableCell>
                <TableCell sx={headSx}>Name</TableCell>
                <TableCell sx={headSx}>Part #</TableCell>
                <TableCell sx={headSx} align="right">Price</TableCell>
                {BUCKETS.map((b) => <TableCell key={b} sx={headSx} align="right">{BUCKET_SHORT[b]}</TableCell>)}
                <TableCell sx={headSx}>Status</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {gridRows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{displayCase(r.category)}</TableCell>
                  <TableCell sx={cellSx}>{displayCase(r.name)}</TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>
                    <Tooltip title={r.part_number ?? ''}><span>{compactSku(r.part_number) || '—'}</span></Tooltip>
                  </TableCell>
                  <TableCell sx={cellSx} align="right">
                    {Number(r.price) > 0 ? (
                      <><PriceSourceDot source={(r as any).specifications?.priceSource} />{usd(Number(r.price))}</>
                    ) : (
                      <><PriceSourceDot source={(r as any).specifications?.priceSource} /><Tooltip title="No quote received yet — raise an RFQ">
                        <Typography component="span" sx={{ color: C.red, fontSize: 12, fontWeight: 800 }}>RFQ $</Typography>
                      </Tooltip></>
                    )}
                  </TableCell>
                  {BUCKETS.map((b) => (
                    <TableCell key={b} sx={{ ...cellSx, color: Number((r as any)[b]) ? C.text : '#2A3050' }} align="right">
                      {Number((r as any)[b]) || '·'}
                    </TableCell>
                  ))}
                  <TableCell sx={cellSx}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Chip
                        label={(r as any).price_status === 'PENDING_RFQ' ? 'RFQ' : 'FIRM'}
                        size="small"
                        sx={{ bgcolor: 'transparent', border: '1px solid ' + ((r as any).price_status === 'PENDING_RFQ' ? C.amber : C.green), color: (r as any).price_status === 'PENDING_RFQ' ? C.amber : C.green, fontSize: 9, height: 17 }}
                      />
                      {(r as any).specifications?.vendorUnresolved && (
                        <Tooltip title="Vendor name from spreadsheet didn't match a vendor record — open Edit to assign">
                          <Chip
                            label="Vendor?"
                            size="small"
                            sx={{ bgcolor: 'rgba(217,119,6,0.12)', color: C.amber, border: '1px solid rgba(217,119,6,0.4)', fontSize: 9, height: 17, '& .MuiChip-label': { px: 0.8 } }}
                          />
                        </Tooltip>
                      )}
                    </Stack>
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
                <TextField
                  size="small" label="Margin %" value={edit.marginPct ?? ''}
                  onChange={(e) => setEdit({ ...edit, marginPct: e.target.value.replace(/[^0-9.]/g, '') })}
                  sx={{ ...inputSx, width: 110 }}
                  placeholder="inherit"
                  InputProps={{ endAdornment: <InputAdornment position="end"><Typography sx={{ color: C.sub, fontSize: 12 }}>%</Typography></InputAdornment> }}
                />
                <TextField
                  select size="small" label="Source" value={edit.priceSource}
                  onChange={(e) => setEdit({ ...edit, priceSource: e.target.value })}
                  sx={{ ...inputSx, width: 170 }}
                >
                  <MenuItem value="">Unmarked</MenuItem>
                  <MenuItem value="vendor-import">TPS (negotiated)</MenuItem>
                  <MenuItem value="rfq">RFQ confirmed</MenuItem>
                  <MenuItem value="web">Web (approximate)</MenuItem>
                  <MenuItem value="manual">Manual entry</MenuItem>
                </TextField>
                <Tooltip title="Margin %: 0–90, empty = inherit the global GM%. Source: how this price was confirmed — TPS = negotiated vendor price, RFQ = confirmed via request-for-quote, Web = scraped approximate, Manual = hand-entered. Leave Price empty → the part shows RFQ $ until a quote is received.">
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: C.sub, alignSelf: 'center', '&:hover': { color: C.blue } }}>
                    <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                  </Box>
                </Tooltip>
              </Stack>
              <TextField size="small" label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} sx={inputSx} fullWidth />
              <Autocomplete
                options={vendors}
                getOptionLabel={(v) => v.vendor_name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                freeSolo={false}
                value={vendors.find((v) => v.id === edit.vendorId) ?? null}
                onChange={(_e, v) => setEdit({ ...edit, vendorId: (v as Vendor)?.id ?? '', vendorName: (v as Vendor)?.vendor_name ?? '' })}
                slotProps={{ paper: { sx: { bgcolor: '#0B0B0D', color: '#E2E8F0', border: '1px solid #1E2235' } } }}
                renderInput={(params) => (
                  <TextField {...params} size="small" label="Vendor (for RFQ / procurement)" sx={inputSx} />
                )}
              />
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
              {/* Vendor offers — read-only v1 */}
              {(edit.__origSpec?.vendorOffers as any[] | undefined)?.length ? (
                <Box>
                  <Typography sx={{ color: C.sub, fontSize: 10.5, fontWeight: 700, mb: 0.5 }}>Vendor offers (web-sourced, read-only)</Typography>
                  {(edit.__origSpec.vendorOffers as any[]).map((offer: any, idx: number) => (
                    <Box key={idx} sx={{ fontSize: 11, color: C.sub, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3, flexWrap: 'wrap' }}>
                      {offer.url ? (
                        <Box component="a" href={offer.url} target="_blank" rel="noopener noreferrer"
                          sx={{ color: C.blue, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                          {offer.vendor}
                        </Box>
                      ) : (
                        <span>{offer.vendor}</span>
                      )}
                      <span style={{ color: '#2A3050' }}>—</span>
                      <span>{offer.sku}</span>
                      <span style={{ color: '#2A3050' }}>—</span>
                      <span style={{ color: '#E2E8F0' }}>{'$'}{fmtOfferPrice(offer)}</span>
                      {offer.seenAt && <span style={{ color: '#2A3050' }}>— {offer.seenAt}</span>}
                    </Box>
                  ))}
                </Box>
              ) : null}
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
