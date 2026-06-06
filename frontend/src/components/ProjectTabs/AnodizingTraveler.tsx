import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Button, Alert, Collapse,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Stack, Select, MenuItem, FormControl, InputLabel, IconButton, Tooltip,
  Checkbox, Radio, RadioGroup, FormControlLabel,
} from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Save, FileDown, ChevronUp, ChevronDown, Copy, Trash2,
  Factory, ClipboardList, Wrench, StickyNote, Droplets,
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Anodizing-specific Interfaces & Defaults
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
interface AnodizingOp {
  line: number;
  operation: string;
  description: string;
  required_operation: string;
  operator: string;
  opDate: string;
  completed?: boolean;
}

interface AnodizingSectionA {
  hamfWoNumber: string;
  productDescription: string;
  partNumber: string;
  specDrawingRevision: string;
  material1: string;
  material2: string;
  material3: string;
  quantity: string;
  customer: string;
  customerPo: string;
  woDate: string;
  shipDate: string;
  anodizeType: string;
  thicknessSpec: string;
  anodizeClass: string;
  dyeColor: string;
  seal: string;
  maskThreads: string;
  tumbled: string;
  scotchBrite: string;
}

interface AnodizingJobForm {
  procedureId: string;
  effectiveDate: string;
  revision: string;
  sectionA: AnodizingSectionA;
  sectionB: AnodizingOp[];
  generalNotes: string;
}

const REQUIRED_OP_OPTIONS = ['Yes', 'No', ''];

const DEFAULT_ANODIZING_SECTION_B = (): AnodizingOp[] => [
  { line: 1,  operation: 'Visual Inspection',                  description: 'Inspect all parts for damage, surface finish concerns and part quality',                                                         required_operation: '', operator: '', opDate: '', completed: false },
  { line: 2,  operation: 'Initial Cleaning Alkaline Wash',     description: 'Manually clean excessive soil prior to racking (when necessary)',                                                                required_operation: '',  operator: '', opDate: '', completed: false },
  { line: 3,  operation: 'Masking',                            description: 'Mask threaded holes as noted on the specification',                                                                             required_operation: '',  operator: '', opDate: '', completed: false },
  { line: 4,  operation: 'Racking',                            description: 'Ensure solid contact and minimize rack marks â€“ rack on I.D. where possible',                                                    required_operation: '', operator: '', opDate: '', completed: false },
  { line: 5,  operation: 'Secondary Cleaning Alkaline Immersion', description: 'Immersion in cleaning tank on racking â€“ 5-30 minutes depending on cleanliness',                                              required_operation: '', operator: '', opDate: '', completed: false },
  { line: 6,  operation: 'Caustic Etch Rinse',                 description: 'Immersion in 115-120 deg F tank for 30 Secs-5 minutes depending on existing oxidation',                                        required_operation: '', operator: '', opDate: '', completed: false },
  { line: 7,  operation: 'Acid Etch Rinse',                    description: 'Immersion in 120 deg F tank for 4-6 mins',                                                                                          required_operation: '',  operator: '', opDate: '', completed: false },
  { line: 8,  operation: 'DeOx Rinse',                         description: 'Immersion in ambient tank for 5-10 minutes and verify parts free of smut',                                                      required_operation: '', operator: '', opDate: '', completed: false },
  { line: 9,  operation: 'Anodize Rinse',                      description: 'Parts to be ran at correct tank temperature and current density/voltage',                                                        required_operation: '', operator: '', opDate: '', completed: false },
  { line: 10, operation: 'Neutralize Rinse',                   description: 'Immersion in nitric acid on racking for 5-10 minutes followed by thorough rinsing',                                             required_operation: '',  operator: '', opDate: '', completed: false },
  { line: 11, operation: 'Dye Rinse',                          description: 'Immersion of parts racked or unracked in correct dye and temperature until saturated',                                          required_operation: '',  operator: '', opDate: '', completed: false },
  { line: 12, operation: 'Seal Rinse',                         description: 'Immersion in nickel acetate seat at 165-185 deg F for 5-20 minutes',                                                            required_operation: '', operator: '', opDate: '', completed: false },
  { line: 13, operation: 'Dry',                                description: 'Dry water from parts with compressed air and allow to hang dry for 15 minutes',                                                 required_operation: '', operator: '', opDate: '', completed: false },
  { line: 14, operation: 'Un-Rack',                            description: 'Un-rack parts careful not to scratch or damage surfaces and remove masking',                                                     required_operation: '', operator: '', opDate: '', completed: false },
  { line: 15, operation: 'Technical Inspect',                  description: 'Inspect parts for even coating, note acceptable rack marks, verify colors',                                                      required_operation: '', operator: '', opDate: '', completed: false },
  { line: 16, operation: 'Commercial Inspection',              description: 'WO entries complete, marking correct, visual inspection of part',                                                                required_operation: '', operator: '', opDate: '', completed: false },
  { line: 17, operation: 'Package',                            description: 'Securely and professionally package parts for shipment',                                                                         required_operation: '', operator: '', opDate: '', completed: false },
  { line: 18, operation: 'Final Acceptance',                   description: 'Supervisor acceptance of packaging quality and documentation',                                                                   required_operation: '', operator: '', opDate: '', completed: false },
  { line: 19, operation: 'Product Release',                    description: 'Release of product by HAMF and acceptance by customer',                                                                          required_operation: '', operator: '', opDate: '', completed: false },
];

interface AutoFillSources {
  woNumber: string;
  woDate: string;
  customerName: string;
  customerPo: string;
}

function makeDefaultAnodizingForm(index: number, part?: CustomPart, sources?: AutoFillSources): AnodizingJobForm {
  const now = new Date();
  const effectiveDateDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const specDrawing = part ? [part.drawing_part_no, part.drawing_revision].filter(Boolean).join(' / ') : '';
  return {
    procedureId: `QF-${String(index + 1).padStart(2, '0')}`,
    effectiveDate: effectiveDateDefault,
    revision: '0',
    sectionA: {
      hamfWoNumber: sources?.woNumber || '',
      productDescription: part?.job_description || '',
      partNumber: part?.drawing_part_no || '',
      specDrawingRevision: specDrawing,
      material1: '',
      material2: '',
      material3: '',
      quantity: String(part ? getPartQuantity(part) || '' : ''),
      customer: sources?.customerName || '',
      customerPo: sources?.customerPo || '',
      woDate: sources?.woDate || '',
      shipDate: '',
      anodizeType: '',
      thicknessSpec: '',
      anodizeClass: '',
      dyeColor: '',
      seal: '',
      maskThreads: '',
      tumbled: '',
      scotchBrite: '',
    },
    sectionB: DEFAULT_ANODIZING_SECTION_B(),
    generalNotes: '',
  };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Styling helpers
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const cellBorder = '1px solid #e2e8f4';

const headerCellSx = {
  fontWeight: 700, fontSize: 10, color: '#e2e8f4', bgcolor: '#e8f0fe',
  border: cellBorder, py: 0.5, px: 1, textTransform: 'uppercase' as const, letterSpacing: 0.3,
};

const bodyCellSx = {
  fontSize: 11, color: '#1F2937', border: cellBorder, py: 0.3, px: 1,
};

const miniInputSx = {
  '& .MuiInputBase-input': { fontSize: 11, py: '2px', px: '4px' },
  '& .MuiInput-underline:before': { borderBottom: 'none' },
  '& .MuiInput-underline:after': { borderBottom: '1px solid #e2e8f4' },
  '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: '1px solid #94a3b8' },
};

const sectionTitleSx = {
  fontWeight: 700, fontSize: 12, color: '#e2e8f4',
  bgcolor: '#dbeafe', border: cellBorder, py: 0.5, px: 1.5,
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Component
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
interface AnodizingTravelerProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

const AnodizingTraveler: React.FC<AnodizingTravelerProps> = ({ project, onUpdate, onBack, onNext }) => {
  const { showSuccess, showError } = useNotification();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());
  const [anodizingForms, setAnodizingForms] = useState<AnodizingJobForm[]>([]);
  const [savingJob, setSavingJob] = useState<number | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<number | null>(null);
  const { parts: customParts } = useConfiguratorParts(project) as { parts: CustomPart[] };

  /* â”€â”€ Data Loading â”€â”€ */
  const loadWorkOrder = useCallback(async () => {
    try {
      const res = await api.get(`/work-orders/project/${project.id}`);
      const raw = res.data?.data;
      const arr: any[] = Array.isArray(raw) ? raw : raw?.id ? [raw] : [];
      const wo = arr[0];
      if (!wo) { setLoading(false); return; }
      setWorkOrder(wo);

      // Build auto-fill sources from project and work order data
      const rawWoDate = wo.release_date || wo.created_at || '';
      const autoFill: AutoFillSources = {
        woNumber: wo.work_order_number || '',
        woDate: rawWoDate ? rawWoDate.substring(0, 10) : '', // YYYY-MM-DD
        customerName: (project as any).client?.client_name || (project as any).quote_info?.client_name || '',
        customerPo: (project as any).salesOrder?.customer_po_number || '',
      };

      const saved: AnodizingJobForm[] = wo.anodizing_forms || [];
      const count = Math.max(customParts.length, saved.length);
      const forms: AnodizingJobForm[] = [];
      for (let i = 0; i < count; i++) {
        const part = customParts[i];
        const base = makeDefaultAnodizingForm(i, part, autoFill);
        if (saved[i]) {
          const merged = { ...base };
          const sv = saved[i] as any;
          for (const key of Object.keys(sv)) {
            if (sv[key] !== undefined && sv[key] !== null && sv[key] !== '') {
              (merged as any)[key] = sv[key];
            }
          }
          // Ensure sectionA is properly merged â€” auto-fill values override saved blanks
          if (sv.sectionA && typeof sv.sectionA === 'object') {
            merged.sectionA = { ...base.sectionA, ...sv.sectionA };
          }
          // Always re-apply auto-fill sources so they stay current
          merged.sectionA.hamfWoNumber = autoFill.woNumber || merged.sectionA.hamfWoNumber;
          merged.sectionA.customer = autoFill.customerName || merged.sectionA.customer;
          merged.sectionA.customerPo = autoFill.customerPo || merged.sectionA.customerPo;
          merged.sectionA.woDate = autoFill.woDate || merged.sectionA.woDate;
          if (part) {
            merged.sectionA.productDescription = part.job_description || merged.sectionA.productDescription;
            const specDrawing = [part.drawing_part_no, part.drawing_revision].filter(Boolean).join(' / ');
            merged.sectionA.specDrawingRevision = specDrawing || merged.sectionA.specDrawingRevision;
          }
          // Migrate old 'material' field to material1
          if ((sv.sectionA as any)?.material && !sv.sectionA?.material1) {
            merged.sectionA.material1 = (sv.sectionA as any).material;
          }
          // Ensure sectionB has all 19 operations
          if (!Array.isArray(merged.sectionB) || merged.sectionB.length < 19) {
            merged.sectionB = base.sectionB;
          }
          forms.push(merged);
        } else {
          forms.push(base);
        }
      }
      setAnodizingForms(forms);
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => { loadWorkOrder(); }, [loadWorkOrder]);

  /* â”€â”€ Handlers â”€â”€ */
  const toggleJob = (idx: number) =>
    setExpandedJobs(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });

  const updateSectionA = (idx: number, field: keyof AnodizingSectionA, value: string) => {
    setAnodizingForms(prev => prev.map((f, i) =>
      i === idx ? { ...f, sectionA: { ...f.sectionA, [field]: value } } : f
    ));
  };

  const updateForm = (idx: number, field: keyof AnodizingJobForm, value: any) => {
    setAnodizingForms(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  };

  const updateSectionB = (jobIdx: number, rowIdx: number, field: keyof AnodizingOp, value: string | boolean) => {
    setAnodizingForms(prev => prev.map((f, i) =>
      i === jobIdx ? { ...f, sectionB: f.sectionB.map((op, ri) => ri === rowIdx ? { ...op, [field]: value } : op) } : f
    ));
  };

  const handleSaveJob = async (jobIdx: number) => {
    if (!workOrder) return;
    setSavingJob(jobIdx);
    try {
      await api.patch(`/work-orders/${workOrder.id}/production-forms`, { anodizing_forms: anodizingForms });
      showSuccess(`Anodizing Job #${jobIdx + 1} saved successfully`);
      onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving anodizing form');
    } finally { setSavingJob(null); }
  };

  const handleCopyJob = async (srcIdx: number) => {
    if (!workOrder) return;
    const source = anodizingForms[srcIdx];
    const newIdx = anodizingForms.length;
    const newForm: AnodizingJobForm = {
      ...JSON.parse(JSON.stringify(source)),
      procedureId: `QF-${String(newIdx + 1).padStart(2, '0')}`,
    };
    const updated = [...anodizingForms, newForm];
    setAnodizingForms(updated);
    setExpandedJobs(prev => new Set([...prev, newIdx]));
    try {
      await api.patch(`/work-orders/${workOrder.id}/production-forms`, { anodizing_forms: updated });
      showSuccess(`Anodizing Job #${newIdx + 1} added as copy of Job #${srcIdx + 1}`);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving copied job');
    }
  };

  const handleDeleteJob = async (delIdx: number) => {
    if (!workOrder) return;
    const updated = anodizingForms.filter((_, i) => i !== delIdx);
    setAnodizingForms(updated);
    setExpandedJobs(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < delIdx) next.add(i); else if (i > delIdx) next.add(i - 1); });
      return next;
    });
    try {
      await api.patch(`/work-orders/${workOrder.id}/production-forms`, { anodizing_forms: updated });
      showSuccess(`Anodizing Job #${delIdx + 1} deleted`);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error deleting job');
    }
  };

  const handleDownloadPdf = async (jobIdx: number) => {
    if (!workOrder) return;
    setDownloadingPdf(jobIdx);
    try {
      // Save before generating PDF
      await api.patch(`/work-orders/${workOrder.id}/production-forms`, { anodizing_forms: anodizingForms });
      const res = await api.post(`/work-orders/${workOrder.id}/job-pdf`, {
        jobIndex: jobIdx,
        formData: anodizingForms[jobIdx],
      }, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const disposition = res.headers['content-disposition'];
      const filenameMatch = disposition?.match(/filename="?(.+?)"?$/);
      link.href = url;
      link.download = filenameMatch?.[1] || `anodizing-traveler-job-${jobIdx + 1}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showSuccess(`Anodizing Job #${jobIdx + 1} PDF downloaded`);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error generating PDF');
    } finally { setDownloadingPdf(null); }
  };

  /* â”€â”€ Derived â”€â”€ */
  const numJobs = anodizingForms.length;
  const completedJobs = anodizingForms.filter(f => f.sectionB.every(op => op.completed)).length;
  const progress = numJobs > 0 ? (completedJobs / numJobs) * 100 : 0;

  /* â”€â”€ Yes/No toggle helper â”€â”€ */
  const YesNoToggle: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
      <Box onClick={() => onChange('Yes')} sx={{
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.3,
        px: 0.8, py: 0.2, borderRadius: '4px', fontSize: 10, fontWeight: 600,
        bgcolor: value === 'Yes' ? '#dcfce7' : 'transparent',
        color: value === 'Yes' ? '#166534' : '#94a3b8',
        border: `1px solid ${value === 'Yes' ? '#86efac' : '#e2e8f0'}`,
      }}>Yes</Box>
      <Box onClick={() => onChange('No')} sx={{
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.3,
        px: 0.8, py: 0.2, borderRadius: '4px', fontSize: 10, fontWeight: 600,
        bgcolor: value === 'No' ? '#fee2e2' : 'transparent',
        color: value === 'No' ? '#991b1b' : '#94a3b8',
        border: `1px solid ${value === 'No' ? '#fca5a5' : '#e2e8f0'}`,
      }}>No</Box>
    </Box>
  );

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     Render
     â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  return (
    <TabContainer>
      {/* â”€â”€ Page Header â”€â”€ */}
      <AnimatedSection>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: '14px',
            background: 'linear-gradient(135deg, #e2e8f4, #0099cc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(26,58,92,0.3)',
          }}>
            <Droplets size={26} color="#fff" />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 22, color: UI.textPrimary, letterSpacing: -0.3 }}>
              Work Order Traveler â€“ Anodizing
            </Typography>
            <Typography sx={{ fontSize: 13, color: UI.textMuted }}>
              Manage anodizing work order travellers and surface treatment operations
            </Typography>
          </Box>
          {workOrder && (
            <Stack direction="row" spacing={1} alignItems="center">
              <StatusBadge status={completedJobs === numJobs && numJobs > 0 ? 'completed' : 'in-progress'} />
              <Chip
                label={`${completedJobs} / ${numJobs} Jobs`}
                sx={{
                  height: 32, fontWeight: 600, fontSize: 13, bgcolor: '#dbeafe', color: '#e2e8f4',
                  border: '1px solid #93c5fd', borderRadius: UI.radiusXs,
                }}
              />
            </Stack>
          )}
        </Box>

        {workOrder && numJobs > 0 && (
          <ProgressBar value={progress} label={`${Math.round(progress)}% complete`} />
        )}
      </AnimatedSection>

      {/* â”€â”€ No Work Order Alert â”€â”€ */}
      {!loading && !workOrder && (
        <Alert severity="info" sx={{
          mb: 3, borderRadius: UI.radiusSm, border: '1px solid #bfdbfe',
          bgcolor: 'rgba(0, 200, 255, 0.06)', '& .MuiAlert-icon': { color: '#3b82f6' },
        }}>
          No work order found for this project. Please create one in the Work Order tab first.
        </Alert>
      )}

      {workOrder && (
        <>
          {numJobs === 0 && (
            <Card sx={{
              borderRadius: UI.radius, border: `1px solid ${UI.border}`, boxShadow: UI.shadow,
              textAlign: 'center', py: 6,
            }}>
              <CardContent>
                <Droplets size={48} color={UI.border} style={{ marginBottom: 8 }} />
                <Typography sx={{ fontSize: 15, color: UI.textMuted, fontWeight: 500 }}>
                  No jobs found. Ensure the estimate has custom parts added.
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* â”€â”€ Job Cards â”€â”€ */}
          <StaggerList>
            {anodizingForms.map((form, idx) => {
              const part = customParts[idx];
              const isExpanded = expandedJobs.has(idx);
              const isCopied = idx >= customParts.length;
              const sa = form.sectionA;
              return (
                <StaggerItem key={idx}>
                <Card sx={{
                  borderRadius: UI.radius,
                  border: `1px solid ${isExpanded ? 'rgba(0, 200, 255, 0.25)' : UI.border}`,
                  boxShadow: isExpanded ? UI.shadowMd : UI.shadow,
                  overflow: 'hidden', transition: 'all 0.25s ease',
                  '&:hover': { boxShadow: UI.shadowMd, borderColor: 'rgba(0, 200, 255, 0.25)' },
                }}>
                  {/* â”€â”€ Job Header â”€â”€ */}
                  <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 2.5, py: 2,
                    background: isExpanded ? 'rgba(0, 200, 255, 0.06)' : UI.bgCard,
                    borderBottom: isExpanded ? `1px solid ${UI.border}` : 'none',
                    cursor: 'pointer', transition: 'background 0.2s',
                  }} onClick={() => toggleJob(idx)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        width: 36, height: 36, borderRadius: UI.radiusXs,
                        background: isCopied ? 'rgba(0, 200, 255, 0.12)' : 'linear-gradient(135deg, #e2e8f4, #0099cc)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Droplets size={18} color={isCopied ? '#e2e8f4' : '#fff'} />
                      </Box>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: 14, color: UI.textPrimary }}>
                            #{String(idx + 1).padStart(2, '0')}&nbsp;
                            {part?.job_description || part?.drawing_part_no || `Anodizing Job #${idx + 1}`}
                          </Typography>
                          {isCopied && (
                            <Chip label="Copy" size="small" sx={{
                              height: 20, fontSize: 10, fontWeight: 600,
                              bgcolor: 'rgba(0, 200, 255, 0.10)', color: '#e2e8f4', borderRadius: '6px',
                            }} />
                          )}
                        </Box>
                        <Typography sx={{ fontSize: 12, color: UI.textMuted }}>
                          {sa.material1 ? `Material: ${sa.material1}` : ''}
                          {sa.anodizeType ? ` Â· Type: ${sa.anodizeType}` : ''}
                          {form.procedureId ? ` Â· ${form.procedureId}` : ''}
                        </Typography>
                      </Box>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center" onClick={e => e.stopPropagation()}>
                      <Tooltip title="Copy Job" arrow>
                        <IconButton size="small" onClick={() => handleCopyJob(idx)}
                          sx={{ color: UI.textMuted, '&:hover': { color: '#e2e8f4', bgcolor: '#dbeafe' } }}>
                          <Copy size={16} />
                        </IconButton>
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
                        size="small" onClick={() => toggleJob(idx)}
                        sx={{
                          color: isExpanded ? '#fff' : UI.textMuted,
                          background: isExpanded ? 'linear-gradient(135deg, #e2e8f4, #0099cc)' : 'transparent',
                          border: isExpanded ? 'none' : `1px solid ${UI.border}`,
                          borderRadius: UI.radiusXs, width: 32, height: 32,
                          '&:hover': isExpanded
                            ? { boxShadow: UI.shadowMd }
                            : { borderColor: '#e2e8f4', color: '#e2e8f4', bgcolor: '#dbeafe' },
                        }}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </IconButton>
                    </Stack>
                  </Box>

                  {/* â”€â”€ Expanded Form (Document-style layout) â”€â”€ */}
                  <Collapse in={isExpanded} unmountOnExit>
                    <Box sx={{ p: 3, bgcolor: '#f8fafc' }}>

                      {/* â•â•â• Document Header â•â•â• */}
                      <Box sx={{ border: cellBorder, borderRadius: '4px', mb: 2, overflow: 'hidden' }}>
                        <Table size="small" sx={{ tableLayout: 'fixed' }}>
                          <TableBody>
                            <TableRow>
                              <TableCell rowSpan={2} sx={{ ...bodyCellSx, width: '30%', textAlign: 'center', bgcolor: '#f0f7ff' }}>
                                <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#e2e8f4' }}>
                                  Work Order
                                </Typography>
                                <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#e2e8f4' }}>
                                  Traveler
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ ...headerCellSx, width: '20%' }}>Effective Date</TableCell>
                              <TableCell sx={{ ...headerCellSx, width: '20%' }}>Procedure ID</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" type="month"
                                  value={form.effectiveDate}
                                  onChange={e => updateForm(idx, 'effectiveDate', e.target.value)}
                                  sx={miniInputSx}
                                />
                              </TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small"
                                  value={form.procedureId}
                                  onChange={e => updateForm(idx, 'procedureId', e.target.value)}
                                  sx={miniInputSx}
                                />
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ ...bodyCellSx, textAlign: 'center', bgcolor: '#dbeafe' }}>
                                <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#e2e8f4' }}>
                                  Anodizing
                                </Typography>
                              </TableCell>
                              <TableCell sx={headerCellSx}>Page</TableCell>
                              <TableCell sx={headerCellSx}>Revision</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={bodyCellSx} />
                              <TableCell sx={{ ...bodyCellSx, fontSize: 11 }}>1 of 1</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small"
                                  value={form.revision}
                                  onChange={e => updateForm(idx, 'revision', e.target.value)}
                                  sx={miniInputSx}
                                />
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </Box>

                      {/* â•â•â• Section A: WO Information â•â•â• */}
                      <Box sx={{ border: cellBorder, borderRadius: '4px', mb: 2, overflow: 'hidden' }}>
                        <Box sx={sectionTitleSx}>Section A: WO Information</Box>
                        <Table size="small" sx={{ tableLayout: 'fixed' }}>
                          <TableBody>
                            {/* Row 1: WO#, Product Description / Part Number, Spec / Drawing # Revision */}
                            <TableRow>
                              <TableCell sx={{ ...headerCellSx, width: '15%' }}>HAMF WO #</TableCell>
                              <TableCell sx={{ ...bodyCellSx, width: '20%' }}>
                                <TextField fullWidth variant="standard" size="small" value={sa.hamfWoNumber}
                                  InputProps={{ readOnly: true }} sx={{ ...miniInputSx, '& .MuiInputBase-input': { ...miniInputSx['& .MuiInputBase-input'], bgcolor: '#f0f7ff' } }} />
                              </TableCell>
                              <TableCell sx={{ ...headerCellSx, width: '18%' }}>Product Description / Part Number</TableCell>
                              <TableCell sx={{ ...bodyCellSx, width: '15%' }}>
                                <TextField fullWidth variant="standard" size="small" value={sa.productDescription}
                                  InputProps={{ readOnly: true }} sx={{ ...miniInputSx, '& .MuiInputBase-input': { ...miniInputSx['& .MuiInputBase-input'], bgcolor: '#f0f7ff' } }} />
                              </TableCell>
                              <TableCell sx={{ ...headerCellSx, width: '17%' }}>Spec. / Drawing # Revision</TableCell>
                              <TableCell sx={{ ...bodyCellSx, width: '15%' }}>
                                <TextField fullWidth variant="standard" size="small" value={sa.specDrawingRevision}
                                  InputProps={{ readOnly: true }} sx={{ ...miniInputSx, '& .MuiInputBase-input': { ...miniInputSx['& .MuiInputBase-input'], bgcolor: '#f0f7ff' } }} />
                              </TableCell>
                            </TableRow>
                            {/* Row 2: Material 1, Material 2, Quantity */}
                            <TableRow>
                              <TableCell sx={headerCellSx}>Material 1</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.material1}
                                  onChange={e => updateSectionA(idx, 'material1', e.target.value)} sx={miniInputSx} />
                              </TableCell>
                              <TableCell sx={headerCellSx}>Material 2</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.material2}
                                  onChange={e => updateSectionA(idx, 'material2', e.target.value)} sx={miniInputSx} />
                              </TableCell>
                              <TableCell sx={headerCellSx}>Quantity</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.quantity}
                                  onChange={e => updateSectionA(idx, 'quantity', e.target.value)} sx={miniInputSx} />
                              </TableCell>
                            </TableRow>
                            {/* Row 3: Material 3, Customer, Customer PO */}
                            <TableRow>
                              <TableCell sx={headerCellSx}>Material 3</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.material3}
                                  onChange={e => updateSectionA(idx, 'material3', e.target.value)} sx={miniInputSx} />
                              </TableCell>
                              <TableCell sx={headerCellSx}>Customer</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.customer}
                                  InputProps={{ readOnly: true }} sx={{ ...miniInputSx, '& .MuiInputBase-input': { ...miniInputSx['& .MuiInputBase-input'], bgcolor: '#f0f7ff' } }} />
                              </TableCell>
                              <TableCell sx={headerCellSx}>Customer PO #</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.customerPo}
                                  InputProps={{ readOnly: true }} sx={{ ...miniInputSx, '& .MuiInputBase-input': { ...miniInputSx['& .MuiInputBase-input'], bgcolor: '#f0f7ff' } }} />
                              </TableCell>
                            </TableRow>
                            {/* Row 4: WO Date + Ship Date */}
                            <TableRow>
                              <TableCell sx={headerCellSx} colSpan={2} />
                              <TableCell sx={headerCellSx}>Ship Date</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" type="date" value={sa.shipDate}
                                  onChange={e => updateSectionA(idx, 'shipDate', e.target.value)} sx={miniInputSx}
                                  InputLabelProps={{ shrink: true }} />
                              </TableCell>
                              <TableCell sx={headerCellSx}>HAMF WO # Date</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.woDate}
                                  InputProps={{ readOnly: true }} sx={{ ...miniInputSx, '& .MuiInputBase-input': { ...miniInputSx['& .MuiInputBase-input'], bgcolor: '#f0f7ff' } }} />
                              </TableCell>
                            </TableRow>
                            {/* Row 5: Type, Thickness, Class, Dye Color, Seal, Mask, Tumbled, Scotch */}
                            <TableRow>
                              <TableCell sx={headerCellSx}>Type</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.anodizeType}
                                  onChange={e => updateSectionA(idx, 'anodizeType', e.target.value)} sx={miniInputSx}
                                  placeholder="e.g. 2, 3" />
                              </TableCell>
                              <TableCell sx={headerCellSx}>Thickness Spec</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.thicknessSpec}
                                  onChange={e => updateSectionA(idx, 'thicknessSpec', e.target.value)} sx={miniInputSx}
                                  placeholder="e.g. HAMF Spec" />
                              </TableCell>
                              <TableCell sx={headerCellSx}>Class</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.anodizeClass}
                                  onChange={e => updateSectionA(idx, 'anodizeClass', e.target.value)} sx={miniInputSx}
                                  placeholder="e.g. 1, 2" />
                              </TableCell>
                            </TableRow>
                            {/* Row 6: Dye Color, Seal, Mask Threads, Tumbled, Scotch Brite */}
                            <TableRow>
                              <TableCell sx={headerCellSx}>Dye Color</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField fullWidth variant="standard" size="small" value={sa.dyeColor}
                                  onChange={e => updateSectionA(idx, 'dyeColor', e.target.value)} sx={miniInputSx} />
                              </TableCell>
                              <TableCell sx={headerCellSx}>Seal</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <YesNoToggle value={sa.seal} onChange={v => updateSectionA(idx, 'seal', v)} />
                              </TableCell>
                              <TableCell sx={headerCellSx}>Mask Threads</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <YesNoToggle value={sa.maskThreads} onChange={v => updateSectionA(idx, 'maskThreads', v)} />
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={headerCellSx} colSpan={2} />
                              <TableCell sx={headerCellSx}>Tumbled</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <YesNoToggle value={sa.tumbled} onChange={v => updateSectionA(idx, 'tumbled', v)} />
                              </TableCell>
                              <TableCell sx={headerCellSx}>Scotch Brite</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <YesNoToggle value={sa.scotchBrite} onChange={v => updateSectionA(idx, 'scotchBrite', v)} />
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </Box>

                      {/* â•â•â• Section B: Traveler (19 Operations) â•â•â• */}
                      <Box sx={{ border: cellBorder, borderRadius: '4px', mb: 2, overflow: 'hidden' }}>
                        <Box sx={sectionTitleSx}>Section B: Traveler</Box>
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ ...headerCellSx, width: 40 }}>Line</TableCell>
                                <TableCell sx={{ ...headerCellSx, width: '18%' }}>Operation</TableCell>
                                <TableCell sx={headerCellSx}>Description</TableCell>
                                <TableCell sx={{ ...headerCellSx, width: 70 }}>Required</TableCell>
                                <TableCell sx={{ ...headerCellSx, width: 90 }}>Operator</TableCell>
                                <TableCell sx={{ ...headerCellSx, width: 110 }}>Date (D/M/Y)</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {form.sectionB.map((op, ri) => (
                                <TableRow key={ri} sx={{
                                  '&:hover': { bgcolor: '#f0f7ff' },
                                  bgcolor: op.completed ? '#f0fdf4' : 'transparent',
                                }}>
                                  <TableCell sx={{ ...bodyCellSx, fontWeight: 600, textAlign: 'center', color: '#6B7280' }}>
                                    {op.line}
                                  </TableCell>
                                  <TableCell sx={bodyCellSx}>
                                    <TextField fullWidth variant="standard" size="small"
                                      value={op.operation}
                                      onChange={e => updateSectionB(idx, ri, 'operation', e.target.value)}
                                      sx={miniInputSx}
                                    />
                                  </TableCell>
                                  <TableCell sx={bodyCellSx}>
                                    <TextField fullWidth variant="standard" size="small"
                                      value={op.description}
                                      onChange={e => updateSectionB(idx, ri, 'description', e.target.value)}
                                      sx={miniInputSx} multiline
                                    />
                                  </TableCell>
                                  <TableCell sx={bodyCellSx}>
                                    <Select fullWidth variant="standard" size="small" value={op.required_operation}
                                      onChange={e => updateSectionB(idx, ri, 'required_operation', e.target.value as string)}
                                      displayEmpty
                                      renderValue={(v) => (v as string) || 'Select'}
                                      sx={{ fontSize: 11, color: op.required_operation ? 'inherit' : '#999' }}
                                    >
                                      {REQUIRED_OP_OPTIONS.filter(o => o !== '').map(o => <MenuItem key={o} value={o} sx={{ fontSize: 11 }}>{o}</MenuItem>)}
                                    </Select>
                                  </TableCell>
                                  <TableCell sx={bodyCellSx}>
                                    <TextField fullWidth variant="standard" size="small"
                                      value={op.operator}
                                      onChange={e => updateSectionB(idx, ri, 'operator', e.target.value)}
                                      sx={miniInputSx}
                                    />
                                  </TableCell>
                                  <TableCell sx={bodyCellSx}>
                                    <TextField fullWidth variant="standard" size="small" type="date"
                                      value={op.opDate}
                                      onChange={e => updateSectionB(idx, ri, 'opDate', e.target.value)}
                                      sx={miniInputSx}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>

                      {/* â•â•â• Section C: General Notes â•â•â• */}
                      <Box sx={{ border: cellBorder, borderRadius: '4px', mb: 3, overflow: 'hidden' }}>
                        <Box sx={sectionTitleSx}>Section C: General Notes</Box>
                        <Box sx={{ p: 1.5 }}>
                          <TextField fullWidth multiline rows={3} size="small"
                            value={form.generalNotes}
                            onChange={e => updateForm(idx, 'generalNotes', e.target.value)}
                            placeholder="Enter general notes for this anodizing job..."
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                borderRadius: '4px', fontSize: 12, bgcolor: 'var(--bg-input)',
                                '& fieldset': { borderColor: 'var(--border)' },
                                '&:hover fieldset': { borderColor: 'var(--border-strong)' },
                                '&.Mui-focused fieldset': { borderColor: 'var(--border-strong)' },
                              },
                            }}
                          />
                        </Box>
                      </Box>

                      {/* Action Buttons */}
                      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
                        <Button variant="outlined" size="small"
                          startIcon={<FileDown size={14} />}
                          onClick={() => handleDownloadPdf(idx)}
                          disabled={downloadingPdf === idx}
                          sx={{
                            textTransform: 'none', fontWeight: 600, fontSize: 13,
                            borderRadius: UI.radiusXs, px: 3,
                            borderColor: '#e2e8f4', color: '#e2e8f4',
                            '&:hover': { borderColor: '#0099cc', bgcolor: 'rgba(0, 200, 255, 0.06)' },
                          }}
                        >
                          {downloadingPdf === idx ? 'Generating...' : 'Download PDF'}
                        </Button>
                        <Button variant="contained" size="small"
                          startIcon={<Save size={14} />}
                          onClick={() => handleSaveJob(idx)}
                          disabled={savingJob === idx}
                          sx={{
                            background: 'linear-gradient(135deg, #e2e8f4, #0099cc)',
                            textTransform: 'none', fontWeight: 600, fontSize: 13,
                            borderRadius: UI.radiusXs, px: 3,
                            '&:hover': { boxShadow: '0 4px 12px rgba(26,58,92,0.3)' },
                          }}
                        >
                          {savingJob === idx ? 'Saving...' : 'Save Job'}
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

      {/* â”€â”€ Bottom Navigation â”€â”€ */}
      <EnhancedNavFooter
        onBack={onBack}
        onNext={onNext}
        backLabel="Back to Work Order"
        nextLabel="Next: Quality"
      />
    </TabContainer>
  );
};

export default AnodizingTraveler;


