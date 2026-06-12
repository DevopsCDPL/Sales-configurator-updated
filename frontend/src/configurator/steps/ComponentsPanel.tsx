/**
 * ComponentsPanel — manual component selection, V2-scoped.
 *
 * REUSES the existing component catalog (same API the legacy chip strip
 * uses: /configurator/components) but writes board/section-scoped
 * componentLines on the OPEN switchboard — so every pick lands in the
 * BOM, the Quote and the handoff automatically. Engine-managed
 * categories (circuit breakers) are excluded; the Designer owns those.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress, TextField,
  Table, TableHead, TableRow, TableCell, TableBody, MenuItem, Select, IconButton,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { configuratorService, ConfiguratorComponent } from '../../services/configuratorService';
import configuratorV2Service, { FullBoard, ComponentLineRow } from '../../services/configuratorV2Service';

const C = {
  bg: '#000000', surface: '#13131E', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

/** Engine-managed categories never picked by hand here. */
const EXCLUDED = new Set(['CIRCUIT BREAKER']);

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.6 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7 };

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.bg, color: C.text, fontSize: 12.5,
    '& fieldset': { borderColor: C.border },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
  '& input': { color: C.text },
};

export interface ComponentsPanelProps {
  board: FullBoard;
  onLinesChanged: (lines: ComponentLineRow[]) => void;
}

const ComponentsPanel: React.FC<ComponentsPanelProps> = ({ board, onLinesChanged }) => {
  const switchboardId = board.board.id;
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [category, setCategory] = useState<string>('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ConfiguratorComponent[]>([]);
  const [lines, setLines] = useState<ComponentLineRow[]>(board.lines);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sections = board.sections;

  useEffect(() => {
    configuratorService.componentCategoryCounts()
      .then((rows: any[]) => setCategories(
        (rows ?? []).filter((r) => !EXCLUDED.has((r.category || '').toUpperCase()) && r.count > 0)
      ))
      .catch(() => setCategories([]));
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: 100 };
      if (category) params.category = category;
      if (q.trim()) params.q = q.trim();
      const rows = await configuratorService.listComponents(params);
      setResults(rows.filter((r) => !EXCLUDED.has((r.category || '').toUpperCase())));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Catalog search failed');
    } finally {
      setLoading(false);
    }
  }, [category, q]);

  useEffect(() => { search(); }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshLines = useCallback(async () => {
    const full = await configuratorV2Service.getFull(switchboardId);
    setLines(full.lines);
    onLinesChanged(full.lines);
  }, [switchboardId, onLinesChanged]);

  const add = async (comp: ConfiguratorComponent) => {
    setBusyId(comp.id);
    setError(null);
    try {
      const price = Number(comp.price ?? comp.mat_cost ?? comp.material_cost) || 0;
      const sc = scope[comp.id] ?? 'board';
      const section = sections.find((s) => s.id === sc);
      await configuratorV2Service.addLine(switchboardId, {
        scope: section ? 'section' : 'board',
        section_id: section?.id ?? null,
        component_id: comp.id,
        category: comp.category ?? null,
        part_number: comp.part_number ?? null,
        name: comp.name ?? null,
        quantity: Math.max(1, Number(qty[comp.id]) || 1),
        unit_cost: price,
        price_status: price > 0 ? 'FIRM' : 'PENDING_RFQ',
        source: 'user',
        meta: section ? { sectionIndex: section.section_number } : {},
      });
      await refreshLines();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to add component');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (line: ComponentLineRow) => {
    setBusyId(line.id);
    try {
      await configuratorV2Service.deleteLine(line.id);
      await refreshLines();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to remove line');
    } finally {
      setBusyId(null);
    }
  };

  const userLines = useMemo(
    () => lines.filter((l) => l.source === 'user'),
    [lines]
  );
  const sectionLabel = (l: ComponentLineRow) => {
    if (l.scope !== 'section') return 'Board';
    const s = sections.find((x) => x.id === l.section_id);
    return s ? 'Section ' + s.section_number : 'Section ' + (l.meta?.sectionIndex ?? '?');
  };

  return (
    <Box sx={{ px: 3, pb: 4 }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>
          {error}
        </Alert>
      )}

      {/* Selected components (user lines) */}
      <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', mb: 2, overflow: 'hidden' }}>
        <Typography sx={{ color: '#CBD5E1', fontSize: 12.5, fontWeight: 700, px: 2, py: 1, borderBottom: '1px solid ' + C.border }}>
          Selected components — {userLines.length} line(s) · flow straight into BOM &amp; Quote
        </Typography>
        {!userLines.length ? (
          <Typography sx={{ color: C.sub, fontSize: 12, px: 2, py: 1.5, fontStyle: 'italic' }}>
            Nothing picked yet. Breakers, bus, supports, labels and lugs are engine-managed — add everything else from the catalog below.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>CATEGORY</TableCell>
                <TableCell sx={headSx}>PART #</TableCell>
                <TableCell sx={headSx}>NAME</TableCell>
                <TableCell sx={headSx}>WHERE</TableCell>
                <TableCell sx={headSx} align="right">QTY</TableCell>
                <TableCell sx={headSx} align="right">UNIT COST</TableCell>
                <TableCell sx={headSx}>PRICE</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {userLines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{l.category}</TableCell>
                  <TableCell sx={cellSx}>{l.part_number ?? '—'}</TableCell>
                  <TableCell sx={cellSx}>{l.name}</TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{sectionLabel(l)}</TableCell>
                  <TableCell sx={cellSx} align="right">{l.quantity}</TableCell>
                  <TableCell sx={cellSx} align="right">{l.unit_cost ? usd(Number(l.unit_cost)) : '—'}</TableCell>
                  <TableCell sx={cellSx}>
                    <Chip
                      label={l.price_status === 'PENDING_RFQ' ? 'RFQ' : l.price_status}
                      size="small"
                      sx={{ bgcolor: 'transparent', border: '1px solid ' + (l.price_status === 'FIRM' ? C.green : C.amber), color: l.price_status === 'FIRM' ? C.green : C.amber, fontSize: 9.5, height: 18 }}
                    />
                  </TableCell>
                  <TableCell sx={cellSx} align="right">
                    <IconButton size="small" disabled={busyId === l.id} onClick={() => remove(l)} sx={{ color: C.sub, '&:hover': { color: C.red } }}>
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* Catalog browser */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Select
          size="small" value={category} displayEmpty onChange={(e) => setCategory(e.target.value)}
          sx={{ minWidth: 200, bgcolor: C.surface, color: C.text, fontSize: 12.5, '& fieldset': { borderColor: C.border } }}
        >
          <MenuItem value="" sx={{ fontSize: 12.5 }}>All categories</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.category} value={c.category} sx={{ fontSize: 12.5 }}>
              {c.category} ({c.count})
            </MenuItem>
          ))}
        </Select>
        <TextField
          size="small" placeholder="Search part #, name, description…" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          sx={{ ...inputSx, flex: 1, minWidth: 220 }}
        />
        <Button
          startIcon={<SearchRoundedIcon sx={{ fontSize: 16 }} />} onClick={search} disabled={loading}
          sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 600, fontSize: 12.5, '&:hover': { bgcolor: '#33d4ff' } }}
        >
          Search
        </Button>
      </Stack>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={22} sx={{ color: C.blue }} /></Stack>
      ) : !results.length ? (
        <Box sx={{ bgcolor: C.surface, border: '1px dashed ' + C.border, borderRadius: '10px', p: 3, textAlign: 'center' }}>
          <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
            No catalog items match. The catalog is shared with the legacy screens — anything added there is available here.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>CATEGORY</TableCell>
                <TableCell sx={headSx}>PART #</TableCell>
                <TableCell sx={headSx}>NAME</TableCell>
                <TableCell sx={headSx} align="right">PRICE</TableCell>
                <TableCell sx={headSx}>QTY</TableCell>
                <TableCell sx={headSx}>SCOPE</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((r) => {
                const price = Number(r.price ?? r.mat_cost ?? r.material_cost) || 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell sx={{ ...cellSx, color: C.sub }}>{r.category}</TableCell>
                    <TableCell sx={cellSx}>{r.part_number ?? '—'}</TableCell>
                    <TableCell sx={cellSx}>{r.name}</TableCell>
                    <TableCell sx={cellSx} align="right">
                      {price > 0 ? usd(price) : <Chip label="RFQ" size="small" sx={{ bgcolor: 'transparent', border: '1px solid ' + C.amber, color: C.amber, fontSize: 9.5, height: 18 }} />}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <TextField
                        size="small" value={qty[r.id] ?? '1'}
                        onChange={(e) => setQty((m) => ({ ...m, [r.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                        sx={{ ...inputSx, width: 60 }}
                      />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Select
                        size="small" value={scope[r.id] ?? 'board'}
                        onChange={(e) => setScope((m) => ({ ...m, [r.id]: e.target.value }))}
                        sx={{ minWidth: 110, bgcolor: C.bg, color: C.text, fontSize: 11.5, '& fieldset': { borderColor: C.border } }}
                      >
                        <MenuItem value="board" sx={{ fontSize: 11.5 }}>Board</MenuItem>
                        {sections.map((s) => (
                          <MenuItem key={s.id} value={s.id} sx={{ fontSize: 11.5 }}>Section {s.section_number}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell sx={cellSx} align="right">
                      <Button
                        size="small" startIcon={<AddRoundedIcon sx={{ fontSize: 14 }} />}
                        disabled={busyId === r.id}
                        onClick={() => add(r)}
                        sx={{ color: C.blue, textTransform: 'none', fontSize: 11.5, border: '1px solid ' + C.border }}
                      >
                        Add
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
};

export default ComponentsPanel;
