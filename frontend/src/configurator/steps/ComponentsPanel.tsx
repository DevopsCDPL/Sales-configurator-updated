/**
 * ComponentsPanel — manual component selection, V2-scoped.
 *
 * REUSES the existing component catalog (same API the legacy chip strip
 * uses: /configurator/components) but writes board/section-scoped
 * componentLines on the OPEN switchboard — so every pick lands in the
 * BOM, the Quote and the handoff automatically. Engine-managed
 * categories (circuit breakers) are excluded; the Designer owns those.
 *
 * Tab layout:
 *   "Designer's pick"  — Auto-components (rule-driven, swappable, qty-editable)
 *                        + "+ Add component" button that opens the picker dialog.
 *   "Manual additions" — User-picked lines table.
 *
 * The inline Catalog browser section has been replaced by the shared
 * ComponentPickerDialog (used for both swap and add).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress, TextField,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton, Tooltip,
  Tabs, Tab,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import { configuratorService, ConfiguratorComponent } from '../../services/configuratorService';
import configuratorV2Service, { FullBoard, ComponentLineRow } from '../../services/configuratorV2Service';
import PriceSourceDot from '../components/PriceSourceDot';
import { displayCase, compactSku } from '../lib/displayCase';
import ComponentPickerDialog from '../components/ComponentPickerDialog';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.6 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7 };

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export interface ComponentsPanelProps {
  board: FullBoard;
  onLinesChanged: (lines: ComponentLineRow[]) => void;
}

const ComponentsPanel: React.FC<ComponentsPanelProps> = ({ board, onLinesChanged }) => {
  const switchboardId = board.board.id;
  const [tab, setTab] = useState(0);
  const [lines, setLines] = useState<ComponentLineRow[]>(board.lines);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Picker dialog state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'swap' | 'add'>('add');
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [swapLine, setSwapLine] = useState<ComponentLineRow | null>(null);

  const sections = board.sections;

  const refreshLines = useCallback(async () => {
    const full = await configuratorV2Service.getFull(switchboardId);
    setLines(full.lines);
    onLinesChanged(full.lines);
  }, [switchboardId, onLinesChanged]);

  const openAddPicker = () => {
    setPickerMode('add');
    setPickerCategory(null);
    setSwapLine(null);
    setPickerOpen(true);
  };

  const openSwap = (line: ComponentLineRow) => {
    setPickerMode('swap');
    setPickerCategory(line.category ?? null);
    setSwapLine(line);
    setPickerOpen(true);
  };

  const doSwap = async (c: ConfiguratorComponent) => {
    if (!swapLine) return;
    try {
      const price = Number(c.price ?? (c as any).mat_cost ?? 0) || 0;
      await configuratorV2Service.patchLine(swapLine.id, {
        component_id: c.id, part_number: c.part_number ?? null, name: c.name ?? null,
        unit_cost: price, price_status: price > 0 ? 'FIRM' : 'PENDING_RFQ',
        meta: { swapped: true, placeholder: false },
      });
      setSwapLine(null);
      setPickerOpen(false);
      await refreshLines();
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Swap failed'); }
  };

  const doAdd = async (comp: ConfiguratorComponent, qty: number) => {
    setBusyId(comp.id);
    setError(null);
    try {
      const price = Number(comp.price ?? (comp as any).mat_cost ?? (comp as any).material_cost) || 0;
      await configuratorV2Service.addLine(switchboardId, {
        scope: 'board',
        section_id: null,
        component_id: comp.id,
        category: comp.category ?? null,
        part_number: comp.part_number ?? null,
        name: comp.name ?? null,
        quantity: Math.max(1, qty),
        unit_cost: price,
        price_status: price > 0 ? 'FIRM' : 'PENDING_RFQ',
        source: 'user',
        meta: {},
      });
      await refreshLines();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to add component');
    } finally {
      setBusyId(null);
    }
  };

  const handlePick = async (c: ConfiguratorComponent, qty: number) => {
    if (pickerMode === 'swap') {
      await doSwap(c);
    } else {
      await doAdd(c, qty);
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

      {/* ── Tabs ── */}
      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        sx={{
          mb: 2, minHeight: 36,
          '& .MuiTabs-indicator': { bgcolor: C.blue, height: 2 },
          '& .MuiTab-root': {
            textTransform: 'none', fontSize: 12.5, minHeight: 36,
            color: 'rgba(217,228,251,0.7)',
            '&.Mui-selected': { color: C.blue },
          },
        }}
      >
        <Tab label="Designer's pick" />
        <Tab label="Manual additions" />
      </Tabs>

      {/* ── Tab 0: Auto components ── */}
      {tab === 0 && (() => {
        const ruleLines = lines.filter((l) => l.source === 'rule');
        const placeholderCount = ruleLines.filter((l) => l.meta?.placeholder).length;
        const catalogMatched = ruleLines.length - placeholderCount;
        const allLines = [...ruleLines, ...userLines];
        const firmCount = allLines.filter((l) => l.price_status === 'FIRM').length;
        const rfqCount = allLines.filter((l) => l.price_status === 'PENDING_RFQ').length;
        const subtotal = allLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);

        // Build flat row list with group rowspan info
        let snoCounter = 0;
        const flatRows: Array<{ l: ComponentLineRow; group: string; rowsInGroup: number; isFirstInGroup: boolean; sno: number }> = [];
        for (const [group, rows] of ruleGroups) {
          rows.forEach((l, idx) => {
            snoCounter++;
            flatRows.push({ l, group, rowsInGroup: rows.length, isFirstInGroup: idx === 0, sno: snoCounter });
          });
        }

        return (
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            {/* Left: panel */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', mb: 2, overflow: 'hidden' }}>
                <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1, borderBottom: '1px solid ' + C.border }}>
                  <Typography sx={{ color: '#CBD5E1', fontSize: 12.5, fontWeight: 700, flex: 1 }}>
                    Auto components — engine-selected from the design (rules editable in Standards)
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<AddRoundedIcon sx={{ fontSize: 14 }} />}
                    onClick={openAddPicker}
                    sx={{ color: C.text, textTransform: 'none', fontSize: 12, border: '1px solid ' + C.border, bgcolor: C.bg, mr: 1, '&:hover': { borderColor: C.blue } }}
                  >
                    + Add component
                  </Button>
                  <Button
                    size="small" startIcon={<AutoAwesomeRoundedIcon sx={{ fontSize: 14 }} />}
                    disabled={generating}
                    onClick={generate}
                    sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 700, fontSize: 12, px: 1.5, '&:hover': { bgcolor: '#33d4ff' } }}
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
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ ...headSx, width: 40, whiteSpace: 'nowrap' }}>S.No</TableCell>
                        <TableCell sx={{ ...headSx, width: 110, whiteSpace: 'nowrap' }}>Category</TableCell>
                        <TableCell sx={{ ...headSx, width: 210, whiteSpace: 'nowrap' }}>Component</TableCell>
                        <TableCell sx={{ ...headSx, whiteSpace: 'nowrap' }}>Catalog item (SKU)</TableCell>
                        <TableCell sx={{ ...headSx, width: 95, whiteSpace: 'nowrap' }}>Qty basis</TableCell>
                        <TableCell sx={{ ...headSx, width: 64, whiteSpace: 'nowrap' }}>Qty</TableCell>
                        <TableCell sx={{ ...headSx, width: 90, whiteSpace: 'nowrap' }} align="right">Unit price</TableCell>
                        <TableCell sx={{ ...headSx, width: 44, whiteSpace: 'nowrap' }} align="center">Status</TableCell>
                        <TableCell sx={{ ...headSx, width: 80, whiteSpace: 'nowrap' }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {flatRows.map(({ l, group, rowsInGroup, isFirstInGroup, sno }) => {
                        const unitCost = Number(l.unit_cost);
                        const statusColor = l.price_status === 'FIRM' ? C.green : l.price_status === 'ESTIMATED' ? C.amber : C.red;
                        const statusLabel = l.price_status === 'FIRM' ? 'Firm price' : l.price_status === 'ESTIMATED' ? 'Estimated price' : 'No firm price — RFQ required';
                        return (
                          <TableRow key={l.id}>
                            {/* S.No */}
                            <TableCell sx={{ ...cellSx, width: 40, color: C.sub, fontSize: 11.5, verticalAlign: 'middle', py: 0.5 }}>
                              {sno}
                            </TableCell>
                            {/* Category — rowSpan first row only */}
                            {isFirstInGroup && (
                              <TableCell rowSpan={rowsInGroup} sx={{ ...cellSx, width: 110, color: '#A9B6C9', fontWeight: 700, fontSize: 11, verticalAlign: 'middle', borderRight: '1px solid #1E2235' }}>
                                {displayCase(group)}
                              </TableCell>
                            )}
                            {/* Component */}
                            <TableCell sx={{ ...cellSx, width: 210, verticalAlign: 'middle', py: 0.5, color: C.text, fontSize: 12 }}>
                              {l.meta?.ruleDescription ?? l.category}
                            </TableCell>
                            {/* Catalog item (SKU) */}
                            <TableCell sx={{ ...cellSx, verticalAlign: 'middle', py: 0.5 }}>
                              {l.meta?.placeholder ? (
                                <Box>
                                  <Chip label="No catalog match" size="small"
                                    sx={{ bgcolor: 'rgba(217,119,6,0.12)', color: '#FCD34D', fontSize: 9.5, height: 18 }} />
                                  <Typography sx={{ color: C.sub, fontSize: 10.5, fontStyle: 'italic', mt: 0.2 }}>
                                    add to catalog or swap
                                  </Typography>
                                </Box>
                              ) : (
                                <Stack direction="row" gap={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                                  <Tooltip title={l.part_number ?? ''} arrow>
                                    <Chip
                                      label={compactSku(l.part_number)}
                                      size="small"
                                      sx={{ bgcolor: 'transparent', border: '1px solid #1E2235', color: '#A9B6C9', fontSize: 9.5, height: 18 }}
                                    />
                                  </Tooltip>
                                  <Tooltip title={l.name ?? ''} arrow>
                                    <Typography sx={{ color: C.text, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {displayCase(l.name)}
                                    </Typography>
                                  </Tooltip>
                                </Stack>
                              )}
                            </TableCell>
                            {/* Qty basis */}
                            <TableCell sx={{ ...cellSx, width: 95, verticalAlign: 'middle', py: 0.5, color: C.sub, fontSize: 10.5, whiteSpace: 'nowrap' }}>
                              {l.meta?.qtyFormula ?? ''}
                            </TableCell>
                            {/* Qty */}
                            <TableCell sx={{ ...cellSx, width: 64, verticalAlign: 'middle', py: 0.5 }}>
                              <TextField
                                size="small" defaultValue={Number(l.quantity)} key={l.id + ':' + l.quantity}
                                onBlur={(e) => { const v = Number(e.target.value); if (v !== Number(l.quantity)) setLineQty(l, v); }}
                                inputProps={{ style: { textAlign: 'center', padding: '4px 6px', fontSize: 12 } }}
                                sx={{ width: 52, '& .MuiOutlinedInput-root': { bgcolor: C.bg, color: C.text, '& fieldset': { borderColor: C.border } } }}
                              />
                            </TableCell>
                            {/* Unit price */}
                            <TableCell sx={{ ...cellSx, width: 90, verticalAlign: 'middle', py: 0.5 }} align="right">
                              {unitCost > 0 ? (
                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                  <PriceSourceDot source={(l.meta as any)?.priceSource} />
                                  {usd(unitCost)}
                                </Box>
                              ) : (
                                <Tooltip title="No quote received yet — raise an RFQ" arrow>
                                  <Typography sx={{ color: C.red, fontWeight: 800, fontSize: 12, display: 'inline' }}>RFQ $</Typography>
                                </Tooltip>
                              )}
                            </TableCell>
                            {/* Status */}
                            <TableCell sx={{ ...cellSx, width: 44, verticalAlign: 'middle', py: 0.5 }} align="center">
                              <Tooltip title={statusLabel} arrow>
                                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusColor, boxShadow: '0 0 6px ' + statusColor, display: 'inline-block' }} />
                              </Tooltip>
                            </TableCell>
                            {/* Actions */}
                            <TableCell sx={{ ...cellSx, width: 80, verticalAlign: 'middle', py: 0.5, whiteSpace: 'nowrap' }} align="right">
                              <Tooltip title="Swap" arrow>
                                <IconButton size="small" onClick={() => openSwap(l)} sx={{ color: C.blue, p: 0.4, mr: 0.25 }}>
                                  <SwapHorizRoundedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <IconButton size="small" disabled={busyId === l.id} onClick={() => remove(l)} sx={{ color: C.sub, p: 0.3, '&:hover': { color: C.red } }}>
                                <DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </Box>
            </Box>

            {/* Right: sticky summary card */}
            <Box sx={{ width: 250, flexShrink: 0, position: 'sticky', top: 8 }}>
              <Box sx={{ bgcolor: '#0B0B0D', border: '1px solid #1E2235', borderRadius: '10px', p: 1.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#F0F6FF', mb: 1 }}>
                  Components summary
                </Typography>
                {/* Engine-selected */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.4, borderBottom: 'rgba(30,34,53,0.6)' }}>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>Engine-selected</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }}>{ruleLines.length}</Typography>
                </Stack>
                {/* Manual additions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.4, borderBottom: '1px solid rgba(30,34,53,0.6)' }}>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>Manual additions</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }}>{userLines.length}</Typography>
                </Stack>
                {/* Catalog matched */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.4, borderBottom: '1px solid rgba(30,34,53,0.6)' }}>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>Catalog matched</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: catalogMatched === ruleLines.length && ruleLines.length > 0 ? '#22C55E' : C.text }}>{catalogMatched}</Typography>
                </Stack>
                {/* No catalog match */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.4, borderBottom: '1px solid rgba(30,34,53,0.6)' }}>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>No catalog match</Typography>
                  <Tooltip title={placeholderCount > 0 ? 'Swap to a real part or add it in Database → Components' : ''} arrow>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: placeholderCount > 0 ? '#D97706' : C.text }}>{placeholderCount}</Typography>
                  </Tooltip>
                </Stack>
                {/* Firm priced */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.4, borderBottom: '1px solid rgba(30,34,53,0.6)' }}>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>Firm priced</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#22C55E' }}>{firmCount}</Typography>
                </Stack>
                {/* Awaiting RFQ */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.4, borderBottom: '1px solid #1E2235' }}>
                  <Typography sx={{ fontSize: 11, color: C.sub }}>Awaiting RFQ</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: rfqCount > 0 ? '#EF4444' : C.text }}>{rfqCount}</Typography>
                </Stack>
                {/* Material subtotal */}
                <Box sx={{ pt: 0.75 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography sx={{ fontSize: 11, color: C.sub }}>Material subtotal</Typography>
                    <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#00c8ff' }}>{usd(subtotal)}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 10, color: C.sub, mt: 0.25 }}>
                    Priced lines only — RFQ items not included.
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Stack>
        );
      })()}

      {/* ── Tab 1: Manual additions ── */}
      {tab === 1 && (
        <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', mb: 2, overflow: 'hidden' }}>
          <Typography sx={{ color: '#CBD5E1', fontSize: 12.5, fontWeight: 700, px: 2, py: 1, borderBottom: '1px solid ' + C.border }}>
            Manual additions — {userLines.length} line(s) · picked via Add component
          </Typography>
          {!userLines.length ? (
            <Typography sx={{ color: C.sub, fontSize: 12, px: 2, py: 1.5, fontStyle: 'italic' }}>
              Nothing picked yet. Breakers, bus, supports, labels and lugs are engine-managed — add everything else via the "+ Add component" button in Designer's pick.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Category</TableCell>
                  <TableCell sx={headSx}>Part #</TableCell>
                  <TableCell sx={headSx}>Name</TableCell>
                  <TableCell sx={headSx}>Where</TableCell>
                  <TableCell sx={headSx} align="right">Qty</TableCell>
                  <TableCell sx={headSx} align="right">Unit cost</TableCell>
                  <TableCell sx={headSx}>Price</TableCell>
                  <TableCell sx={headSx} />
                </TableRow>
              </TableHead>
              <TableBody>
                {userLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell sx={{ ...cellSx, color: C.sub }}>{displayCase(l.category)}</TableCell>
                    <TableCell sx={cellSx}>
                      <Tooltip title={l.part_number ?? ''}><span>{compactSku(l.part_number) || '—'}</span></Tooltip>
                    </TableCell>
                    <TableCell sx={cellSx}>{displayCase(l.name)}</TableCell>
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
      )}

      {/* ── Shared picker dialog (swap + add) ── */}
      <ComponentPickerDialog
        open={pickerOpen}
        mode={pickerMode}
        lockedCategory={pickerCategory}
        onClose={() => { setPickerOpen(false); setSwapLine(null); }}
        onPick={handlePick}
      />
    </Box>
  );
};

export default ComponentsPanel;
