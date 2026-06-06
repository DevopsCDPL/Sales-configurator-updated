import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Table, TableHead, TableRow, TableCell, TableBody, TextField, Button,
  Snackbar, Alert, CircularProgress,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Pencil, Save, X, BarChart3 } from 'lucide-react';
import api from '../../services/api';
import { getPartQuantity, getPartUnitPrice } from '../../utils/calculations';
import { useConfiguratorParts } from '../../hooks/useConfiguratorParts';
import {
  UI, TabContainer, AccordionSection, InfoBanner, EnhancedNavFooter,
  AnimatedSection, MotionBox,
} from '../UIComponents';

const tblHeadSx = {
  fontWeight: 700, fontSize: '0.6875rem', color: '#fff',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  py: 1.5, px: 1.5, borderBottom: 'none',
  background: UI.gradient, whiteSpace: 'nowrap',
} as const;

const tblCellSx = { py: 1.25, px: 1.5, fontSize: '0.8rem' } as const;

const editFieldSx = (disabled: boolean) => ({
  width: '100%', minWidth: 90,
  '& .MuiOutlinedInput-root': {
    borderRadius: UI.radiusXs, fontSize: '0.8rem',
    bgcolor: disabled ? UI.bgSubtle : '#fff',
    border: `1px solid ${UI.borderLight}`,
    '& fieldset': { border: 'none' },
    '&.Mui-focused': { borderColor: UI.primary, boxShadow: `0 0 0 3px ${alpha(UI.primary, 0.08)}` },
  },
  '& .MuiInputBase-input': { py: 0.65 },
});

interface AnalyticsItem {
  part_description: string;
  quantity: number;
  total: number;
  mfg_cost: number | '';
  profit: number;
}

interface AnalyticsTabProps {
  project: any;
  onUpdate: () => void;
  onBack?: () => void;
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ project, onUpdate, onBack }) => {
  const [rows, setRows] = useState<AnalyticsItem[]>([]);
  const [commissioned, setCommissioned] = useState(false);
  const [editing, setEditing] = useState(false);
  const snapshotRef = useRef<AnalyticsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgSev, setMsgSev] = useState<'success' | 'error'>('success');

  /* â”€â”€ Configurator BOM as canonical source (falls back to estimate) â”€â”€ */
  const { parts: configuratorParts, fromConfigurator } = useConfiguratorParts(project);

  /* â”€â”€ Build a lookup of vendor PO items by part description (lowercased) â”€â”€ */
  const getVendorPOLookup = useCallback((): Map<string, any> => {
    const map = new Map<string, any>();
    const vpos: any[] = project?.vendorPurchaseOrders || [];
    for (const po of vpos) {
      for (const item of (po.items || [])) {
        const key = (item.part_description || '').trim().toLowerCase();
        if (key) {
          // Accumulate: sum costs across multiple VPOs for same part
          const existing = map.get(key);
          if (existing) {
            existing.total_cost += Number(item.line_total) || 0;
            existing.quantity += Number(item.quantity) || 0;
          } else {
            map.set(key, {
              part_description: item.part_description,
              quantity: Number(item.quantity) || 0,
              unit_cost: Number(item.unit_cost) || 0,
              total_cost: Number(item.line_total) || 0,
              weight: Number(item.weight) || 0,
              cost_per_weight: Number(item.cost_per_weight) || 0,
            });
          }
        }
      }
    }
    return map;
  }, [project]);

  /* â”€â”€ Build analytics rows from ALL project data sources â”€â”€ */
  const buildFromProject = useCallback((): AnalyticsItem[] => {
    const estimate = project?.estimate;
    const estimateParts: any[] = estimate?.all_items || estimate?.custom_parts || [];
    // Priority: legacy estimate (legacy compat) â†’ configurator BOM (new flow) â†’ empty
    const parts: any[] = estimateParts.length > 0
      ? estimateParts
      : (fromConfigurator && configuratorParts.length > 0 ? configuratorParts : []);
    if (parts.length === 0) return [];

    const workOrder = project?.workOrder;
    const jobReqs: Record<string, any> = workOrder?.job_requirements || {};
    const vendorLookup = getVendorPOLookup();

    return parts.map((p: any, idx: number) => {
      // â”€â”€ Quantity: always from estimation (single source of truth)
      let qty = getPartQuantity(p);
      if (!qty) {
        // Try work order job_requirements (keyed by string index)
        const jr = jobReqs[String(idx)] || jobReqs[idx];
        if (jr) qty = Number(jr.quantity) || 0;
      }

      // â”€â”€ Selling price per unit from estimation (handles bulk pricing)
      const unitPrice = getPartUnitPrice(p);
      const total = Number(p.total_cost) || (qty * unitPrice);

      // â”€â”€ Vendor PO data: match by part description for cost & quantity
      const partKey = (p.job_description || '').trim().toLowerCase();
      const vpoMatch = vendorLookup.get(partKey);

      // Pre-populate MFG cost from vendor PO total cost if available
      let mfgCost: number | '' = '';
      if (vpoMatch && vpoMatch.total_cost > 0) {
        mfgCost = vpoMatch.total_cost;
      }

      // If qty is still 0, try vendor PO quantity
      if (!qty && vpoMatch) {
        qty = vpoMatch.quantity || 0;
      }

      // Recalculate total with updated qty if it was 0 before
      const finalTotal = total || (qty * unitPrice);

      const profit = typeof mfgCost === 'number' ? finalTotal - mfgCost : 0;

      return {
        part_description: p.drawing_part_no || p.job_description || '',
        quantity: qty,
        total: finalTotal,
        mfg_cost: mfgCost,
        profit,
      };
    });
  }, [project, getVendorPOLookup, configuratorParts, fromConfigurator]);

  useEffect(() => {
    const load = async () => {
      if (!project?.id) { setInitialLoading(false); return; }
      try {
        const resp = await api.get(`/projects/${project.id}/analytics`);
        const data = resp.data?.data || [];
        if (data.length > 0) {
          const liveItems = buildFromProject();
          setRows(data.map((d: any, idx: number) => {
            const live = liveItems[idx];
            const qty = live?.quantity || d.quantity || 0;
            const total = live?.total || d.total || 0;
            const mfgCost = d.mfg_cost ?? (live?.mfg_cost ?? '');
            const profit = typeof mfgCost === 'number' && mfgCost !== 0 ? total - mfgCost : (d.profit ?? 0);
            return {
              part_description: live?.part_description || d.part_description,
              quantity: qty,
              total,
              mfg_cost: mfgCost,
              profit,
            };
          }));
          if (data.every((d: any) => d.mfg_cost != null && d.mfg_cost !== '')) setCommissioned(true);
        } else {
          setRows(buildFromProject());
        }
      } catch { setRows(buildFromProject()); }
      finally { setInitialLoading(false); }
    };
    load();
  }, [project?.id, buildFromProject]); // eslint-disable-line

  const handleChange = (idx: number, field: 'mfg_cost', value: string) => {
    setRows(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      const mfg_cost = value === '' ? '' : Number(value);
      const profit = typeof mfg_cost === 'number' ? row.total - mfg_cost : 0;
      return { ...row, mfg_cost, profit };
    }));
  };

  const buildPayload = () => rows.map(r => ({
    part_description: r.part_description, quantity: r.quantity, total: r.total,
    mfg_cost: Number(r.mfg_cost), profit: typeof r.mfg_cost === 'number' ? r.total - Number(r.mfg_cost) : 0,
  }));

  const handleCommission = async () => {
    if (rows.length === 0) { setMsgSev('error'); setMsg('No configured components found. Add components in the Configuration step.'); return; }
    if (rows.some(r => r.mfg_cost === '' || isNaN(Number(r.mfg_cost)))) { setMsgSev('error'); setMsg('Please enter Manufacturing Cost for all items.'); return; }
    setLoading(true);
    try {
      await api.post(`/projects/${project.id}/commission`, { items: buildPayload() });
      setCommissioned(true); setMsgSev('success'); setMsg('Project commissioned! Analytics saved.'); onUpdate();
    } catch { setMsgSev('error'); setMsg('Failed to commission. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleEdit = () => { snapshotRef.current = rows.map(r => ({ ...r })); setEditing(true); };
  const handleCancelEdit = () => { setRows(snapshotRef.current); setEditing(false); };

  const handleSaveEdit = async () => {
    if (rows.some(r => r.mfg_cost === '' || isNaN(Number(r.mfg_cost)))) { setMsgSev('error'); setMsg('Please enter Manufacturing Cost for all items.'); return; }
    setLoading(true);
    try {
      await api.post(`/projects/${project.id}/commission`, { items: buildPayload() });
      setEditing(false); setMsgSev('success'); setMsg('Analytics updated successfully.'); onUpdate();
    } catch { setMsgSev('error'); setMsg('Failed to update analytics.'); }
    finally { setLoading(false); }
  };

  const formatCurrency = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });



  if (initialLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress sx={{ color: UI.primary }} />
      </Box>
    );
  }

  return (
    <TabContainer>
      {/* Analytics Table */}
      <AnimatedSection delay={0.15}>
        <AccordionSection
          icon={<BarChart3 size={16} />}
          title="Cost & Profit Analytics"
          subtitle={`${rows.length} items â€” ${commissioned ? 'Commissioned' : 'Pending'}`}
          accentColor={UI.primary}
          badge={commissioned ? <Box component="span" sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#00c8ff', bgcolor: 'rgba(0, 200, 255, 0.08)', px: 1, py: 0.25, borderRadius: '4px' }}>Commissioned</Box> : undefined}
        >
          <Box sx={{ overflowX: 'auto', mx: -2.5, px: 0 }}>
            <Table size="small" sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow>
                  {['Part Description', 'Quantity', 'Total', 'Manufacturing Cost', 'Profit', 'Action'].map(h => (
                    <TableCell key={h} sx={{ '&.MuiTableCell-head': tblHeadSx }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: UI.textMuted, fontSize: '0.8125rem' }}>
                      No configured components found. Add components in the Configuration step.
                    </TableCell>
                  </TableRow>
                ) : rows.map((row, idx) => {
                  const profit = typeof row.mfg_cost === 'number' ? row.total - row.mfg_cost : null;
                  const isDisabled = commissioned && !editing;
                  return (
                    <TableRow key={idx} sx={{
                      '&:hover': { bgcolor: alpha(UI.primary, 0.02) },
                      bgcolor: idx % 2 === 0 ? '#fff' : UI.bgSubtle,
                      transition: 'background 0.15s',
                    }}>
                      <TableCell sx={{ ...tblCellSx, fontWeight: 600, color: UI.textPrimary, whiteSpace: 'nowrap' }}>{row.part_description}</TableCell>
                      <TableCell sx={{ ...tblCellSx, color: UI.textPrimary, textAlign: 'center' }}>{row.quantity}</TableCell>
                      <TableCell sx={{ ...tblCellSx, color: UI.textPrimary, fontWeight: 600 }}>{formatCurrency(row.total)}</TableCell>
                      <TableCell sx={{ ...tblCellSx }}>
                        <TextField size="small" type="number" value={row.mfg_cost}
                          onChange={e => handleChange(idx, 'mfg_cost', e.target.value)}
                          disabled={isDisabled} placeholder="Enter"
                          inputProps={{ min: 0, step: 'any' }} sx={editFieldSx(isDisabled)} />
                      </TableCell>
                      <TableCell sx={{
                        ...tblCellSx, fontWeight: 700,
                        color: profit !== null ? (profit >= 0 ? '#16A34A' : '#DC2626') : UI.textMuted,
                        bgcolor: profit !== null ? (profit >= 0 ? alpha('#16A34A', 0.04) : alpha('#DC2626', 0.04)) : 'transparent',
                      }}>
                        {profit !== null ? formatCurrency(profit) : 'â€”'}
                      </TableCell>
                      <TableCell sx={{ ...tblCellSx, textAlign: 'center' }}>
                        {commissioned ? (
                          <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#00c8ff', bgcolor: 'rgba(0, 200, 255, 0.08)', px: 1.5, py: 0.5, borderRadius: '4px' }}>Commissioned</Box>
                        ) : (
                          <Button size="small" variant="contained" disabled={row.mfg_cost === '' || isNaN(Number(row.mfg_cost))}
                            onClick={handleCommission}
                            sx={{
                              bgcolor: UI.primary, borderRadius: UI.radiusSm, px: 2, py: 0.5,
                              textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap',
                              '&:hover': { bgcolor: UI.primaryDark },
                              '&.Mui-disabled': { bgcolor: '#9CA3AF', color: '#fff' },
                            }}>
                            Commissioned
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, pt: 2, mt: 1, borderTop: `1px solid ${UI.borderLight}` }}>
            {commissioned && !editing && (
              <Button variant="outlined" startIcon={<Pencil size={14} />} onClick={handleEdit}
                sx={{
                  borderRadius: UI.radiusSm, px: 2.5, py: 0.85,
                  textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem',
                  borderColor: UI.primary, color: UI.primary,
                  '&:hover': { borderColor: UI.primary, bgcolor: alpha(UI.primary, 0.04) },
                }}>
                Edit
              </Button>
            )}
            {editing && (
              <>
                <Button variant="outlined" startIcon={<X size={14} />} onClick={handleCancelEdit} disabled={loading}
                  sx={{
                    borderRadius: UI.radiusSm, px: 2.5, py: 0.85,
                    textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem',
                    borderColor: '#DC2626', color: '#DC2626',
                    '&:hover': { borderColor: '#B91C1C', bgcolor: '#FEF2F2' },
                  }}>
                  Cancel
                </Button>
                <Button variant="contained"
                  startIcon={loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <Save size={14} />}
                  onClick={handleSaveEdit} disabled={loading}
                  sx={{
                    bgcolor: UI.primary, borderRadius: UI.radiusSm, px: 3, py: 0.85,
                    textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem',
                    '&:hover': { bgcolor: UI.primaryDark, boxShadow: `0 4px 12px ${alpha(UI.primary, 0.25)}` },
                  }}>
                  Save Changes
                </Button>
              </>
            )}
            {!editing && (
              <Button variant="contained" onClick={handleCommission}
                disabled={commissioned || loading || rows.length === 0}
                sx={{
                  bgcolor: commissioned ? '#9CA3AF' : UI.primary,
                  borderRadius: UI.radiusSm, px: 3, py: 0.85,
                  textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem',
                  '&:hover': { bgcolor: commissioned ? '#9CA3AF' : UI.primaryDark, boxShadow: commissioned ? 'none' : `0 4px 12px ${alpha(UI.primary, 0.25)}` },
                  '&.Mui-disabled': { bgcolor: '#9CA3AF', color: '#fff' },
                }}>
                {loading ? <CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} /> : null}
                {commissioned ? 'Commissioned' : 'Commission Project'}
              </Button>
            )}
          </Box>
        </AccordionSection>
      </AnimatedSection>

      {commissioned && (
        <MotionBox initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} sx={{ mt: 2 }}>
          <InfoBanner variant="success">
            Project commissioned â€” analytics saved and unused materials added to warehouse stock.
          </InfoBanner>
        </MotionBox>
      )}

      <EnhancedNavFooter onBack={onBack} backLabel="Back to Documents" />

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={() => setMsg('')} severity={msgSev} variant="filled" sx={{ borderRadius: 2 }}>{msg}</Alert>
      </Snackbar>
    </TabContainer>
  );
};

export default AnalyticsTab;


