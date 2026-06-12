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
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { configuratorService, ConfiguratorComponent } from '../../services/configuratorService';
import configuratorV2Service, { FullBoard, ComponentLineRow } from '../../services/configuratorV2Service';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
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
    bgcolor: C.surface, color: C.text, fontSize: 12.5,
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
  const [info, setInfo] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [swapLine, setSwapLine] = useState<ComponentLineRow | null>(null);
  const [swapCands, setSwapCands] = useState<ConfiguratorComponent[]>([]);

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

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const out = await configuratorV2Service.generateComponents(switchboardId);
      setInfo(`Components generated — ${out.created} new, ${out.updated} qty-refreshed, ${out.kept} kept (engineer-edited), ${out.removed} removed` +
        (out.placeholders ? `, ${out.placeholders} NO-CATALOG-MATCH placeholder(s) need attention` : ''));
      await refreshLines();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const setLineQty = async (line: ComponentLineRow, qty: number) => {
    if (!Number.isFinite(qty) || qty < 0) return;
    try {
      await configuratorV2Service.patchLine(line.id, { quantity: qty, meta: { qtyEdited: true } });
      await refreshLines();
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Qty update failed'); }
  };

  const openSwap = async (line: ComponentLineRow) => {
    setSwapLine(line);
    setSwapCands([]);
    try {
      const rows = await configuratorService.listComponents({ category: line.category ?? undefined, limit: 100 } as any);
      rows.sort((a: any, b: any) => ((Number(a.price) || Infinity) - (Number(b.price) || Infinity)));
      setSwapCands(rows.filter((r) => r.part_number !== line.part_number).slice(0, 15));
    } catch { /* dialog shows empty-state */ }
  };

  const doSwap = async (c: ConfiguratorComponent) => {
    if (!swapLine) return;
    try {
      const price = Number(c.price ?? c.mat_cost ?? 0) || 0;
      await configuratorV2Service.patchLine(swapLine.id, {
        component_id: c.id, part_number: c.part_number ?? null, name: c.name ?? null,
        unit_cost: price, price_status: price > 0 ? 'FIRM' : 'PENDING_RFQ',
        meta: { swapped: true, placeholder: false },
      });
      setSwapLine(null);
      await refreshLines();
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Swap failed'); }
  };

  const ruleGroups = useMemo(() => {
    const ruleLines = lines.filter((l) => l.source === 'rule');
    const g = new Map<string, ComponentLineRow[]>();
    for (const l of ruleLines) {
      const k = String(l.meta?.group ?? 'Other');
      g.set(k, [...(g.get(k) ?? []), l]);
    }
    return [...g.entries()];
  }, [lines]);

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

      {info && (
        <Alert severity="success" onClose={() => setInfo(null)} sx={{ mb: 1.5, bgcolor: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid ' + C.border, fontSize: 12 }}>
          {info}
        </Alert>
      )}

      {/* ── Auto components (rule-driven, swappable, qty-editable) ── */}
      <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', mb: 2, overflow: 'hidden' }}>
        <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1, borderBottom: '1px solid ' + C.border }}>
          <Typography sx={{ color: '#CBD5E1', fontSize: 12.5, fontWeight: 700, flex: 1 }}>
            Auto components — engine-selected from the design (rules editable in Standards)
          </Typography>
          <Button
            size="small" startIcon={<AutoAwesomeRoundedIcon sx={{ fontSize: 14 }} />}
            disabled={generating}
            onClick={generate}
            sx={{ bgcolor: '#00c8ff', color: '#06151c', textTransform: 'none', fontWeight: 700, fontSize: 12, px: 1.5, '&:hover': { bgcolor: '#33d4ff' } }}
          >
            {generating ? 'Generating…' : ruleGroups.length ? 'Regenerate' : 'Generate components'}
          </Button>
        </Stack>
        {!ruleGroups.length ? (
          <Typography sx={{ color: C.sub, fontSize: 12, px: 2, py: 1.5, fontStyle: 'italic' }}>
            Click Generate — every component the design implies is created automatically
            (hardware, terminations, wiring, identification…). No catalog match still creates
            a placeholder line so nothing is missed.
          </Typography>
        ) : ruleGroups.map(([group, rows]) => (
          <Box key={group}>
            <Typography sx={{ color: '#A9B6C9', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, px: 2, pt: 1, pb: 0.5, textTransform: 'uppercase' }}>
              {group}
            </Typography>
            <Table size="small">
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell sx={{ ...cellSx, width: 260, color: C.sub }}>{l.meta?.ruleDescription ?? l.category}</TableCell>
                    <TableCell sx={cellSx}>
                      {l.meta?.placeholder ? (
                        <Chip label={'NO CATALOG MATCH — ' + (l.meta?.ruleDescription ?? '')} size="small"
                          sx={{ bgcolor: 'rgba(217,119,6,0.12)', color: '#FCD34D', fontSize: 9.5, height: 18 }} />
                      ) : l.name}
                      {l.meta?.swapped && (
                        <Chip label="swapped" size="small" sx={{ ml: 0.5, bgcolor: 'transparent', border: '1px solid ' + C.amber, color: C.amber, fontSize: 8.5, height: 15 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, width: 90, color: C.sub, fontSize: 10.5 }}>{l.meta?.qtyFormula ?? ''}</TableCell>
                    <TableCell sx={{ ...cellSx, width: 70 }}>
                      <TextField
                        size="small" defaultValue={l.quantity} key={l.id + ':' + l.quantity}
                        onBlur={(e) => { const v = Number(e.target.value); if (v !== Number(l.quantity)) setLineQty(l, v); }}
                        inputProps={{ style: { textAlign: 'center', padding: '4px 6px', fontSize: 12 } }}
                        sx={{ width: 56, '& .MuiOutlinedInput-root': { bgcolor: C.bg, color: C.text, '& fieldset': { borderColor: C.border } } }}
                      />
                    </TableCell>
                    <TableCell sx={{ ...cellSx, width: 90 }} align="right">{Number(l.unit_cost) ? usd(Number(l.unit_cost)) : '—'}</TableCell>
                    <TableCell sx={{ ...cellSx, width: 64 }}>
                      <Chip label={l.price_status === 'PENDING_RFQ' ? 'RFQ' : l.price_status} size="small"
                        sx={{ bgcolor: 'transparent', border: '1px solid ' + (l.price_status === 'FIRM' ? C.green : C.amber), color: l.price_status === 'FIRM' ? C.green : C.amber, fontSize: 9, height: 17 }} />
                    </TableCell>
                    <TableCell sx={{ ...cellSx, width: 110, whiteSpace: 'nowrap' }} align="right">
                      <Button size="small" startIcon={<SwapHorizRoundedIcon sx={{ fontSize: 13 }} />} onClick={() => openSwap(l)}
                        sx={{ color: '#00c8ff', textTransform: 'none', fontSize: 10.5, minWidth: 0, mr: 0.5 }}>
                        Swap
                      </Button>
                      <IconButton size="small" disabled={busyId === l.id} onClick={() => remove(l)} sx={{ color: C.sub, p: 0.3, '&:hover': { color: C.red } }}>
                        <DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        ))}
      </Box>

      {/* Swap dialog (same-category alternatives, cheapest first) */}
      <Dialog open={!!swapLine} onClose={() => setSwapLine(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: C.surface, border: '1px solid ' + C.border, backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: C.text, fontSize: 14, fontWeight: 700 }}>
          Swap — {swapLine?.meta?.ruleDescription ?? swapLine?.name} ({swapLine?.category})
        </DialogTitle>
        <DialogContent>
          {!swapCands.length ? (
            <Typography sx={{ color: C.sub, fontSize: 12.5 }}>No alternatives in this category yet — add one in Library → Catalog.</Typography>
          ) : swapCands.map((c) => (
            <Stack key={c.id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.6, borderBottom: '1px solid ' + C.border }}>
              <Typography sx={{ color: C.text, fontSize: 12, flex: 1 }} noWrap>{c.name}</Typography>
              <Typography sx={{ color: C.sub, fontSize: 11 }}>{Number(c.price) ? usd(Number(c.price)) : 'RFQ'}</Typography>
              <Button size="small" onClick={() => doSwap(c)}
                sx={{ color: C.green, textTransform: 'none', fontSize: 11, border: '1px solid ' + C.border }}>
                Use this
              </Button>
            </Stack>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSwapLine(null)} sx={{ color: C.sub, textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Selected components (user lines) */}
      <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', mb: 2, overflow: 'hidden' }}>
        <Typography sx={{ color: '#CBD5E1', fontSize: 12.5, fontWeight: 700, px: 2, py: 1, borderBottom: '1px solid ' + C.border }}>
          Manual additions — {userLines.length} line(s) · picked from the catalog below
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
          sx={{ minWidth: 200, bgcolor: C.bg, color: C.text, fontSize: 12.5, '& fieldset': { borderColor: C.border } }}
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
        <Box sx={{ bgcolor: C.bg, border: '1px dashed ' + C.border, borderRadius: '10px', p: 3, textAlign: 'center' }}>
          <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
            No catalog items match. The catalog is shared with the legacy screens — anything added there is available here.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden' }}>
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
                        sx={{ minWidth: 110, bgcolor: C.surface, color: C.text, fontSize: 11.5, '& fieldset': { borderColor: C.border } }}
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
