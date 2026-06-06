import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Button,
  LinearProgress, TextField, IconButton, Checkbox,
  Select, MenuItem, CircularProgress,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import Collapse from '@mui/material/Collapse';
import { PictureAsPdf as PdfIcon, Shower } from '@mui/icons-material';
import {
  Plus, FileDown, Save, ChevronDown, ChevronUp, Trash2, X, Copy,
  ClipboardList, Calendar, User, Briefcase, ShieldCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Project } from '../../types';
import api from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useConfiguratorParts } from '../../hooks/useConfiguratorParts';
import {
  UI, TabContainer, StatusBadge, EnhancedNavFooter,
  AnimatedSection, MotionBox, StaggerList, StaggerItem,
} from '../UIComponents';

interface QualityReq { text: string; checked: boolean; }

const DEFAULT_REQUIREMENTS: QualityReq[] = [
  { text: 'Dimensional Accuracy: Verify all dimensions per drawing specifications', checked: true },
  { text: 'Surface Finish: Check surface roughness requirements', checked: true },
  { text: 'Material Certificate: Verify material test certificate matches specs', checked: true },
  { text: 'Heat Treatment: Verify heat treatment certificate if applicable', checked: false },
  { text: 'Visual Inspection: Check for cracks, porosity, surface defects', checked: true },
  { text: 'Thread Gauging: Verify thread specifications if applicable', checked: false },
  { text: 'Hardness Test: Verify hardness requirements if specified', checked: false },
  { text: 'NDT/NDE: Non-destructive testing if required', checked: false },
];

interface WOLocal {
  id?: string;
  wOrderNumber: string;
  jobIndices: number[];
  jobRequirements: Record<number, string>;
  dueDate: string;
  preparedBy: string;
  approvedBy: string;
  qualityRequirements: QualityReq[];
  isSaving: boolean;
}

interface WorkOrderTabProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
  onGoToEstimation?: () => void;
}

const makeBlankWO = (defaultPreparedBy: string, defaultReqs: QualityReq[] = [...DEFAULT_REQUIREMENTS]): WOLocal => ({
  id: undefined,
  wOrderNumber: 'Auto Generated',
  jobIndices: [],
  jobRequirements: {},
  dueDate: '',
  preparedBy: defaultPreparedBy,
  approvedBy: '',
  qualityRequirements: defaultReqs,
  isSaving: false,
});

const fieldInputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px', fontSize: '0.8125rem', background: 'var(--bg-surface-2, #0f1622)',
    border: `1px solid ${UI.border}`,
    '& fieldset': { border: 'none' },
    '&:hover': { borderColor: 'var(--text-muted)' },
    '&.Mui-focused': { borderColor: UI.primary, boxShadow: `0 0 0 3px ${alpha(UI.primary, 0.08)}` },
  },
  '& .MuiInputBase-input': {
    py: 0.85,
    color: 'var(--text-primary, #f8fbff)',
    '&::placeholder': { color: 'var(--text-muted, #9ab0d0)', opacity: 1 },
  },
  '& input[type="date"]::-webkit-calendar-picker-indicator': {
    filter: 'invert(1) brightness(0.7)',
    cursor: 'pointer',
  },
  '& .MuiSelect-select': { color: 'var(--text-primary, #f8fbff)' },
  '& .MuiSvgIcon-root': { color: 'var(--text-muted, #9ab0d0)' },
};

const ReadOnlyField: React.FC<{ value: string }> = ({ value }) => (
  <Box sx={{
    py: 0.85, px: 1.5, borderRadius: '8px',
    border: `1px solid ${UI.borderLight}`, bgcolor: UI.bgSubtle,
    minHeight: 38, display: 'flex', alignItems: 'center',
  }}>
    <Typography sx={{ fontSize: '0.8125rem', color: UI.textMuted }}>{value}</Typography>
  </Box>
);

const WorkOrderTab: React.FC<WorkOrderTabProps> = ({ project, onUpdate, onBack, onNext, onGoToEstimation }) => {
  const [workOrders, setWorkOrders] = useState<WOLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const { showError, showSuccess } = useNotification();
  const [pdfGenerated, setPdfGenerated] = useState<Record<string, boolean>>({});
  const [downloadingWO, setDownloadingWO] = useState<number | null>(null);
  const [collapsedWOs, setCollapsedWOs] = useState<Set<number>>(new Set());
  const [expandedConditions, setExpandedConditions] = useState<Set<number>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());
  const [preparedByOptions, setPreparedByOptions] = useState<string[]>([]);
  const [approvedByOptions, setApprovedByOptions] = useState<string[]>([]);

  const toggleCollapse = (idx: number) =>
    setCollapsedWOs(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; });

  const toggleConditionsExpand = (idx: number) =>
    setExpandedConditions(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; });

  const toggleJobsExpand = (idx: number) =>
    setExpandedJobs(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; });

  const { parts: customParts } = useConfiguratorParts(project);
  const poNumber      = project.salesOrder?.customer_po_number || project.salesOrder?.sales_order_number || '—';
  const clientName    = project.client?.client_name ?? project.quote_info?.client_name ?? '—';
  const projectName   = project.project_name ?? '—';
  const defaultPrepBy = project.quote_info?.seller_prepared_by ?? '';

  // get the scheduled delivery date from the salesOrderTab
  const scheduledDelivery = project.salesOrder?.delivery_date
    ? project.salesOrder.delivery_date.slice(0,10)
    : '-';

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await api.get('/users');
        const list = res.data?.data || res.data || [];
        setUsers(list.map((u: any) => ({ id: u.id, name: u.name })));
      } catch { /* ignore */ }
    };
    loadUsers();
    loadWorkOrders();
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteWO = (woIdx: number) => {
    if (workOrders.length === 1) { showError('At least one Work Order must exist.'); return; }
    setWorkOrders(prev => prev.filter((_, i) => i !== woIdx));
  };

  const loadWorkOrders = async () => {
    setLoading(true);
    try {
      const [res, sysRes] = await Promise.all([
        api.get(`/work-orders/project/${project.id}`).catch((e: any) => {
          // 404 = no work orders yet — normal state; anything else log quietly
          if (e?.response?.status !== 404) console.warn('[WorkOrderTab] fetch failed', e?.response?.status, e?.message);
          return { data: { data: [] } };
        }),
        api.get('/settings/system').catch(() => ({ data: { data: {} } })),
      ]);
      const sysSettings = sysRes.data?.settings || sysRes.data?.data || sysRes.data || {};

      let defaultReqs = [...DEFAULT_REQUIREMENTS];
      if (sysSettings.workOrderQualityReqs) {
        defaultReqs = sysSettings.workOrderQualityReqs
          .split('\n')
          .filter((s: string) => s.trim() !== '')
          .map((s: string) => ({ text: s.trim(), checked: true }));
      }

      const preparedSrc = sysSettings.workOrderPreparedBy || sysSettings.woPreparedByNames || '';
      const preparedOptions = preparedSrc
        ? preparedSrc.split('\n').map((s: string) => s.trim()).filter(Boolean).slice(0, 5)
        : [];
      if (preparedOptions.length > 0) setPreparedByOptions(preparedOptions);

      const approvedSrc = sysSettings.workOrderApprovedBy || sysSettings.woApprovedByNames || '';
      const approvedOptions = approvedSrc
        ? approvedSrc.split('\n').map((s: string) => s.trim()).filter(Boolean).slice(0, 5)
        : [];
      if (approvedOptions.length > 0) setApprovedByOptions(approvedOptions);

      const preparedDefault = preparedOptions[0] || defaultPrepBy || '';

      const raw = res.data?.data;
      const arr: any[] = Array.isArray(raw) ? raw : raw?.id ? [raw] : [];
      if (arr.length === 0) {
        setWorkOrders([makeBlankWO(preparedDefault, defaultReqs)]);
        setExpandedJobs(new Set());
        setExpandedConditions(new Set());
      } else {
        setExpandedJobs(new Set());
        setExpandedConditions(new Set());
        setWorkOrders(arr.map(wo => ({
          id: wo.id,
          wOrderNumber: wo.work_order_number ?? 'Auto Generated',
          jobIndices: Array.isArray((wo as any).job_ids) ? (wo as any).job_ids : [],
          jobRequirements: (wo as any).job_requirements || {},
          dueDate: wo.target_date ? wo.target_date.slice(0, 10) : '',
          preparedBy: (wo as any).prepared_by || preparedDefault,
          approvedBy: (wo as any).approved_by ?? '',
          qualityRequirements: (() => {
            const raw = (wo as any).quality_requirements;
            if (!Array.isArray(raw) || raw.length === 0) return defaultReqs;
            return raw.map((r: any) =>
              typeof r === 'string' ? { text: r, checked: true } : { text: r.text ?? r, checked: r.checked !== false }
            );
          })(),
          isSaving: false,
        })));
      }
    } catch (err: any) {
      console.error('[WorkOrderTab] unexpected error in loadWorkOrders', err);
      showError('Error loading work orders');
      setWorkOrders([makeBlankWO(defaultPrepBy)]);
    } finally {
      setLoading(false);
    }
  };

  const usedByOthers = (exceptIdx: number): Set<number> => {
    const used = new Set<number>();
    workOrders.forEach((wo, i) => { if (i !== exceptIdx) wo.jobIndices.forEach(j => used.add(j)); });
    return used;
  };

  const updateWO = (idx: number, patch: Partial<WOLocal>) =>
    setWorkOrders(prev => prev.map((wo, i) => (i === idx ? { ...wo, ...patch } : wo)));

  const toggleJob = (woIdx: number, partIdx: number, blocked: boolean) => {
    if (blocked) return;
    const wo = workOrders[woIdx];
    updateWO(woIdx, {
      jobIndices: wo.jobIndices.includes(partIdx)
        ? wo.jobIndices.filter(j => j !== partIdx)
        : [...wo.jobIndices, partIdx],
    });
  };

  const handleSave = async (woIdx: number) => {
    const wo = workOrders[woIdx];

    if (wo.preparedBy.trim() === '' || !wo.preparedBy) {
      showError('Prepared By is required.');
      return;
    }
    if (!wo.approvedBy || wo.approvedBy.trim() === '') {
      showError('Approved By is required.');
      return;
    }

    // Frontend guardrails so users get immediate, field-specific feedback.
    if (!Array.isArray(wo.jobIndices) || wo.jobIndices.length === 0) {
      showError('Select at least one Job before saving.');
      return;
    }

    const checkedConditions = (wo.qualityRequirements || []).filter(r => r.checked);
    if (checkedConditions.length === 0) {
      showError('Select at least one Condition / Quality Requirement before saving.');
      return;
    }

    const hasEmptyCheckedCondition = checkedConditions.some(r => !String(r.text ?? '').trim());
    if (hasEmptyCheckedCondition) {
      showError('Conditions / Quality Requirements contains an empty selected line. Fill it or uncheck it.');
      return;
    }

    updateWO(woIdx, { isSaving: true });
    try {
      const payload = {
        project_id:            project.id,
        target_date:           wo.dueDate || scheduledDelivery,
        prepared_by:           wo.preparedBy || null,
        approved_by:           wo.approvedBy || null,
        quality_requirements:  wo.qualityRequirements.map(r => ({ text: r.text, checked: r.checked })),
        special_instructions:  [],
        job_ids:               wo.jobIndices,
        job_requirements:      wo.jobRequirements,
      };
      if (wo.id) {
        await api.patch(`/work-orders/${wo.id}`, payload);
      } else {
        const res = await api.post('/work-orders', payload);
        updateWO(woIdx, { id: res.data?.data?.id, wOrderNumber: res.data?.data?.work_order_number ?? 'WO-Auto' });
      }
      showSuccess(`Work Order #${woIdx + 1} saved successfully`);
      onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message ?? 'Error saving work order');
    } finally {
      updateWO(woIdx, { isSaving: false });
    }
  };

  const handleDownload = async (wo: WOLocal, _woIdx: number) => {
    if (!wo.id) { showError('Please save the work order first.'); return; }
    try {
      setDownloadingWO(_woIdx);
      // Auto-save latest data before generating PDF to ensure correct values
      const payload = {
        project_id:            project.id,
        target_date:           wo.dueDate || null,
        prepared_by:           wo.preparedBy || null,
        approved_by:           wo.approvedBy || null,
        quality_requirements:  wo.qualityRequirements.map(r => ({ text: r.text, checked: r.checked })),
        special_instructions:  [],
        job_ids:               wo.jobIndices,
        job_requirements:      wo.jobRequirements,
      };
      await api.patch(`/work-orders/${wo.id}`, payload);

      const res = await api.get(`/work-orders/${wo.id}/traveller`, { responseType: 'blob' });
      const disposition = res.headers?.['content-disposition'] || '';
      const fnMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a   = document.createElement('a'); a.href = url;
      a.download = fnMatch?.[1]?.trim() || `WorkOrder-${wo.wOrderNumber ?? wo.id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      showSuccess('Work Order PDF downloaded');
      setPdfGenerated(prev => ({ ...prev, [wo.id!]: true }));
    } catch (err: any) {
      showError(err.response?.data?.message ?? 'Error generating PDF');
    } finally {
      setDownloadingWO(null);
    }
  };

  const handleAddWorkOrderBelow = (idx: number) => {
    setWorkOrders(prev => {
      const defaultReqs = prev[idx].qualityRequirements.length ? prev[idx].qualityRequirements : [...DEFAULT_REQUIREMENTS];
      const next = [...prev];
      next.splice(idx + 1, 0, makeBlankWO(defaultPrepBy, defaultReqs));
      return next;
    });
  };

  const handleCopyWorkOrderBelow = (idx: number) => {
    setWorkOrders(prev => {
      const toCopy = prev[idx];
      const copy: WOLocal = {
        ...toCopy,
        id: undefined,
        wOrderNumber: 'Auto Generated',
        isSaving: false,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const handleNext = () => {
    const savedWOs = workOrders.filter(wo => wo.id);
    if (savedWOs.length === 0) {
      showError('Please save at least one Work Order before proceeding.');
      return;
    }
    onNext?.();
  };

  return (
    <TabContainer>
      <AnimatedSection>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: '12px',
            backgroundColor: 'rgba(0,200,255,0.10)',
            border: '1px solid rgba(0,200,255,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ClipboardList size={22} color="#00c8ff" />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Work Order
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: '#6B7280' }}>
              Create and manage internal work orders for production
            </Typography>
          </Box>
        </Box>
      </AnimatedSection>

      <AnimatedSection delay={0.05}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: UI.textMuted }}>
              {workOrders.length} Work Order{workOrders.length !== 1 ? 's' : ''}
            </Typography>
            <StatusBadge status={workOrders.some(w => w.id) ? 'active' : 'draft'} size="sm" />
          </Box>
          <Button
            variant="outlined"
            startIcon={<Plus size={15} />}
            onClick={() => setWorkOrders(prev => [...prev, makeBlankWO(defaultPrepBy, prev.length > 0 ? prev[prev.length - 1].qualityRequirements : [...DEFAULT_REQUIREMENTS])])}
            sx={{
              borderRadius: UI.radiusSm, textTransform: 'none', fontWeight: 600,
              fontSize: '0.8125rem', borderColor: UI.primary, color: UI.primary,
              px: 2, py: 0.75,
              '&:hover': { bgcolor: alpha(UI.primary, 0.04), borderColor: UI.primary },
            }}
          >
            Add Work Order
          </Button>
        </Box>
      </AnimatedSection>

      {loading && <LinearProgress sx={{ borderRadius: 4, mb: 3, height: 3, '& .MuiLinearProgress-bar': { bgcolor: UI.primary } }} />}

      <StaggerList>
        {!loading && workOrders.map((wo, woIdx) => {
          const blocked = usedByOthers(woIdx);
          const isSaved = !!wo.id;
          return (
            <StaggerItem key={woIdx}>
              <Box sx={{ mb: 3 }}>
                {/* WO Card */}
                <Box sx={{
                  bgcolor: UI.bgCard, border: `1px solid ${UI.border}`,
                  borderRadius: UI.radius, boxShadow: UI.shadow, overflow: 'hidden',
                  borderTop: `3px solid ${UI.primary}`,
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': { boxShadow: UI.shadowMd },
                }}>
                  {/* Header */}
                  <Box
                    onClick={() => toggleCollapse(woIdx)}
                    sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      px: 2.5, py: 1.5, cursor: 'pointer',
                      bgcolor: UI.bgSubtle, borderBottom: !collapsedWOs.has(woIdx) ? `1px solid ${UI.borderLight}` : 'none',
                      transition: 'background 0.15s ease',
                      '&:hover': { bgcolor: alpha(UI.primary, 0.02) },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        width: 32, height: 32, borderRadius: UI.radiusXs,
                        bgcolor: alpha(UI.primary, 0.08), display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: UI.primary,
                      }}>
                        <ClipboardList size={16} />
                      </Box>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: UI.textPrimary }}>
                            Work Order #{woIdx + 1}
                          </Typography>
                          {isSaved && wo.wOrderNumber !== 'Auto Generated' && (
                            <Typography sx={{ fontSize: '0.75rem', color: UI.textMuted }}>
                              {wo.wOrderNumber}
                            </Typography>
                          )}
                          <StatusBadge status={isSaved ? 'confirmed' : 'draft'} size="sm" />
                        </Box>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={e => e.stopPropagation()}>
                      <IconButton
                        size="small"
                        onClick={() => wo.id && handleDownload(wo, woIdx)}
                        disabled={downloadingWO === woIdx || !wo.id}
                        title="Download Work Order PDF"
                        sx={{
                          border: `1px solid #CBD5E1`, color: UI.textSecondary, borderRadius: '8px', width: 30, height: 30,
                          '&:hover': { borderColor: 'var(--text-muted)', bgcolor: 'var(--bg-surface-2)', color: UI.primary }
                        }}
                      >
                        {downloadingWO === woIdx ? <CircularProgress size={14} color="inherit" /> : <PdfIcon sx={{ fontSize: 16 }} />}
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDeleteWO(woIdx)}
                        sx={{ color: UI.textLight, p: 0.5, '&:hover': { color: '#EF4444', bgcolor: '#FEF2F2' } }}>
                        <Trash2 size={14} />
                      </IconButton>
                      <IconButton size="small" onClick={() => toggleCollapse(woIdx)} sx={{ color: UI.textLight, p: 0.5 }}>
                        {collapsedWOs.has(woIdx) ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                      </IconButton>
                    </Box>
                  </Box>

                  <Collapse in={!collapsedWOs.has(woIdx)}>
                    <Box sx={{ p: 2.5 }}>
                      {/* Meta Fields */}
                      <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography sx={labelSx}><ClipboardList size={11} style={{ marginRight: 4 }} />Work Order</Typography>
                          <ReadOnlyField value={wo.id ? wo.wOrderNumber : 'Auto Generated'} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography sx={labelSx}><Calendar size={11} style={{ marginRight: 4 }} />Issue Date</Typography>
                          <ReadOnlyField value={new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography sx={labelSx}><Briefcase size={11} style={{ marginRight: 4 }} />PO No.</Typography>
                          <ReadOnlyField value={poNumber} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography sx={labelSx}><Calendar size={11} style={{ marginRight: 4 }} />Due Date</Typography>
                          <ReadOnlyField value={scheduledDelivery}/>
                          {/* <TextField type="date" size="small" fullWidth value={wo.dueDate}
                            onChange={e => updateWO(woIdx, { dueDate: e.target.value })}
                            InputLabelProps={{ shrink: true }} sx={fieldInputSx} /> */}
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography sx={labelSx}><User size={11} style={{ marginRight: 4 }} />Client Name</Typography>
                          <ReadOnlyField value={clientName} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography sx={labelSx}><User size={11} style={{ marginRight: 4 }} />Prepared By *</Typography>
                          <Select size="small" fullWidth required value={wo.preparedBy || ''}
                            onChange={e => updateWO(woIdx, { preparedBy: e.target.value as string })}
                            displayEmpty sx={fieldInputSx}>
                            <MenuItem value="" disabled><em>Select Name</em></MenuItem>
                            {preparedByOptions.length > 0
                              ? preparedByOptions.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)
                              : users.map(u => <MenuItem key={u.id} value={u.name}>{u.name}</MenuItem>)}
                          </Select>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography sx={labelSx}><Briefcase size={11} style={{ marginRight: 4 }} />Project Name</Typography>
                          <ReadOnlyField value={projectName} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography sx={labelSx}><User size={11} style={{ marginRight: 4 }} />Approved By *</Typography>
                          <Select size="small" fullWidth required value={wo.approvedBy || ''}
                            onChange={e => updateWO(woIdx, { approvedBy: e.target.value as string })}
                            displayEmpty sx={fieldInputSx}>
                            <MenuItem value="" disabled><em>Select Name</em></MenuItem>
                            {approvedByOptions.length > 0
                              ? approvedByOptions.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)
                              : users.map(u => <MenuItem key={u.id} value={u.name}>{u.name}</MenuItem>)}
                          </Select>
                        </Grid>
                      </Grid>

                      {/* Jobs + Quality */}
                      <Grid container spacing={2.5} sx={{ mb: 3 }}>
                        <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                              onClick={() => toggleJobsExpand(woIdx)}>
                              {expandedJobs.has(woIdx) ? <ChevronUp size={14} style={{ marginRight: 4 }} /> : <ChevronDown size={14} style={{ marginRight: 4 }} />}
                              <Typography sx={{ ...sectionLabelSx, mb: 0 }}>
                                <ClipboardList size={12} style={{ marginRight: 4 }} />
                                Select Job:
                              </Typography>
                              <Typography sx={{ fontSize: '0.7rem', color: UI.textMuted, ml: 1 }}>
                                ({wo.jobIndices.length}/{customParts.length} selected)
                              </Typography>
                            </Box>
                            <Typography sx={{ ...sectionLabelSx, mb: 0, fontSize: '0.7rem' }}>Requirement</Typography>
                          </Box>
                          <Box sx={{ ...listBoxSx, display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden' }}>
                            {(() => {
                              const jobsExpanded = expandedJobs.has(woIdx);
                              const visibleParts = jobsExpanded ? customParts : customParts.slice(0, 2);
                              return customParts.length === 0 ? (
                                <Typography sx={{ fontSize: '0.8rem', color: UI.textMuted, px: 1.5, py: 1 }}>
                                  No jobs available. Add components in the Configuration step (Quotation tab’s Selected Components list).
                                </Typography>
                              ) : (<>
                                {visibleParts.map((part, partIdx) => {
                                  const isBlocked  = blocked.has(partIdx);
                                  const isSelected = wo.jobIndices.includes(partIdx);
                                  return (
                                    <Box key={partIdx} sx={{
                                      display: 'flex', alignItems: 'center', py: 0.75, px: 1.25,
                                      borderBottom: partIdx < visibleParts.length - 1 ? `1px solid ${UI.borderLight}` : 'none',
                                      opacity: isBlocked ? 0.45 : 1,
                                    }}>
                                      <Checkbox size="small" checked={isSelected} disabled={isBlocked}
                                        onChange={() => toggleJob(woIdx, partIdx, isBlocked)}
                                        sx={{ p: 0.5, mr: 1, color: UI.primary, '&.Mui-checked': { color: UI.primary } }} />
                                      <Typography sx={{
                                        fontSize: '0.8rem', color: isBlocked ? UI.textMuted : UI.textPrimary,
                                        width: '50%', flexShrink: 0, minWidth: 0, pr: 1,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      }}>
                                        #{String(partIdx + 1).padStart(2, '0')} {part.job_description || part.drawing_part_no || `Job #${partIdx + 1}`}
                                        {part.material ? ` — ${part.material}` : ''}
                                        {part.drawing_part_no && part.job_description ? ` — ${part.drawing_part_no}` : ''}
                                        {isBlocked && <Box component="span" sx={{ fontSize: '0.65rem', color: UI.textMuted, ml: 0.75 }}>(used)</Box>}
                                      </Typography>
                                      <TextField
                                        size="small" fullWidth
                                        value={wo.jobRequirements[partIdx] || ''}
                                        onChange={e => updateWO(woIdx, { jobRequirements: { ...wo.jobRequirements, [partIdx]: e.target.value } })}
                                        disabled={isBlocked}
                                        placeholder="Enter Requirement"
                                        sx={{ flex: 1, minWidth: 0, ...fieldInputSx }}
                                      />
                                    </Box>
                                  );
                                })}
                                {!jobsExpanded && customParts.length > 2 && (
                                  <Box sx={{ px: 1.25, py: 0.5, textAlign: 'center' }}>
                                    <Typography
                                      onClick={() => toggleJobsExpand(woIdx)}
                                      sx={{ fontSize: '0.75rem', color: UI.primary, cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}>
                                      + {customParts.length - 2} more...
                                    </Typography>
                                  </Box>
                                )}
                                {jobsExpanded && (
                                  <Button size="small"
                                    onClick={() => onGoToEstimation?.()}
                                    sx={{
                                      mt: 0.5, fontSize: '0.75rem', textTransform: 'none', px: 1.5,
                                      color: UI.primary, '&:hover': { bgcolor: alpha(UI.primary, 0.04) },
                                    }}>
                                    + Add line (go to Configuration)
                                  </Button>
                                )}
                              </>);
                            })()}
                          </Box>
                        </Grid>

                        <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                              onClick={() => toggleConditionsExpand(woIdx)}>
                              {expandedConditions.has(woIdx) ? <ChevronUp size={14} style={{ marginRight: 4 }} /> : <ChevronDown size={14} style={{ marginRight: 4 }} />}
                              <Typography sx={{ ...sectionLabelSx, mb: 0 }}>
                                <ShieldCheck size={12} style={{ marginRight: 4 }} />
                                Conditions / Quality Requirements:
                              </Typography>
                              <Typography sx={{ fontSize: '0.7rem', color: UI.textMuted, ml: 1 }}>
                                ({wo.qualityRequirements.filter(r => r.checked).length}/{wo.qualityRequirements.length} selected)
                              </Typography>
                            </Box>
                            <Button size="small"
                              onClick={() => updateWO(woIdx, { qualityRequirements: [...wo.qualityRequirements, { text: '', checked: true }] })}
                              sx={{
                                textTransform: 'none', fontSize: '0.75rem', fontWeight: 600,
                                color: UI.primary, py: 0.25, px: 1,
                                '&:hover': { bgcolor: alpha(UI.primary, 0.06) },
                              }}>
                              + Add Line
                            </Button>
                          </Box>
                          <Box sx={{ ...listBoxSx, display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden' }}>
                            {(() => {
                              const condsExpanded = expandedConditions.has(woIdx);
                              const visibleReqs = condsExpanded ? wo.qualityRequirements : wo.qualityRequirements.slice(0, 2);
                              return wo.qualityRequirements.length === 0 ? (
                                <Typography sx={{ fontSize: '0.8rem', color: UI.textMuted, px: 2, py: 1.5 }}>
                                  No requirements added. Click "+ Add Line" to start.
                                </Typography>
                              ) : (<>
                                {visibleReqs.map((req, reqIdx) => (
                                  <Box key={reqIdx} sx={{
                                    display: 'flex', alignItems: 'center',
                                    borderBottom: reqIdx < visibleReqs.length - 1 ? `1px solid ${UI.borderLight}` : 'none',
                                    px: 1.25, py: 0.5,
                                  }}>
                                    <Checkbox
                                      size="small"
                                      checked={req.checked}
                                      onChange={e => {
                                        const updated = [...wo.qualityRequirements];
                                        updated[reqIdx] = { ...updated[reqIdx], checked: e.target.checked };
                                        updateWO(woIdx, { qualityRequirements: updated });
                                      }}
                                      sx={{ p: 0.5, mr: 0.5, color: UI.primary, '&.Mui-checked': { color: UI.primary } }}
                                    />
                                    <Typography sx={{ fontSize: '0.8rem', color: UI.textPrimary, flex: 1 }}>
                                      {req.text || <Box component="span" sx={{ color: UI.textMuted, fontStyle: 'italic' }}>Enter Instruction</Box>}
                                    </Typography>
                                  </Box>
                                ))}
                                {!condsExpanded && wo.qualityRequirements.length > 2 && (
                                  <Box sx={{ px: 1.25, py: 0.5, textAlign: 'center' }}>
                                    <Typography
                                      onClick={() => toggleConditionsExpand(woIdx)}
                                      sx={{ fontSize: '0.75rem', color: UI.primary, cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}>
                                      + {wo.qualityRequirements.length - 2} more...
                                    </Typography>
                                  </Box>
                                )}
                              </>);
                            })()}
                          </Box>
                        </Grid>
                      </Grid>

                      {/* Actions */}
                      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        <Button variant="contained" startIcon={<Save size={14} />} onClick={() => handleSave(woIdx)} disabled={wo.isSaving}
                          sx={{
                            bgcolor: UI.primary, borderRadius: UI.radiusSm, px: 2.5, py: 0.85,
                            textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem',
                            boxShadow: `0 2px 8px ${alpha(UI.primary, 0.15)}`,
                            '&:hover': { bgcolor: UI.primaryDark, boxShadow: `0 4px 12px ${alpha(UI.primary, 0.25)}` },
                          }}>
                          {wo.isSaving ? 'Saving...' : 'Save'}
                        </Button>
                        {wo.id && (
                          <Button variant="outlined" startIcon={<FileDown size={14} />} onClick={() => handleDownload(wo, woIdx)}
                            sx={{
                              borderRadius: UI.radiusSm, px: 2, py: 0.85,
                              textTransform: 'none', fontWeight: 500, fontSize: '0.8125rem',
                              borderColor: UI.primary, color: UI.primary,
                              '&:hover': { bgcolor: alpha(UI.primary, 0.04), borderColor: UI.primary },
                            }}>
                            Download Work Order PDF
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Collapse>
                </Box>

                {/* Add / Copy below */}
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5, ml: 0.5 }}>
                  <Button variant="text" size="small" startIcon={<Plus size={13} />}
                    onClick={() => handleAddWorkOrderBelow(woIdx)}
                    sx={{
                      textTransform: 'none', fontWeight: 500, fontSize: '0.75rem',
                      color: UI.textMuted, borderRadius: UI.radiusXs,
                      '&:hover': { color: UI.primary, bgcolor: alpha(UI.primary, 0.04) },
                    }}>
                    Add New
                  </Button>
                  <Button variant="text" size="small" startIcon={<Copy size={13} />}
                    onClick={() => handleCopyWorkOrderBelow(woIdx)}
                    sx={{
                      textTransform: 'none', fontWeight: 500, fontSize: '0.75rem',
                      color: UI.textMuted, borderRadius: UI.radiusXs,
                      '&:hover': { color: UI.primary, bgcolor: alpha(UI.primary, 0.04) },
                    }}>
                    Copy
                  </Button>
                </Box>
              </Box>
            </StaggerItem>
          );
        })}
      </StaggerList>

      <EnhancedNavFooter
        onBack={onBack}
        onNext={handleNext}
        backLabel="Back to PO to Vendor"
        nextLabel="Next: Production"
        nextDisabled={!onNext}
      />
    </TabContainer>
  );
};

const labelSx = {
  fontSize: '0.6875rem', fontWeight: 600, color: UI.textLight,
  textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.5,
  display: 'flex', alignItems: 'center',
} as const;

const sectionLabelSx = {
  fontSize: '0.8rem', fontWeight: 600, color: UI.textPrimary,
  mb: 1, display: 'flex', alignItems: 'center',
} as const;

const listBoxSx = {
  border: `1px solid ${UI.border}`, borderRadius: UI.radiusSm,
  p: 1.5, bgcolor: UI.bgSubtle, minHeight: 40,
} as const;

export default WorkOrderTab;
