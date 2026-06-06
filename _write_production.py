content = r"""import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Button, Alert, LinearProgress, Collapse,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Stack, Select, MenuItem, FormControl, InputLabel, IconButton, Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import AssignmentIcon from '@mui/icons-material/Assignment';
import BuildIcon from '@mui/icons-material/Build';
import NotesIcon from '@mui/icons-material/Notes';
import api from '../../services/api';
import { Project, WorkOrder, CustomPart } from '../../types';
import { useNotification } from '../../contexts/NotificationContext';

/* ══════════════════════════════════════════════════════
   Design Tokens
   ══════════════════════════════════════════════════════ */
const T = {
  primary:      '#15803d',
  primaryLight: '#22c55e',
  primaryBg:    '#F0FDF4',
  dark:         '#1e293b',
  textPrimary:  '#1e293b',
  textSecondary:'#64748b',
  border:       '#e2e8f0',
  bg:           '#f8fafc',
  white:        '#ffffff',
  danger:       '#ef4444',
  dangerBg:     '#fef2f2',
  radius:       '14px',
  radiusSm:     '10px',
  radiusXs:     '8px',
  shadow:       '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.06)',
  shadowLg:     '0 8px 24px rgba(0,0,0,0.08)',
  gradient:     'linear-gradient(135deg, #15803d 0%, #22c55e 100%)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radiusXs,
    backgroundColor: T.white,
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.primaryLight },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.primary, borderWidth: 2 },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: T.primary },
};

/* ── Reusable Section Header ── */
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
    <Box sx={{
      width: 36, height: 36, borderRadius: T.radiusXs, background: T.gradient,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      '& svg': { fontSize: 18, color: T.white },
    }}>
      {icon}
    </Box>
    <Box>
      <Typography sx={{ fontWeight: 700, fontSize: 15, color: T.textPrimary, lineHeight: 1.2 }}>{title}</Typography>
      {subtitle && <Typography sx={{ fontSize: 12, color: T.textSecondary }}>{subtitle}</Typography>}
    </Box>
  </Box>
);

/* ══════════════════════════════════════════════════════
   Interfaces & Defaults
   ══════════════════════════════════════════════════════ */
interface SectionBOp { sNo: number; operation: string; description: string; operator: string; date: string; }
interface JobForm {
  procedureId: string; effectiveDate: string; dimensionReport: string;
  heatNumber: string; size: string; cutLength: string; sectionB: SectionBOp[]; generalNotes: string;
}

const DEFAULT_SECTION_B = (): SectionBOp[] => [
  { sNo: 1, operation: 'Lathe',            description: '', operator: '', date: '' },
  { sNo: 2, operation: 'Mill',             description: '', operator: '', date: '' },
  { sNo: 3, operation: 'Waterjet',         description: '', operator: '', date: '' },
  { sNo: 4, operation: 'Deburr',           description: '', operator: '', date: '' },
  { sNo: 5, operation: 'Marking',          description: '', operator: '', date: '' },
  { sNo: 6, operation: 'Final QC',         description: '', operator: '', date: '' },
  { sNo: 7, operation: 'Final Acceptance', description: '', operator: '', date: '' },
];

function makeDefaultForm(woNumber: string, index: number): JobForm {
  return {
    procedureId: BTICKPT-${woNumber}-${String(index + 1).padStart(2, '0')}BTICK,
    effectiveDate: '', dimensionReport: 'YES', heatNumber: '',
    size: '', cutLength: '', sectionB: DEFAULT_SECTION_B(), generalNotes: '',
  };
}

/* ══════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════ */
interface ProductionTabProps {
  project: Project; onUpdate: () => void;
  onBack?: () => void; onNext?: () => void;
}

const ProductionTab: React.FC<ProductionTabProps> = ({ project, onUpdate, onBack, onNext }) => {
  const { showSuccess, showError } = useNotification();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());
  const [productionForms, setProductionForms] = useState<JobForm[]>([]);
  const [savingJob, setSavingJob] = useState<number | null>(null);
  const [downloadingJob, setDownloadingJob] = useState<number | null>(null);
  const customParts: CustomPart[] = (project as any).estimate?.custom_parts || [];

  /* ── Data Loading ── */
  const loadWorkOrder = useCallback(async () => {
    try {
      const res = await api.get(BTICK/work-orders/project/${project.id}BTICK);
      const wo = res.data;
      setWorkOrder(wo);
      const saved: JobForm[] = wo.production_forms || [];
      const count = Math.max(customParts.length, saved.length);
      const forms: JobForm[] = [];
      const woNum = wo.work_order_number || 'WO';
      for (let i = 0; i < count; i++) {
        forms.push(saved[i] ? { ...makeDefaultForm(woNum, i), ...saved[i] } : makeDefaultForm(woNum, i));
      }
      setProductionForms(forms);
    } catch { /* no WO yet */ } finally { setLoading(false); }
  }, [project.id, customParts.length]);

  useEffect(() => { loadWorkOrder(); }, [loadWorkOrder]);

  /* ── Handlers ── */
  const toggleJob = (idx: number) =>
    setExpandedJobs(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });

  const updateForm = (idx: number, field: keyof JobForm, value: any) => {
    setProductionForms(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  };

  const updateSectionB = (jobIdx: number, rowIdx: number, field: keyof SectionBOp, value: string) => {
    setProductionForms(prev => prev.map((f, i) =>
      i === jobIdx ? { ...f, sectionB: f.sectionB.map((op, ri) => ri === rowIdx ? { ...op, [field]: value } : op) } : f
    ));
  };

  const handleSaveJob = async (jobIdx: number) => {
    if (!workOrder) return;
    setSavingJob(jobIdx);
    try {
      await api.patch(BTICK/work-orders/${workOrder.id}/production-formsBTICK, { production_forms: productionForms });
      showSuccess(BTICKJob #${jobIdx + 1} saved successfullyBTICK);
      onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving form');
    } finally { setSavingJob(null); }
  };

  const handleDownloadJobPdf = async (jobIdx: number) => {
    if (!workOrder) return;
    setDownloadingJob(jobIdx);
    try {
      const formData = productionForms[jobIdx] || {};
      const partData = customParts[jobIdx] || {};
      const res = await api.post(
        BTICK/work-orders/${workOrder.id}/job-pdfBTICK,
        { jobIndex: jobIdx, formData, partData },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = BTICKProductionTraveller-Job${jobIdx + 1}-${workOrder.work_order_number}.pdfBTICK;
      a.click();
      window.URL.revokeObjectURL(url);
      showSuccess(BTICKDownloaded Production Traveller for Job #${jobIdx + 1}BTICK);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error generating PDF');
    } finally { setDownloadingJob(null); }
  };

  const handleCopyJob = async (srcIdx: number) => {
    if (!workOrder) return;
    const source = productionForms[srcIdx];
    const newIdx = productionForms.length;
    const woNum = workOrder.work_order_number || 'WO';
    const newForm: JobForm = {
      ...JSON.parse(JSON.stringify(source)),
      procedureId: BTICKPT-${woNum}-${String(newIdx + 1).padStart(2, '0')}BTICK,
      sectionB: source.sectionB.map((op, ri) => ({
        ...op, sNo: ri + 1, operator: '', date: '',
      })),
    };
    const updated = [...productionForms, newForm];
    setProductionForms(updated);
    setExpandedJobs(prev => new Set([...prev, newIdx]));
    try {
      await api.patch(BTICK/work-orders/${workOrder.id}/production-formsBTICK, { production_forms: updated });
      showSuccess(BTICKJob #${newIdx + 1} added as a copy of Job #${srcIdx + 1}BTICK);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving copied job');
    }
  };

  const handleDeleteJob = async (delIdx: number) => {
    if (!workOrder) return;
    const updated = productionForms.filter((_, i) => i !== delIdx).map((f) => ({
      ...f,
      procedureId: f.procedureId,
    }));
    setProductionForms(updated);
    setExpandedJobs(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < delIdx) next.add(i); else if (i > delIdx) next.add(i - 1); });
      return next;
    });
    try {
      await api.patch(BTICK/work-orders/${workOrder.id}/production-formsBTICK, { production_forms: updated });
      showSuccess(BTICKJob #${delIdx + 1} deletedBTICK);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error deleting job');
    }
  };

  /* ── Derived ── */
  const numJobs = productionForms.length;
  const completedJobs = ((workOrder as any)?.production_forms || []).filter((f: any) => f && Object.keys(f).length > 0).length;
  const progress = numJobs > 0 ? (completedJobs / numJobs) * 100 : 0;

  /* ══════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════ */
  return (
    <Box sx={{ pb: 2 }}>

      {/* ── Page Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: T.radius, background: T.gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(21,128,61,0.18)',
          '& svg': { fontSize: 26, color: T.white },
        }}>
          <PrecisionManufacturingIcon />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 22, color: T.textPrimary, letterSpacing: -0.3 }}>
            Production Traveller
          </Typography>
          <Typography sx={{ fontSize: 13, color: T.textSecondary }}>
            Manage production job travellers and machining operations
          </Typography>
        </Box>
        {workOrder && (
          <Chip
            label={BTICK${completedJobs} / ${numJobs} Jobs CompletedBTICK}
            sx={{
              height: 32, fontWeight: 600, fontSize: 13, bgcolor: T.primaryBg, color: T.primary,
              border: BTICK1px solid ${T.primaryLight}22BTICK, borderRadius: T.radiusXs,
            }}
          />
        )}
      </Box>

      {/* ── No Work Order Alert ── */}
      {!loading && !workOrder && (
        <Alert severity="info" sx={{
          mb: 3, borderRadius: T.radiusSm, border: '1px solid #bfdbfe',
          bgcolor: '#eff6ff', '& .MuiAlert-icon': { color: '#3b82f6' },
        }}>
          No work order found for this project. Please create one in the Work Order tab first.
        </Alert>
      )}

      {workOrder && (
        <>
          {/* ── Progress Card ── */}
          <Card sx={{
            mb: 3, borderRadius: T.radius, border: BTICK1px solid ${T.border}BTICK,
            boxShadow: T.shadow, overflow: 'hidden',
            '&::before': {
              content: '""', display: 'block', height: 4,
              background: T.gradient,
            },
          }}>
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AssignmentIcon sx={{ fontSize: 20, color: T.primary }} />
                  <Typography sx={{ fontWeight: 700, fontSize: 15, color: T.textPrimary }}>
                    Overall Progress
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 28, color: T.primary, lineHeight: 1 }}>
                    {Math.round(progress)}%
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: T.textSecondary, ml: 1 }}>
                    {completedJobs} of {numJobs} jobs
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ position: 'relative', height: 12, bgcolor: '#e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                <Box sx={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: BTICK${progress}%BTICK, background: T.gradient, borderRadius: 6,
                  transition: 'width 0.6s ease',
                  '&::after': {
                    content: '""', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    animation: progress > 0 ? 'shimmer 2s infinite' : 'none',
                  },
                  '@keyframes shimmer': {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(100%)' },
                  },
                }} />
              </Box>
            </CardContent>
          </Card>

          {/* ── Empty State ── */}
          {numJobs === 0 && (
            <Card sx={{
              borderRadius: T.radius, border: BTICK1px solid ${T.border}BTICK, boxShadow: T.shadow,
              textAlign: 'center', py: 6,
            }}>
              <CardContent>
                <PrecisionManufacturingIcon sx={{ fontSize: 48, color: T.border, mb: 1 }} />
                <Typography sx={{ fontSize: 15, color: T.textSecondary, fontWeight: 500 }}>
                  No jobs found. Ensure the estimate has custom parts added.
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* ── Job Cards ── */}
          <Stack spacing={2}>
            {productionForms.map((form, idx) => {
              const part = customParts[idx];
              const isExpanded = expandedJobs.has(idx);
              const isCopied = idx >= customParts.length;
              return (
                <Card key={idx} sx={{
                  borderRadius: T.radius,
                  border: BTICK1px solid ${isExpanded ? T.primaryLight + '44' : T.border}BTICK,
                  boxShadow: isExpanded ? T.shadowMd : T.shadow,
                  overflow: 'hidden', transition: 'all 0.25s ease',
                  '&:hover': { boxShadow: T.shadowMd, borderColor: T.primaryLight + '44' },
                }}>
                  {/* ── Job Header Row ── */}
                  <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 2.5, py: 2,
                    background: isExpanded ? T.primaryBg : T.white,
                    borderBottom: isExpanded ? BTICK1px solid ${T.border}BTICK : 'none',
                    cursor: 'pointer', transition: 'background 0.2s',
                  }} onClick={() => toggleJob(idx)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        width: 36, height: 36, borderRadius: T.radiusXs,
                        background: isCopied ? BTICK${T.primaryLight}22BTICK : T.gradient,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        '& svg': { fontSize: 18, color: isCopied ? T.primary : T.white },
                      }}>
                        <BuildIcon />
                      </Box>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: 14, color: T.textPrimary }}>
                            #{String(idx + 1).padStart(2, '0')}&nbsp;
                            {part?.job_description || part?.drawing_part_no || BTICKJob #${idx + 1}BTICK}
                          </Typography>
                          {isCopied && (
                            <Chip label="Copy" size="small" sx={{
                              height: 20, fontSize: 10, fontWeight: 700,
                              bgcolor: BTICK${T.primaryLight}18BTICK, color: T.primary, borderRadius: '6px',
                            }} />
                          )}
                        </Box>
                        <Typography sx={{ fontSize: 12, color: T.textSecondary }}>
                          {part?.material ? BTICKMaterial: ${part.material}BTICK : ''}
                          {part?.drawing_part_no && part?.job_description ? BTICK \u00b7 Drawing: ${part.drawing_part_no}BTICK : ''}
                          {form.procedureId ? BTICK \u00b7 ${form.procedureId}BTICK : ''}
                        </Typography>
                      </Box>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center" onClick={e => e.stopPropagation()}>
                      <Tooltip title="Copy Job" arrow>
                        <IconButton size="small" onClick={() => handleCopyJob(idx)}
                          sx={{ color: T.textSecondary, '&:hover': { color: T.primary, bgcolor: T.primaryBg } }}>
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={downloadingJob === idx ? 'Generating...' : 'Download PDF'} arrow>
                        <span>
                        <IconButton size="small" onClick={() => handleDownloadJobPdf(idx)}
                          disabled={downloadingJob === idx}
                          sx={{ color: T.textSecondary, '&:hover': { color: T.primary, bgcolor: T.primaryBg } }}>
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                        </span>
                      </Tooltip>
                      {isCopied && (
                        <Tooltip title="Delete" arrow>
                          <IconButton size="small" onClick={() => handleDeleteJob(idx)}
                            sx={{ color: T.textSecondary, '&:hover': { color: T.danger, bgcolor: T.dangerBg } }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Button
                        size="small"
                        variant={isExpanded ? 'contained' : 'outlined'}
                        endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        onClick={() => toggleJob(idx)}
                        sx={isExpanded ? {
                          background: T.gradient, color: T.white, borderRadius: T.radiusXs,
                          textTransform: 'none', fontWeight: 600, fontSize: 13, px: 2, py: 0.5,
                          boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd },
                        } : {
                          borderColor: T.border, color: T.textSecondary, borderRadius: T.radiusXs,
                          textTransform: 'none', fontWeight: 600, fontSize: 13, px: 2, py: 0.5,
                          '&:hover': { borderColor: T.primary, color: T.primary, bgcolor: T.primaryBg },
                        }}
                      >
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </Button>
                    </Stack>
                  </Box>

                  {/* ── Expanded Form ── */}
                  <Collapse in={isExpanded} unmountOnExit>
                    <Box sx={{ p: 3, bgcolor: T.bg }}>

                      {/* Job Details */}
                      <SectionHeader icon={<AssignmentIcon />} title="Job Details" subtitle="Procedure and tracking information" />
                      <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField fullWidth label="Procedure ID" size="small" sx={inputSx}
                            value={form.procedureId}
                            onChange={e => updateForm(idx, 'procedureId', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField fullWidth label="Effective Date" size="small" type="month" sx={inputSx}
                            value={form.effectiveDate}
                            onChange={e => updateForm(idx, 'effectiveDate', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <FormControl fullWidth size="small" sx={inputSx}>
                            <InputLabel>Dimension Report</InputLabel>
                            <Select value={form.dimensionReport} label="Dimension Report"
                              onChange={e => updateForm(idx, 'dimensionReport', e.target.value as string)}
                              MenuProps={{ PaperProps: { sx: { borderRadius: T.radiusXs } } }}
                            >
                              <MenuItem value="YES">YES</MenuItem>
                              <MenuItem value="NO">NO</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField fullWidth label="Heat Number" size="small" sx={inputSx}
                            value={form.heatNumber}
                            onChange={e => updateForm(idx, 'heatNumber', e.target.value)}
                          />
                        </Grid>
                      </Grid>

                      {/* Section A: Material */}
                      <SectionHeader icon={<BuildIcon />} title="Section A: Material" subtitle="Size and cut specifications" />
                      <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6}>
                          <TextField fullWidth label="Size" size="small" sx={inputSx}
                            value={form.size}
                            onChange={e => updateForm(idx, 'size', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField fullWidth label="Cut Length" size="small" sx={inputSx}
                            value={form.cutLength}
                            onChange={e => updateForm(idx, 'cutLength', e.target.value)}
                          />
                        </Grid>
                      </Grid>

                      {/* Section B: Operations Table */}
                      <SectionHeader icon={<PrecisionManufacturingIcon />} title="Section B: Machining &amp; Milling Operations" subtitle="Track each operation step" />
                      <TableContainer sx={{
                        mb: 3, borderRadius: T.radiusSm, border: BTICK1px solid ${T.border}BTICK,
                        overflow: 'hidden', boxShadow: T.shadow,
                      }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              {['S.No', 'Operation', 'Description', 'Operator', 'Date'].map(h => (
                                <TableCell key={h} sx={{
                                  background: T.gradient, color: T.white, fontWeight: 700,
                                  fontSize: 12, py: 1.5, letterSpacing: 0.5, textTransform: 'uppercase',
                                  borderBottom: 'none',
                                }}>{h}</TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {form.sectionB.map((op, ri) => (
                              <TableRow key={ri} sx={{
                                bgcolor: ri % 2 === 0 ? T.white : T.bg,
                                '&:hover': { bgcolor: T.primaryBg },
                                transition: 'background 0.15s',
                              }}>
                                <TableCell sx={{ width: 50, fontWeight: 700, fontSize: 13, color: T.primary }}>
                                  {op.sNo}
                                </TableCell>
                                <TableCell sx={{ width: 140, fontWeight: 600, fontSize: 13, color: T.textPrimary }}>
                                  {op.operation}
                                </TableCell>
                                <TableCell>
                                  <TextField fullWidth multiline maxRows={3} size="small" variant="standard"
                                    placeholder="Enter description..."
                                    value={op.description}
                                    onChange={e => updateSectionB(idx, ri, 'description', e.target.value)}
                                    sx={{ '& .MuiInput-underline:after': { borderColor: T.primary } }}
                                  />
                                </TableCell>
                                <TableCell sx={{ width: 140 }}>
                                  <TextField fullWidth size="small" variant="standard" placeholder="Operator"
                                    value={op.operator}
                                    onChange={e => updateSectionB(idx, ri, 'operator', e.target.value)}
                                    sx={{ '& .MuiInput-underline:after': { borderColor: T.primary } }}
                                  />
                                </TableCell>
                                <TableCell sx={{ width: 140 }}>
                                  <TextField fullWidth size="small" variant="standard" type="date"
                                    value={op.date}
                                    onChange={e => updateSectionB(idx, ri, 'date', e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    sx={{ '& .MuiInput-underline:after': { borderColor: T.primary } }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>

                      {/* Section F: General Notes */}
                      <SectionHeader icon={<NotesIcon />} title="Section F: General Notes" />
                      <TextField fullWidth multiline rows={3} size="small"
                        placeholder="Enter general notes..."
                        value={form.generalNotes}
                        onChange={e => updateForm(idx, 'generalNotes', e.target.value)}
                        sx={{ ...inputSx, mb: 3 }}
                      />

                      {/* Action Buttons */}
                      <Box sx={{
                        display: 'flex', justifyContent: 'flex-end', gap: 1.5,
                        pt: 2.5, borderTop: BTICK1px solid ${T.border}BTICK,
                      }}>
                        <Button variant="outlined" startIcon={<SaveIcon />}
                          onClick={() => handleSaveJob(idx)} disabled={savingJob === idx}
                          sx={{
                            borderColor: T.primary, color: T.primary, borderRadius: T.radiusXs,
                            textTransform: 'none', fontWeight: 600, fontSize: 13, px: 3,
                            '&:hover': { bgcolor: T.primaryBg, borderColor: T.primary },
                          }}
                        >
                          {savingJob === idx ? 'Saving...' : 'Save Job'}
                        </Button>
                        <Button variant="contained" startIcon={<DownloadIcon />}
                          onClick={() => handleDownloadJobPdf(idx)} disabled={downloadingJob === idx}
                          sx={{
                            background: T.gradient, borderRadius: T.radiusXs,
                            textTransform: 'none', fontWeight: 600, fontSize: 13, px: 3,
                            boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd },
                          }}
                        >
                          {downloadingJob === idx ? 'Generating...' : 'Download Traveller'}
                        </Button>
                      </Box>
                    </Box>
                  </Collapse>
                </Card>
              );
            })}
          </Stack>
        </>
      )}

      {/* ── Bottom Navigation ── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        pt: 3, mt: 4, borderTop: BTICK2px solid ${T.border}BTICK,
      }}>
        <Button
          variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack} disabled={!onBack}
          sx={{
            borderRadius: T.radiusSm, px: 3, py: 1.2, textTransform: 'none',
            fontWeight: 600, fontSize: 14, borderColor: T.border, color: T.textSecondary,
            '&:hover': { borderColor: T.primary, color: T.primary, bgcolor: T.primaryBg, transform: 'translateX(-2px)' },
            transition: 'all 0.2s',
          }}
        >
          Back to Work Order
        </Button>
        <Button
          variant="contained" endIcon={<ArrowForwardIcon />} onClick={onNext} disabled={!onNext}
          sx={{
            background: T.gradient, borderRadius: T.radiusSm, px: 4, py: 1.2,
            textTransform: 'none', fontWeight: 700, fontSize: 14, letterSpacing: 0.2,
            boxShadow: '0 4px 14px rgba(21,128,61,0.15)',
            '&:hover': { boxShadow: '0 6px 20px rgba(21,128,61,0.25)', transform: 'translateY(-2px)' },
            transition: 'all 0.2s',
          }}
        >
          Next: Quality
        </Button>
      </Box>
    </Box>
  );
};

export default ProductionTab;
"""

# Replace BTICK with actual backtick
content = content.replace("BTICK", "`")

path = r"c:\Users\priya\Forged-Final\frontend\src\components\ProjectTabs\ProductionTab.tsx"
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Written {len(content)} chars to {path}")
