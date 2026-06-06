import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Button, Alert, Collapse,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Stack, Select, MenuItem, FormControl, InputLabel, IconButton, Tooltip,
  Checkbox,
} from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Save, FileDown, ChevronUp, ChevronDown, Copy, Trash2,
  Factory, Wrench, ClipboardList,
} from 'lucide-react';
import api from '../../services/api';
import { Project, WorkOrder, CustomPart } from '../../types';
import { useNotification } from '../../contexts/NotificationContext';
import { useConfiguratorParts } from '../../hooks/useConfiguratorParts';
import { getPartQuantity } from '../../utils/calculations';
import {
  UI, inputSx, TabContainer, StatusBadge, ProgressBar, EnhancedNavFooter,
  AnimatedSection, MotionBox, StaggerList, StaggerItem, SectionHeader,
} from '../UIComponents';

/* ══════════════════════════════════════════════════════
   Interfaces & Defaults
   ══════════════════════════════════════════════════════ */
interface SectionBOp { sNo: number; operation: string; description: string; required_operation: string; initials: string; opDate: string; initialsDate?: string; completed?: boolean; }
interface SectionCRow { process: string; selection: string; po: string; operator_vendor: string; inspector: string; completed: boolean; }
interface SectionEChecklist { po: string; drawing: string; materialCert: string; inspecReport: string; delivery: string; }
interface WorkingInstructions { monogram: boolean; thread71: boolean; thread5b: boolean; }
interface JobForm {
  procedureId: string; effectiveDate: string; dimensionReport: string;
  heatNumber: string; size: string; cutLength: string; sectionB: SectionBOp[];
  sectionC: SectionCRow[]; workingInstructions: WorkingInstructions; generalNotes: string;
  sawCutOrBarFeed: string; materialType: string; quantity: string;
  sectionACompleted?: { material: boolean; saw: boolean };
  sectionDNotes: string[];
  sectionEChecklist: SectionEChecklist;
}

const REQUIRED_OP_OPTIONS = ['Yes', 'No', ''];

const DEFAULT_SECTION_B = (): SectionBOp[] => [
  { sNo: 1,  operation: 'Visual Inspection',                     description: 'Inspect all parts for damage, surface finish concerns and part quality',                             initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 2,  operation: 'Initial Cleaning Alkaline Wash',        description: 'Manually clean excessive soil prior to racking (when necessary)',                                    initials: '', opDate: '', required_operation: 'No',  completed: false },
  { sNo: 3,  operation: 'Masking',                               description: 'Mask threaded holes as noted on the specification',                                                 initials: '', opDate: '', required_operation: 'No',  completed: false },
  { sNo: 4,  operation: 'Racking',                               description: 'Ensure solid contact and minimize rack marks – rack on I.D. where possible',                        initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 5,  operation: 'Secondary Cleaning Alkaline Immersion', description: 'Immersion in cleaning tank on racking – 5-30 minutes depending on cleanliness',                     initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 6,  operation: 'Caustic Etch Rinse',                    description: 'Immersion in 115-120 deg F tank for 30 Secs-5 minutes depending on existing oxidation',              initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 7,  operation: 'Acid Etch Rinse',                       description: 'Immersion in 120 deg F tank for 4-6 mins',                                                          initials: '', opDate: '', required_operation: 'No',  completed: false },
  { sNo: 8,  operation: 'DeOx Rinse',                            description: 'Immersion in ambient tank for 5-10 minutes and verify parts free of smut',                           initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 9,  operation: 'Anodize Rinse',                         description: 'Parts to be ran at correct tank temperature and current density/voltage',                             initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 10, operation: 'Neutralize Rinse',                      description: 'Immersion in nitric acid on racking for 5-10 minutes followed by thorough rinsing',                  initials: '', opDate: '', required_operation: 'No',  completed: false },
  { sNo: 11, operation: 'Dye Rinse',                             description: 'Immersion of parts racked or unracked in correct dye and temperature until saturated',               initials: '', opDate: '', required_operation: 'No',  completed: false },
  { sNo: 12, operation: 'Seal Rinse',                            description: 'Immersion in nickel acetate seat at 165-185 deg F for 5-20 minutes',                                 initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 13, operation: 'Dry',                                   description: 'Dry water from parts with compressed air and allow to hang dry for 15 minutes',                      initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 14, operation: 'Un-Rack',                               description: 'Un-rack parts careful not to scratch or damage surfaces and remove masking',                         initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 15, operation: 'Technical Inspect',                     description: 'Inspect parts for even coating, note acceptable rack marks, verify colors',                          initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 16, operation: 'Commercial Inspection',                 description: 'WO entries complete, marking correct, visual inspection of part',                                    initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 17, operation: 'Package',                               description: 'Securely and professionally package parts for shipment',                                             initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 18, operation: 'Final Acceptance',                      description: 'Supervisor acceptance of packaging quality and documentation',                                        initials: '', opDate: '', required_operation: 'Yes', completed: false },
  { sNo: 19, operation: 'Product Release',                       description: 'Release of product by HAMF and acceptance by customer',                                              initials: '', opDate: '', required_operation: 'Yes', completed: false },
];

function makeDefaultForm(woNumber: string, index: number, part?: CustomPart): JobForm {
  // Build default effective-date as YYYY-MM (month input format)
  const now = new Date();
  const effectiveDateDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    procedureId: `PT-${woNumber}-${String(index + 1).padStart(2, '0')}`,
    effectiveDate: effectiveDateDefault, dimensionReport: 'YES',
    heatNumber: part?.heat_number || '',
    size: part?.raw_material_dimension || '',
    cutLength: '',
    sectionB: DEFAULT_SECTION_B(),
    sectionC: [
      { process: '', selection: '', po: '', operator_vendor: '', inspector: '', completed: false },
      { process: '', selection: '', po: '', operator_vendor: '', inspector: '', completed: false },
      { process: '', selection: '', po: '', operator_vendor: '', inspector: '', completed: false },
    ],
    workingInstructions: { monogram: false, thread71: false, thread5b: false },
    generalNotes: '',
    sawCutOrBarFeed: '',
    materialType: part?.material_grade || part?.material || '',
    quantity: String(part ? getPartQuantity(part) || '' : ''),
    sectionACompleted: { material: false, saw: false },
    sectionDNotes: ['', '', '', ''],
    sectionEChecklist: { po: '', drawing: '', materialCert: '', inspecReport: '', delivery: '' },
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
  const [heatNumberErrors, setHeatNumberErrors] = useState<Record<number, boolean>>({});
  const [heatNumberOptions, setHeatNumberOptions] = useState<Record<number, Array<{ heat_number: string; quantity: number }>>>({});
  const { parts: customParts } = useConfiguratorParts(project) as { parts: CustomPart[] };

  /* ── Data Loading ── */
  const loadWorkOrder = useCallback(async () => {
    try {
      const res = await api.get(`/work-orders/project/${project.id}`);
      const raw = res.data?.data;
      const arr: any[] = Array.isArray(raw) ? raw : raw?.id ? [raw] : [];
      const wo = arr[0];
      if (!wo) { setLoading(false); return; }
      setWorkOrder(wo);
      const saved: JobForm[] = wo.production_forms || [];
      const count = Math.max(customParts.length, saved.length);
      const forms: JobForm[] = [];
      const woNum = wo.work_order_number || 'WO';
      for (let i = 0; i < count; i++) {
        const part = customParts[i];
        const base = makeDefaultForm(woNum, i, part);
        if (saved[i]) {
          // Only overlay non-empty saved values on top of defaults
          const merged = { ...base };
          const sv = saved[i] as any;
          for (const key of Object.keys(sv)) {
            if (sv[key] !== undefined && sv[key] !== null && sv[key] !== '') {
              (merged as any)[key] = sv[key];
            }
          }
          // Preserve part-derived defaults if saved values are still empty
          if (!merged.heatNumber && part?.heat_number) merged.heatNumber = part.heat_number;
          if (!merged.size && part?.raw_material_dimension) merged.size = part.raw_material_dimension;
          if (!merged.materialType && (part?.material_grade || part?.material)) merged.materialType = part?.material_grade || part?.material || '';
          // Always sync quantity from estimation (read-only in traveler)
          if (part) merged.quantity = String(getPartQuantity(part) || '');
          if (!merged.effectiveDate) {
            merged.effectiveDate = base.effectiveDate;
          }
          // Migrate old operator+date format → initials + opDate
          const savedSB = sv.sectionB || base.sectionB;
          merged.sectionB = (Array.isArray(savedSB) ? savedSB : base.sectionB).map((op: any, ri: number) => {
            const def = base.sectionB[ri] || {} as any;
            const initials = op.initials ?? op.operator ?? (op.initialsDate ? op.initialsDate.split(' ')[0] : '') ?? '';
            const opDate = op.opDate ?? op.date ?? '';
            return { sNo: op.sNo ?? ri + 1, operation: op.operation || def.operation || '', description: op.description || def.description || '', required_operation: op.required_operation || def.required_operation || '', initials, opDate, completed: !!op.completed };
          });
          // Ensure sectionC and workingInstructions exist (backward compat)
          if (!Array.isArray(merged.sectionC) || merged.sectionC.length === 0) {
            merged.sectionC = base.sectionC;
          } else {
            // Migrate old sectionC rows: ensure completed field exists
            merged.sectionC = merged.sectionC.map((row: any) => ({
              process: row.process || '', selection: row.selection || '', po: row.po || '',
              operator_vendor: row.operator_vendor || '', inspector: row.inspector || '',
              completed: typeof row.completed === 'boolean' ? row.completed : false,
            }));
          }
          if (!merged.workingInstructions || typeof merged.workingInstructions !== 'object') {
            merged.workingInstructions = base.workingInstructions;
          }
          // Ensure sectionDNotes and sectionEChecklist exist (backward compat)
          if (!Array.isArray(merged.sectionDNotes) || merged.sectionDNotes.length < 4) {
            merged.sectionDNotes = base.sectionDNotes;
          }
          if (!merged.sectionEChecklist || typeof merged.sectionEChecklist !== 'object') {
            merged.sectionEChecklist = base.sectionEChecklist;
          }
          forms.push(merged);
        } else {
          forms.push(base);
        }
      }
      setProductionForms(forms);
      // Default all jobs to collapsed
      setExpandedJobs(new Set());
    } catch { /* no WO yet */ } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, customParts.length]);

  useEffect(() => { loadWorkOrder(); }, [loadWorkOrder]);

  /* ── Fetch heat number options from Material Stock for each job ── */
  // Build a stable key from the IDs that drive heat-number lookup.
  // Re-fetches when the underlying raw_material_id or parts_master_id values change
  // (not just when the array length changes).
  const heatNumberKey = customParts.map(p => `${p.raw_material_id || ''}_${p.parts_master_id || ''}`).join(',');

  useEffect(() => {
    if (!customParts.length) return;
    customParts.forEach((part, idx) => {
      // STRICT ID-BASED MATCHING: use raw_material_id only
      const raw_material_id = part.raw_material_id || '';
      const parts_master_id = part.parts_master_id || '';

      // Must have either raw_material_id or parts_master_id to look up heat numbers
      if (!raw_material_id && !parts_master_id) {
        setHeatNumberOptions(prev => ({ ...prev, [idx]: [] }));
        return;
      }

      const params: Record<string, string> = {};
      if (raw_material_id) {
        params.raw_material_id = raw_material_id;
      } else if (parts_master_id) {
        // Fallback: backend resolves raw_material_id from parts_master_id
        params.parts_master_id = parts_master_id;
      }

      api.get('/stocks/heat-numbers', { params })
        .then(res => {
          const data: Array<{ heat_number: string; quantity: number }> = res.data?.data || [];
          setHeatNumberOptions(prev => ({ ...prev, [idx]: data }));
        })
        .catch(() => {
          setHeatNumberOptions(prev => ({ ...prev, [idx]: [] }));
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatNumberKey]);

  /* ── Handlers ── */
  const toggleJob = (idx: number) =>
    setExpandedJobs(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });

  const updateForm = (idx: number, field: keyof JobForm, value: any) => {
    setProductionForms(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  };

  const updateSectionB = (jobIdx: number, rowIdx: number, field: keyof SectionBOp, value: string | boolean) => {
    setProductionForms(prev => prev.map((f, i) =>
      i === jobIdx ? { ...f, sectionB: f.sectionB.map((op, ri) => ri === rowIdx ? { ...op, [field]: value } : op) } : f
    ));
  };

  const validateJob = (idx: number): boolean => {
    const form = productionForms[idx];
    if (!form.heatNumber.trim()) {
      setHeatNumberErrors(prev => ({ ...prev, [idx]: true }));
      return false;
    }
    return true;
  };

  const handleSaveJob = async (jobIdx: number) => {
    if (!workOrder) return;
    if (!validateJob(jobIdx)) {
      showError('Please fill in Heat Number before saving');
      return;
    }
    setSavingJob(jobIdx);
    try {
      await api.patch(`/work-orders/${workOrder.id}/production-forms`, { production_forms: productionForms });
      showSuccess(`Job #${jobIdx + 1} saved successfully`);
      onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving form');
    } finally { setSavingJob(null); }
  };

  const handleDownloadJobPdf = async (jobIdx: number) => {
    if (!workOrder) return;
    if (!validateJob(jobIdx)) {
      showError('Please fill in Heat Number before downloading');
      return;
    }
    setDownloadingJob(jobIdx);
    try {
      // Auto-save before download so PDF uses latest data
      await api.patch(`/work-orders/${workOrder.id}/production-forms`, { production_forms: productionForms });

      const formData = productionForms[jobIdx] || {};
      const partData = customParts[jobIdx] || {};
      const res = await api.post(
        `/work-orders/${workOrder.id}/job-pdf`,
        { jobIndex: jobIdx, formData, partData },
        { responseType: 'blob' }
      );
      const disposition = res.headers?.['content-disposition'] || '';
      const fnMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fnMatch?.[1]?.trim() || `ProductionTraveller-Job${jobIdx + 1}-${workOrder.work_order_number}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      showSuccess(`Downloaded Production Traveller for Job #${jobIdx + 1}`);
    } catch (err: any) {
      // Handle blob error responses from axios
      let message = 'Error generating PDF';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          message = json.message || message;
        } catch {}
      } else if (err.response?.data?.message) {
        message = err.response.data.message;
      }
      showError(message);
    } finally { setDownloadingJob(null); }
  };

  const handleCopyJob = async (srcIdx: number) => {
    if (!workOrder) return;
    const source = productionForms[srcIdx];
    const newIdx = productionForms.length;
    const woNum = workOrder.work_order_number || 'WO';
    const newForm: JobForm = {
      ...JSON.parse(JSON.stringify(source)),
      procedureId: `PT-${woNum}-${String(newIdx + 1).padStart(2, '0')}`,
      sectionB: source.sectionB.map((op, ri) => ({
        ...op, sNo: ri + 1, required_operation: op.required_operation || '', initials: '', opDate: '', completed: false,
      })),
    };
    const updated = [...productionForms, newForm];
    setProductionForms(updated);
    setExpandedJobs(prev => new Set([...prev, newIdx]));
    try {
      await api.patch(`/work-orders/${workOrder.id}/production-forms`, { production_forms: updated });
      showSuccess(`Job #${newIdx + 1} added as a copy of Job #${srcIdx + 1}`);
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
      await api.patch(`/work-orders/${workOrder.id}/production-forms`, { production_forms: updated });
      showSuccess(`Job #${delIdx + 1} deleted`);
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
    <TabContainer>

      {/* ── Page Header ── */}
      <AnimatedSection>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: '12px',
            backgroundColor: 'rgba(0,200,255,0.10)',
            border: '1px solid rgba(0,200,255,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Factory size={26} color="#00c8ff" />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 22, color: UI.textPrimary, letterSpacing: -0.3 }}>
              Production Traveller
            </Typography>
            <Typography sx={{ fontSize: 13, color: UI.textMuted }}>
              Manage production job travellers and machining operations
            </Typography>
          </Box>
          {workOrder && (
            <Stack direction="row" spacing={1} alignItems="center">
              <StatusBadge status={completedJobs === numJobs && numJobs > 0 ? 'completed' : 'in-progress'} />
              <Chip
                label={`${completedJobs} / ${numJobs} Jobs`}
                sx={{
                  height: 32, fontWeight: 600, fontSize: 13, bgcolor: UI.primaryBg, color: UI.primary,
                  border: `1px solid ${UI.primaryLight}22`, borderRadius: UI.radiusXs,
                }}
              />
            </Stack>
          )}
        </Box>

        {workOrder && numJobs > 0 && (
          <ProgressBar value={progress} label={`${Math.round(progress)}% complete`} />
        )}
      </AnimatedSection>

      {/* ── No Work Order Alert ── */}
      {!loading && !workOrder && (
        <Alert severity="info" sx={{
          mb: 3, borderRadius: UI.radiusSm, border: '1px solid #bfdbfe',
          bgcolor: '#eff6ff', '& .MuiAlert-icon': { color: '#3b82f6' },
        }}>
          No work order found for this project. Please create one in the Work Order tab first.
        </Alert>
      )}

      {workOrder && (
        <>
          {/* ── Empty State ── */}
          {numJobs === 0 && (
            <Card sx={{
              borderRadius: UI.radius, border: `1px solid ${UI.border}`, boxShadow: UI.shadow,
              textAlign: 'center', py: 6,
            }}>
              <CardContent>
                <Factory size={48} color={UI.border} style={{ marginBottom: 8 }} />
                <Typography sx={{ fontSize: 15, color: UI.textMuted, fontWeight: 500 }}>
                  No jobs found. Ensure the estimate has custom parts added.
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* ── Job Cards ── */}
          <StaggerList>
            {productionForms.map((form, idx) => {
              const part = customParts[idx];
              const isExpanded = expandedJobs.has(idx);
              const isCopied = idx >= customParts.length;
              return (
                <StaggerItem key={idx}>
                <Card sx={{
                  borderRadius: UI.radius,
                  border: `1px solid ${isExpanded ? UI.primaryLight + '44' : UI.border}`,
                  boxShadow: isExpanded ? UI.shadowMd : UI.shadow,
                  overflow: 'hidden', transition: 'all 0.25s ease',
                  '&:hover': { boxShadow: UI.shadowMd, borderColor: UI.primaryLight + '44' },
                }}>
                  {/* ── Job Header Row ── */}
                  <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 2.5, py: 2,
                    background: isExpanded ? UI.primaryBg : UI.bgCard,
                    borderBottom: isExpanded ? `1px solid ${UI.border}` : 'none',
                    cursor: 'pointer', transition: 'background 0.2s',
                  }} onClick={() => toggleJob(idx)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        width: 36, height: 36, borderRadius: UI.radiusXs,
                        background: isCopied ? `${UI.primaryLight}22` : UI.gradient,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Wrench size={18} color={isCopied ? UI.primary : '#fff'} />
                      </Box>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: 14, color: UI.textPrimary }}>
                            #{String(idx + 1).padStart(2, '0')}&nbsp;
                            {part?.job_description || part?.drawing_part_no || `Job #${idx + 1}`}
                          </Typography>
                          {isCopied && (
                            <Chip label="Copy" size="small" sx={{
                              height: 20, fontSize: 10, fontWeight: 600,
                              bgcolor: `${UI.primaryLight}18`, color: UI.primary, borderRadius: '6px',
                            }} />
                          )}
                        </Box>
                        <Typography sx={{ fontSize: 12, color: UI.textMuted }}>
                          {part?.material ? `Material: ${part.material}` : ''}
                          {part?.drawing_part_no && part?.job_description ? ` \u00b7 Drawing: ${part.drawing_part_no}` : ''}
                          {form.procedureId ? ` \u00b7 ${form.procedureId}` : ''}
                        </Typography>
                      </Box>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center" onClick={e => e.stopPropagation()}>
                      <Tooltip title="Copy Job" arrow>
                        <IconButton size="small" onClick={() => handleCopyJob(idx)}
                          sx={{ color: UI.textMuted, '&:hover': { color: UI.primary, bgcolor: UI.primaryBg } }}>
                          <Copy size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={downloadingJob === idx ? 'Generating...' : 'Download Production Traveller PDF'} arrow>
                        <span>
                        <IconButton size="small" onClick={() => handleDownloadJobPdf(idx)}
                          disabled={downloadingJob === idx}
                          sx={{ color: UI.textMuted, '&:hover': { color: UI.primary, bgcolor: UI.primaryBg } }}>
                          <FileDown size={16} />
                        </IconButton>
                        </span>
                      </Tooltip>
                      {isCopied && (
                        <Tooltip title="Delete" arrow>
                          <IconButton size="small" onClick={() => handleDeleteJob(idx)}
                            sx={{ color: UI.textMuted, '&:hover': { color: UI.danger, bgcolor: UI.dangerBg } }}>
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => toggleJob(idx)}
                        sx={{
                          color: isExpanded ? '#fff' : UI.textMuted,
                          background: isExpanded ? UI.gradient : 'transparent',
                          border: isExpanded ? 'none' : `1px solid ${UI.border}`,
                          borderRadius: UI.radiusXs,
                          width: 32, height: 32,
                          '&:hover': isExpanded
                            ? { boxShadow: UI.shadowMd }
                            : { borderColor: UI.primary, color: UI.primary, bgcolor: UI.primaryBg },
                        }}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </IconButton>
                    </Stack>
                  </Box>

                  {/* ── Expanded Form ── */}
                  <Collapse in={isExpanded} unmountOnExit>
                    <Box sx={{ p: 3, bgcolor: UI.bgSubtle }}>

                      {/* Job Details */}
                      <SectionHeader icon={<ClipboardList size={18} />} title="Job Details" subtitle="Procedure and tracking information" />
                      <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField fullWidth label="Procedure ID" size="small" sx={inputSx()}
                            value={form.procedureId}
                            onChange={e => updateForm(idx, 'procedureId', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth label="Raw Material ID" size="small" sx={inputSx()}
                            value={customParts[idx]?.raw_material_display_id || ''}
                            InputProps={{ readOnly: true }}
                            InputLabelProps={{ shrink: true }}
                            disabled
                            helperText="Auto-populated from Estimation (read-only)"
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                          {(() => {
                            const rawOptions = heatNumberOptions[idx] || [];
                            // Deduplicate: one entry per unique heat_number, preserve all distinct values
                            const seen = new Set<string>();
                            const options = rawOptions.filter(o => {
                              if (!o.heat_number || o.quantity <= 0) return false;
                              if (seen.has(o.heat_number)) return false;
                              seen.add(o.heat_number);
                              return true;
                            });
                            const noStock = options.length === 0;
                            return (
                              <FormControl fullWidth size="small" required error={!!heatNumberErrors[idx]}
                                sx={{
                                  ...inputSx(),
                                  ...(heatNumberErrors[idx] ? {
                                    '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': { borderColor: UI.danger },
                                  } : {}),
                                }}
                              >
                                <InputLabel>Heat Number *</InputLabel>
                                <Select
                                  value={noStock ? 'NO_STOCK' : form.heatNumber}
                                  label="Heat Number *"
                                  disabled={noStock}
                                  onChange={e => {
                                    const val = e.target.value as string;
                                    if (val !== 'NO_STOCK') {
                                      updateForm(idx, 'heatNumber', val);
                                      if (val.trim()) setHeatNumberErrors(prev => ({ ...prev, [idx]: false }));
                                    }
                                  }}
                                  MenuProps={{ PaperProps: { sx: { borderRadius: UI.radiusXs } } }}
                                >
                                  {noStock ? (
                                    <MenuItem value="NO_STOCK" disabled>No Stock</MenuItem>
                                  ) : (
                                    options.map(o => (
                                      <MenuItem key={o.heat_number} value={o.heat_number}>{o.heat_number}</MenuItem>
                                    ))
                                  )}
                                </Select>
                                {heatNumberErrors[idx] && (
                                  <Typography variant="caption" sx={{ color: UI.danger, ml: 1.5, mt: 0.5 }}>
                                    Heat Number is required
                                  </Typography>
                                )}
                              </FormControl>
                            );
                          })()}
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField fullWidth label="Effective Date" size="small" type="month" sx={inputSx()}
                            value={form.effectiveDate}
                            onChange={e => updateForm(idx, 'effectiveDate', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                          <FormControl fullWidth size="small" sx={inputSx()}>
                            <InputLabel>Dimension Report</InputLabel>
                            <Select value={form.dimensionReport} label="Dimension Report"
                              onChange={e => updateForm(idx, 'dimensionReport', e.target.value as string)}
                              MenuProps={{ PaperProps: { sx: { borderRadius: UI.radiusXs } } }}
                            >
                              {REQUIRED_OP_OPTIONS.map(opt => (
                                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                          <FormControl fullWidth size="small" sx={inputSx()}>
                            <InputLabel>Saw Cut Or Bar Feed?</InputLabel>
                            <Select value={form.sawCutOrBarFeed} label="Saw Cut Or Bar Feed?"
                              onChange={e => updateForm(idx, 'sawCutOrBarFeed', e.target.value as string)}
                              MenuProps={{ PaperProps: { sx: { borderRadius: UI.radiusXs } } }}
                            >
                              {['Saw Cut', 'Bar Feed', 'N/A'].map(opt => (
                                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                      </Grid>

                      {/* Material */}
                      <SectionHeader icon={<Wrench size={18} />} title="Section A: Material" subtitle="Material dimensions and cut specifications" />
                      <Grid container spacing={2} sx={{ mb: 1 }}>
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField fullWidth label="Size" size="small" sx={inputSx()}
                            value={form.size}
                            onChange={e => updateForm(idx, 'size', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField fullWidth label="Material Type" size="small" sx={inputSx()}
                            value={form.materialType}
                            onChange={e => updateForm(idx, 'materialType', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField fullWidth label="Cut Length" size="small" sx={inputSx()}
                            value={form.cutLength}
                            onChange={e => updateForm(idx, 'cutLength', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField fullWidth label="Quantity (from Estimation)" size="small"
                            value={form.quantity}
                            InputProps={{ readOnly: true }}
                            sx={{
                              ...inputSx(),
                              '& .MuiOutlinedInput-root': { bgcolor: '#f9fafb' },
                            }}
                            helperText="Auto-synced from Estimation"
                          />
                        </Grid>
                      </Grid>

                      {/* Section A Completion Checkboxes */}
                      <Box sx={{
                        display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3, mt: 1,
                        p: 2, borderRadius: UI.radiusSm,
                        border: `1px solid ${UI.border}`, bgcolor: UI.bgCard,
                      }}>
                        <Typography sx={{ width: '100%', fontWeight: 600, fontSize: 13, color: UI.textPrimary, mb: 0.5 }}>
                          Section A — Check off once complete
                        </Typography>
                        <Box sx={{
                          display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
                          borderRadius: UI.radiusXs,
                          border: `1px solid ${form.sectionACompleted?.material ? UI.primary : UI.border}`,
                          bgcolor: form.sectionACompleted?.material ? UI.primaryBg : '#fff',
                          transition: 'all 0.2s',
                        }}>
                          <Checkbox
                            checked={!!form.sectionACompleted?.material}
                            onChange={e => updateForm(idx, 'sectionACompleted', { ...(form.sectionACompleted || { material: false, saw: false }), material: e.target.checked })}
                            size="small"
                            sx={{ color: UI.primary, '&.Mui-checked': { color: UI.primary }, p: 0 }}
                          />
                          <Typography sx={{ fontSize: 13, fontWeight: form.sectionACompleted?.material ? 600 : 400, color: UI.textPrimary }}>
                            Material Specs Complete
                          </Typography>
                        </Box>
                        <Box sx={{
                          display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
                          borderRadius: UI.radiusXs,
                          border: `1px solid ${form.sectionACompleted?.saw ? UI.primary : UI.border}`,
                          bgcolor: form.sectionACompleted?.saw ? UI.primaryBg : '#fff',
                          transition: 'all 0.2s',
                        }}>
                          <Checkbox
                            checked={!!form.sectionACompleted?.saw}
                            onChange={e => updateForm(idx, 'sectionACompleted', { ...(form.sectionACompleted || { material: false, saw: false }), saw: e.target.checked })}
                            size="small"
                            sx={{ color: UI.primary, '&.Mui-checked': { color: UI.primary }, p: 0 }}
                          />
                          <Typography sx={{ fontSize: 13, fontWeight: form.sectionACompleted?.saw ? 600 : 400, color: UI.textPrimary }}>
                            Saw Complete
                          </Typography>
                        </Box>
                      </Box>

                      {/* Operations Table */}
                      <SectionHeader icon={<Factory size={18} />} title="Section B: Traveler" subtitle="Track each operation step — check off once complete" />
                      <TableContainer sx={{
                        mb: 3, borderRadius: UI.radiusSm, border: `1px solid ${UI.border}`,
                        overflow: 'hidden', boxShadow: UI.shadow,
                      }}>
                        <Table size="medium">
                          <TableHead>
                            <TableRow>
                              {[
                                { label: 'Line',                    width: 50 },
                                { label: 'Operation',               width: 150 },
                                { label: 'Description',             width: undefined },
                                { label: 'Required Operation(s)?',  width: 180 },
                                { label: 'Operator',                width: 110 },
                                { label: 'Date',                    width: 110 },
                                { label: 'Complete',                width: 70 },
                              ].map(h => (
                                <TableCell key={h.label} sx={{
                                  '&.MuiTableCell-head': {
                                    background: UI.gradient, color: '#FFFFFF', fontWeight: 800,
                                    fontSize: 13, py: 2, px: 2, letterSpacing: 0.5, textTransform: 'uppercase',
                                    borderBottom: 'none', textAlign: 'center', verticalAlign: 'middle',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                  },
                                  ...(h.width ? { width: h.width, minWidth: h.width } : {}),
                                }}>{h.label}</TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {form.sectionB.map((op, ri) => (
                              <TableRow key={ri} sx={{
                                bgcolor: ri % 2 === 0 ? UI.bgCard : UI.bgSubtle,
                                '&:hover': { bgcolor: UI.primaryBg },
                                transition: 'background 0.15s',
                                '& td': { py: 1.5, px: 1.5, fontSize: 13, lineHeight: 1.5, verticalAlign: 'middle' },
                              }}>
                                <TableCell sx={{ fontWeight: 600, fontSize: 13, color: UI.primary, textAlign: 'center' }}>
                                  {op.sNo}
                                </TableCell>
                                <TableCell>
                                  <TextField fullWidth size="small" variant="standard"
                                    placeholder="Enter Operation"
                                    value={op.operation}
                                    onChange={e => updateSectionB(idx, ri, 'operation', e.target.value)}
                                    sx={{ '& .MuiInput-underline:after': { borderColor: UI.primary }, fontWeight: 600, fontSize: 13 }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField fullWidth multiline maxRows={3} size="small" variant="standard"
                                    placeholder="Enter Description"
                                    value={op.description}
                                    onChange={e => updateSectionB(idx, ri, 'description', e.target.value)}
                                    sx={{ '& .MuiInput-underline:after': { borderColor: UI.primary } }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <FormControl fullWidth size="small" variant="standard">
                                    <Select
                                      value={op.required_operation || ''}
                                      onChange={e => updateSectionB(idx, ri, 'required_operation', e.target.value as string)}
                                      displayEmpty
                                      sx={{
                                        fontSize: 13,
                                        '&:after': { borderColor: UI.primary },
                                        '& .MuiSelect-select': { py: 0.5 },
                                      }}
                                      MenuProps={{ PaperProps: { sx: { borderRadius: UI.radiusXs } } }}
                                    >
                                      <MenuItem value="" disabled>Select...</MenuItem>
                                      {REQUIRED_OP_OPTIONS.map(opt => (
                                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                </TableCell>
                                <TableCell>
                                  <FormControl fullWidth size="small" variant="standard">
                                    <Select
                                      value={op.initials || ''}
                                      onChange={e => updateSectionB(idx, ri, 'initials', e.target.value as string)}
                                      displayEmpty
                                      sx={{
                                        fontSize: 13,
                                        '&:after': { borderColor: UI.primary },
                                        '& .MuiSelect-select': { py: 0.5 },
                                      }}
                                      MenuProps={{ PaperProps: { sx: { borderRadius: UI.radiusXs } } }}
                                    >
                                      <MenuItem value="" disabled>Select...</MenuItem>
                                      <MenuItem value="MW">MW</MenuItem>
                                      <MenuItem value="JW">JW</MenuItem>
                                      <MenuItem value="N/A">N/A</MenuItem>
                                    </Select>
                                  </FormControl>
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" type="date"
                                    value={op.opDate || ''}
                                    onChange={e => updateSectionB(idx, ri, 'opDate', e.target.value)}
                                    sx={{ '& .MuiInput-underline:after': { borderColor: UI.primary }, '& .MuiInput-input': { fontSize: 12, py: 0.25 } }}
                                    InputProps={{ sx: { fontSize: 12 } }}
                                  />
                                </TableCell>
                                <TableCell sx={{ textAlign: 'center' }}>
                                  <Checkbox
                                    checked={!!op.completed}
                                    onChange={e => updateSectionB(idx, ri, 'completed', e.target.checked)}
                                    size="small"
                                    sx={{ color: UI.primary, '&.Mui-checked': { color: UI.primary }, p: 0 }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>

                      {/* ══════════════════════════════════════════════════════
                         Section C: General Notes
                         ══════════════════════════════════════════════════════ */}
                      <SectionHeader icon={<Factory size={18} />} title="Section C: General Notes" subtitle="" />
                      <Box sx={{ mb: 3 }}>
                        <TextField fullWidth multiline rows={3} size="small"
                          value={form.generalNotes}
                          onChange={e => updateForm(idx, 'generalNotes', e.target.value)}
                          placeholder="Enter general notes..."
                          sx={inputSx()}
                        />
                      </Box>

                      {/* Action Buttons */}
                      <Box sx={{
                        display: 'flex', justifyContent: 'flex-end', gap: 1.5,
                        pt: 2.5, borderTop: `1px solid ${UI.border}`,
                      }}>
                        <Button variant="outlined" startIcon={<Save size={16} />}
                          onClick={() => handleSaveJob(idx)} disabled={savingJob === idx}
                          sx={{
                            borderColor: UI.primary, color: UI.primary, borderRadius: UI.radiusXs,
                            textTransform: 'none', fontWeight: 600, fontSize: 13, px: 3,
                            '&:hover': { bgcolor: UI.primaryBg, borderColor: UI.primary },
                          }}
                        >
                          {savingJob === idx ? 'Saving...' : 'Save Job'}
                        </Button>
                        <Button variant="contained" startIcon={<FileDown size={16} />}
                          onClick={() => handleDownloadJobPdf(idx)} disabled={downloadingJob === idx}
                          sx={{
                            background: UI.gradient, borderRadius: UI.radiusXs,
                            textTransform: 'none', fontWeight: 600, fontSize: 13, px: 3,
                            boxShadow: 'none', '&:hover': { boxShadow: UI.shadowMd },
                          }}
                        >
                          {downloadingJob === idx ? 'Generating...' : 'Download Traveller'}
                        </Button>
                      </Box>
                    </Box>
                  </Collapse>
                </Card>
                </StaggerItem>
              );
            })}
          </StaggerList>
        </>
      )}

      {/* ── Bottom Navigation ── */}
      <EnhancedNavFooter
        onBack={onBack}
        onNext={onNext}
        backLabel="Back to Work Order"
        nextLabel="Next: Quality"
      />
    </TabContainer>
  );
};

export default ProductionTab;
