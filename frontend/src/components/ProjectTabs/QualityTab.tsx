import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Collapse,
  CircularProgress,
  Tooltip,
  IconButton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import Stack from '@mui/material/Stack';
import {
  ShieldCheck, Pencil, FileDown, Upload, CheckCircle2,
  ChevronUp, ChevronDown, ClipboardCheck, MessageSquare, X,
  Eye, Plus, Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Project, QualityRecord, CustomPart } from '../../types';
import api, { getBackendBaseUrl } from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useConfiguratorParts } from '../../hooks/useConfiguratorParts';
import { viewFileByPath, buildProjectFileName } from '../../utils/documentUtils';
import {
  UI, TabContainer, AccordionSection, StatusBadge, InfoBanner,
  EnhancedNavFooter, AnimatedSection, MotionBox, StaggerList, StaggerItem,
  Separator, inputSx,
} from '../UIComponents';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ChecklistItem {
  name: string;
  description: string;
  included: boolean;
  notes: string;
  documentPath?: string;
  documentName?: string;
}

interface JobQualityForm {
  jobIndex: number;
  checklist: ChecklistItem[];
  inspectorNotes: string;
  isFinalized: boolean;
  completeDate?: string;
}

interface QualityTabProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

// â”€â”€ Default checklist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DEFAULT_CHECKLIST: Omit<ChecklistItem, 'included' | 'notes'>[] = [
  { name: 'Dimensional Accuracy',  description: 'Verify all dimensions per drawing specifications' },
  { name: 'Surface Finish',        description: 'Check surface roughness requirements' },
  { name: 'Material Certificate',  description: 'Verify material test certificate matches specs' },
  { name: 'Heat Treatment',        description: 'Verify heat treatment certificate if applicable' },
  { name: 'Visual Inspection',     description: 'Check for cracks, porosity, surface defects' },
  { name: 'Thread Gauging',        description: 'Verify thread specifications if applicable' },
  { name: 'Hardness Test',         description: 'Verify hardness requirements if specified' },
  { name: 'NDT/NDE',               description: 'Non-destructive testing if required' },
];

function makeDefaultChecklist(): ChecklistItem[] {
  return DEFAULT_CHECKLIST.map(item => ({ ...item, included: false, notes: '' }));
}

// â”€â”€ Style constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const tblHeadSx = {
  fontWeight: 600, fontSize: 11, color: UI.textSecondary, textTransform: 'uppercase' as const,
  letterSpacing: 0.6, borderBottom: `2px solid ${UI.border}`, py: 1.5,
} as const;
const tblCellSx = { fontSize: 13, color: UI.text, py: 1.2 } as const;

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const QualityTab: React.FC<QualityTabProps> = ({ project, onUpdate, onBack, onNext }) => {
  const { showError, showSuccess } = useNotification();
  const { parts: customParts } = useConfiguratorParts(project) as { parts: CustomPart[] };

  const [jobForms, setJobForms]       = useState<JobQualityForm[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [loading, setLoading]         = useState(true);
  const [savingIdx, setSavingIdx]     = useState<number | null>(null);
  const [pdfIdx, setPdfIdx]           = useState<number | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // â”€â”€ Load quality record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [qualRes, woRes, settingsRes, sysRes] = await Promise.allSettled([
          api.get(`/quality/project/${project.id}`),
          api.get(`/work-orders/project/${project.id}`),
          api.get('/settings/company'),
          api.get('/settings/system'),
        ]);

        const companyName: string =
          settingsRes.status === 'fulfilled'
            ? (settingsRes.value.data?.data?.name || 'our company')
            : 'our company';
        const sysSettings = sysRes.status === 'fulfilled' ? (sysRes.value.data?.data || {}) : {};

        const defaultNotes = sysSettings.qualityNotes || (
          `This report is to certify that the above parts have been:\n` +
          `  \u2022  Manufactured in accordance with all in-house policies and procedures of ${companyName}.\n` +
          `  \u2022  Inspected in accordance with ${companyName}'s Inspection and Test procedure.\n\n` +
          `The following indicated procedures have been performed on the above-mentioned parts.`
        );

        const record: QualityRecord | null =
          qualRes.status === 'fulfilled' ? (qualRes.value.data?.data ?? null) : null;
        const saved: JobQualityForm[] =
          (record?.job_quality_forms as JobQualityForm[] | undefined) ?? [];

        const woRaw = woRes.status === 'fulfilled'
          ? (woRes.value.data?.data ?? woRes.value.data)
          : null;
        const woObj = Array.isArray(woRaw) ? woRaw[0] : woRaw;
        const productionForms: any[] = woObj?.production_forms ?? [];
        const totalJobs = Math.max(customParts.length, productionForms.length, saved.length, 1);

        const forms: JobQualityForm[] = Array.from({ length: totalJobs }, (_, i) => {
          const existing = saved.find(f => f.jobIndex === i);
          return existing ?? {
            jobIndex: i,
            checklist: makeDefaultChecklist(),
            inspectorNotes: defaultNotes,
            isFinalized: false,
          };
        });
        setJobForms(forms);
        if (forms.length > 0) setExpandedIdx(0);
      } catch {
        let fallbackNotes =
          `This report is to certify that the above parts have been:\n` +
          `  \u2022  Manufactured in accordance with all in-house policies and procedures.\n` +
          `  \u2022  Inspected in accordance with our Inspection and Test procedure.\n\n` +
          `The following indicated procedures have been performed on the above-mentioned parts.`;
        try {
          const s = await api.get('/settings/system');
          if (s.data?.data?.qualityNotes) fallbackNotes = s.data.data.qualityNotes;
        } catch {}
        setJobForms(customParts.map((_, i) => ({
          jobIndex: i,
          checklist: makeDefaultChecklist(),
          inspectorNotes: fallbackNotes,
          isFinalized: false,
        })));
      } finally {
        setLoading(false);
        setExpandedIdx(0);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const updateForm = (jobIndex: number, updater: (f: JobQualityForm) => JobQualityForm) => {
    setJobForms(prev => prev.map(f => f.jobIndex === jobIndex ? updater(f) : f));
  };

  const setChecklistItem = (jobIndex: number, itemIndex: number, patch: Partial<ChecklistItem>) => {
    updateForm(jobIndex, f => ({
      ...f,
      checklist: f.checklist.map((ci, idx) => idx === itemIndex ? { ...ci, ...patch } : ci),
    }));
  };

  const handleSaveDraft = async (jobIndex: number) => {
    setSavingIdx(jobIndex);
    try {
      await api.patch(`/quality/project/${project.id}/job-forms`, { jobForms });
      showSuccess(`Job #${jobIndex + 1} draft saved`);
    } catch (err: any) {
      showError(err.response?.data?.message ?? 'Error saving draft');
    } finally {
      setSavingIdx(null);
    }
  };

  const handleComplete = async (jobIndex: number) => {
    setSavingIdx(jobIndex);
    try {
      await api.patch(`/quality/project/${project.id}/job-forms`, { jobForms });
      await api.post(`/quality/project/${project.id}/job/${jobIndex}/complete`);
      updateForm(jobIndex, f => ({ ...f, isFinalized: true, completeDate: new Date().toISOString() }));
      showSuccess(`Job #${jobIndex + 1} inspection completed`);
      onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message ?? 'Error completing inspection');
    } finally {
      setSavingIdx(null);
    }
  };

  const handleDownloadCoC = async (jobIndex: number) => {
    setPdfIdx(jobIndex);
    try {
      await api.patch(`/quality/project/${project.id}/job-forms`, { jobForms });
      const res = await api.post(
        `/quality/project/${project.id}/job/${jobIndex}/coc`,
        {},
        { responseType: 'blob' }
      );
      const disposition = res.headers?.['content-disposition'] || '';
      const fnMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fnMatch?.[1]?.trim() || `CoC-Job${jobIndex + 1}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showSuccess('Certificate of Conformance downloaded');
    } catch (err: any) {
      showError(err.response?.data?.message ?? 'Error generating certificate');
    } finally {
      setPdfIdx(null);
    }
  };

  const handleUploadDoc = async (jobIndex: number, itemIndex: number, file: File) => {
    const key = `${jobIndex}-${itemIndex}`;
    setUploadingKey(key);
    try {
      const renamedFile = buildProjectFileName(project.project_number, file, 'quality');
      const formData = new FormData();
      formData.append('file', renamedFile);
      const res = await api.post(
        `/quality/project/${project.id}/job/${jobIndex}/upload-doc/${itemIndex}`,
        formData
      );
      const saved: JobQualityForm[] = (res.data?.data?.job_quality_forms as JobQualityForm[] | undefined) ?? [];
      const server = saved.find(f => f.jobIndex === jobIndex);
      if (server) {
        // For multi-file: backend returns single path, we accumulate locally
        updateForm(jobIndex, f => {
          const cl = [...f.checklist];
          const existing = cl[itemIndex];
          const prevNames = (existing.documentName || '').split(',').map(n => n.trim()).filter(Boolean);
          const prevPaths = (existing.documentPath || '').split(',').map(p => p.trim()).filter(Boolean);
          const newItem = server.checklist[itemIndex];
          const newName = newItem?.documentName || file.name;
          const newPath = newItem?.documentPath || file.name;
          if (!prevNames.includes(newName)) prevNames.push(newName);
          if (!prevPaths.includes(newPath)) prevPaths.push(newPath);
          cl[itemIndex] = { ...existing, documentName: prevNames.join(','), documentPath: prevPaths.join(',') };
          return { ...f, checklist: cl };
        });
      } else {
        // Local fallback: append to existing names/paths
        updateForm(jobIndex, f => {
          const cl = [...f.checklist];
          const existing = cl[itemIndex];
          const prevNames = (existing.documentName || '').split(',').map(n => n.trim()).filter(Boolean);
          const prevPaths = (existing.documentPath || '').split(',').map(p => p.trim()).filter(Boolean);
          if (!prevNames.includes(file.name)) prevNames.push(file.name);
          if (!prevPaths.includes(file.name)) prevPaths.push(file.name);
          cl[itemIndex] = { ...existing, documentName: prevNames.join(','), documentPath: prevPaths.join(',') };
          return { ...f, checklist: cl };
        });
      }
      showSuccess('Document uploaded');
    } catch (err: any) {
      showError(err.response?.data?.message ?? 'Error uploading document');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleDeleteDoc = async (jobIndex: number, itemIndex: number, docIdx: number) => {
    const form = jobForms.find(f => f.jobIndex === jobIndex);
    if (!form) return;
    const existing = form.checklist[itemIndex];
    const paths = (existing?.documentPath || '').split(',').map(p => p.trim()).filter(Boolean);
    const filePath = paths[docIdx];

    // Delete from backend (find Document by path, then delete)
    if (filePath) {
      try {
        const docsRes = await api.get(`/documents/project/${project.id}`);
        const docs = docsRes.data?.data || docsRes.data || [];
        const match = docs.find((d: any) =>
          d.file_path && (d.file_path === filePath || filePath.includes(d.file_path) || d.file_path.includes(filePath.split('/uploads/').pop() || ''))
        );
        if (match) {
          await api.delete(`/documents/${match.id}`);
        }
      } catch { /* best effort */ }
    }

    updateForm(jobIndex, f => {
      const cl = [...f.checklist];
      const item = cl[itemIndex];
      const names = (item.documentName || '').split(',').map(n => n.trim()).filter(Boolean);
      const pths = (item.documentPath || '').split(',').map(p => p.trim()).filter(Boolean);
      names.splice(docIdx, 1);
      pths.splice(docIdx, 1);
      cl[itemIndex] = { ...item, documentName: names.join(','), documentPath: pths.join(',') };
      return { ...f, checklist: cl };
    });
    showSuccess('Document deleted');
  };

  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const handleEnableEdit = (jobIndex: number) => {
    setEditingIdx(jobIndex);
    updateForm(jobIndex, f => ({ ...f, isFinalized: false }));
    setExpandedIdx(jobIndex);
  };

  const handleCancelEdit = (jobIndex: number) => {
    setEditingIdx(null);
    updateForm(jobIndex, f => ({ ...f, isFinalized: true }));
  };

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress sx={{ color: UI.primary }} />
      </Box>
    );
  }

  const completedCount = jobForms.filter(f => f.isFinalized).length;

  if (jobForms.length === 0) {
    return (
      <TabContainer>
        <AnimatedSection>
          <AccordionSection icon={<ShieldCheck size={20} />} title="Quality / Inspection Check List" accentColor="#0891B2">
            <InfoBanner variant="info" message="No jobs found. Please add parts in the Estimation tab first." />
          </AccordionSection>
        </AnimatedSection>
        <EnhancedNavFooter backLabel="Back to Production" nextLabel="Next: Logistics" onBack={onBack} onNext={onNext} />
      </TabContainer>
    );
  }

  return (
    <TabContainer>
      {/* â”€â”€ Header section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <AnimatedSection>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          mb: 2,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{
              width: 48, height: 48, borderRadius: '12px',
              backgroundColor: 'rgba(0,200,255,0.10)',
              border: '1px solid rgba(0,200,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldCheck size={22} color="#00c8ff" />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Quality / Inspection
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: '#6B7280' }}>
                Complete inspection checklists for each job
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <StatusBadge status={completedCount === jobForms.length ? 'inspected' : 'pending'} />
            <Chip
              label={`${completedCount} / ${jobForms.length} Complete`}
              size="small"
              sx={{ fontWeight: 600, fontSize: 12, bgcolor: alpha(UI.primary, 0.08), color: UI.primary }}
            />
          </Box>
        </Box>
      </AnimatedSection>

      {/* â”€â”€ Per-job cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <StaggerList>
        {jobForms.map((form, i) => {
          const part   = customParts[i];
          const isOpen = expandedIdx === i;
          if (!form) return null;
          const totalIncluded = form.checklist.filter(c => c.included).length;

          return (
            <StaggerItem key={i}>
              <MotionBox
                sx={{ mb: 1.5 }}
                layout
                transition={{ layout: { duration: 0.25 } }}
              >
                {/* â”€â”€ Job row header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <Box
                  onClick={() => setExpandedIdx(isOpen ? null : i)}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    border: `1px solid ${UI.border}`,
                    borderRadius: isOpen ? `${UI.radius} ${UI.radius} 0 0` : UI.radius,
                    px: 2.5, py: 1.5, cursor: 'pointer',
                    bgcolor: isOpen ? alpha(UI.primary, 0.04) : UI.card,
                    transition: 'all 0.2s',
                    '&:hover': { bgcolor: alpha(UI.primary, 0.06) },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{
                      width: 32, height: 32, borderRadius: '8px',
                      background: form.isFinalized ? alpha(UI.primary, 0.1) : alpha('#F59E0B', 0.1),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {form.isFinalized
                        ? <CheckCircle2 size={16} color={UI.primary} />
                        : <ClipboardCheck size={16} color="#F59E0B" />}
                    </Box>
                    <Typography fontWeight={700} fontSize={14} color={UI.text}>
                      #{String(i + 1).padStart(2, '0')}&nbsp;
                      {part?.job_description || `Job #${i + 1}`}
                      {part?.material ? ` â€” ${part.material}` : ''}
                      {part?.drawing_part_no ? ` â€” ${part.drawing_part_no}` : ''}
                    </Typography>
                    <StatusBadge status={form.isFinalized ? 'inspected' : 'pending'} />
                  </Box>
                  <Stack direction="row" spacing={1} onClick={e => e.stopPropagation()}>
                    <IconButton
                      size="small"
                      onClick={() => setExpandedIdx(isOpen ? null : i)}
                      sx={{
                        border: `1px solid ${UI.border}`, borderRadius: '8px', width: 32, height: 32,
                        color: isOpen ? '#fff' : UI.textSecondary,
                        bgcolor: isOpen ? UI.primary : 'transparent',
                        '&:hover': { bgcolor: isOpen ? UI.primary : alpha(UI.primary, 0.06) },
                      }}
                    >
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </IconButton>
                    {form.isFinalized && (
                      <Tooltip title="Edit inspection checklist">
                        <Button
                          size="small" variant="outlined"
                          startIcon={<Pencil size={14} />}
                          onClick={() => handleEnableEdit(i)}
                          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: 12, borderColor: UI.border, color: UI.textSecondary, '&:hover': { borderColor: UI.primary, color: UI.primary, bgcolor: alpha(UI.primary, 0.04) } }}
                        >
                          Edit
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip title="Download Certificate of Conformance">
                      <span>
                        <Button
                          size="small" variant="outlined"
                          startIcon={pdfIdx === i ? <CircularProgress size={14} /> : <FileDown size={14} />}
                          disabled={pdfIdx === i}
                          onClick={() => handleDownloadCoC(i)}
                          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: 12, borderColor: UI.border, color: UI.textSecondary, '&:hover': { borderColor: UI.primary, color: UI.primary, bgcolor: alpha(UI.primary, 0.04) } }}
                        >
                          Download COC PDF
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>
                </Box>

                {/* â”€â”€ Expandable inspection form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.25 }}
                      style={{ overflow: 'visible' }}
                    >
                      <Paper variant="outlined" sx={{
                        p: 3, borderTop: 'none', borderRadius: `0 0 ${UI.radius} ${UI.radius}`,
                        border: `1px solid ${UI.border}`, borderTopColor: 'transparent',
                      }}>
                        {/* Checklist table */}
                        <TableContainer component={Paper} variant="outlined" sx={{
                          mb: 2, borderRadius: UI.radius, border: `1px solid ${UI.border}`, overflow: 'hidden',
                        }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ bgcolor: UI.muted }}>
                                {['Inspection Item', 'Description', 'Included', 'Notes', 'Document'].map((h, hi) => (
                                  <TableCell key={h} align={hi === 2 || hi === 4 ? 'center' : 'left'} sx={tblHeadSx}>
                                    {h}
                                  </TableCell>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {form.checklist.map((item, itemIdx) => {
                                const uploadKey = `${i}-${itemIdx}`;
                                const isUploading = uploadingKey === uploadKey;
                                return (
                                  <TableRow key={itemIdx} sx={{
                                    bgcolor: itemIdx % 2 === 0 ? UI.card : UI.muted,
                                    '&:hover': { bgcolor: alpha(UI.primary, 0.04) },
                                  }}>
                                    <TableCell sx={{ ...tblCellSx, width: '22%', fontWeight: 600 }}>
                                      {item.name}
                                    </TableCell>
                                    <TableCell sx={{ ...tblCellSx, width: '28%' }}>
                                      <TextField
                                        size="small" fullWidth placeholder="Enter Description"
                                        value={item.description}
                                        disabled={form.isFinalized}
                                        onChange={e => setChecklistItem(i, itemIdx, { description: e.target.value })}
                                        variant="standard"
                                        sx={{ '& .MuiInput-root': { fontSize: 13, color: UI.textSecondary } }}
                                      />
                                    </TableCell>
                                    <TableCell align="center" sx={{ ...tblCellSx, width: '10%' }}>
                                      <Checkbox
                                        checked={item.included}
                                        disabled={form.isFinalized}
                                        onChange={e => setChecklistItem(i, itemIdx, { included: e.target.checked })}
                                        size="small"
                                        sx={{ color: UI.border, '&.Mui-checked': { color: UI.primary } }}
                                      />
                                    </TableCell>
                                    <TableCell sx={{ ...tblCellSx, width: '28%' }}>
                                      <TextField
                                        size="small" fullWidth placeholder="Enter Notes"
                                        value={item.notes}
                                        disabled={form.isFinalized}
                                        onChange={e => setChecklistItem(i, itemIdx, { notes: e.target.value })}
                                        variant="standard"
                                        sx={{ '& .MuiInput-root': { fontSize: 13 } }}
                                      />
                                    </TableCell>
                                    <TableCell align="center" sx={{ ...tblCellSx, width: '14%' }}>
                                      {item.included ? (
                                        (() => {
                                          const docNames = (item.documentName || '').split(',').map(n => n.trim()).filter(Boolean);
                                          const docPaths = (item.documentPath || '').split(',').map(p => p.trim()).filter(Boolean);
                                          const baseUrl = getBackendBaseUrl();
                                          const docKey = `${i}-${itemIdx}`;
                                          const isExpanded = expandedDocs[docKey] || false;

                                          if (docNames.length === 0) {
                                            return (
                                              <>
                                                <input
                                                  type="file" hidden multiple
                                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                                  ref={el => { fileInputRefs.current[uploadKey] = el; }}
                                                  onChange={e => {
                                                    const files = e.target.files;
                                                    if (files) { for (let fi = 0; fi < files.length; fi++) handleUploadDoc(i, itemIdx, files[fi]); }
                                                    e.target.value = '';
                                                  }}
                                                />
                                                <Tooltip title="Upload document">
                                                  <span>
                                                    <Button
                                                      size="small" variant="outlined"
                                                      startIcon={isUploading ? <CircularProgress size={14} /> : <Upload size={14} />}
                                                      disabled={isUploading || form.isFinalized}
                                                      onClick={() => fileInputRefs.current[uploadKey]?.click()}
                                                      sx={{ whiteSpace: 'nowrap', fontSize: 11, borderRadius: '8px', textTransform: 'none', fontWeight: 600, borderColor: UI.border, color: UI.textSecondary }}
                                                    >
                                                      Upload
                                                    </Button>
                                                  </span>
                                                </Tooltip>
                                              </>
                                            );
                                          }

                                          // Single file: show clickable name with view/delete
                                          if (docNames.length === 1) {
                                            const name = docNames[0];
                                            const path = docPaths[0];
                                            return (
                                              <Box sx={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', maxWidth: 140, mx: 'auto' }}>
                                                <Box
                                                  sx={{
                                                    display: 'flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.4,
                                                    cursor: path ? 'pointer' : 'default',
                                                    '&:hover': path ? { backgroundColor: 'var(--bg-surface-2)' } : {},
                                                  }}
                                                  onClick={() => path && viewFileByPath(path.startsWith('http') ? path : `${baseUrl}${path}`)}
                                                >
                                                  <Typography sx={{ fontSize: 10, color: UI.primary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                                    {name.length > 12 ? name.slice(0, 10) + '..' : name}
                                                  </Typography>
                                                  {path && (
                                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); viewFileByPath(path.startsWith('http') ? path : `${baseUrl}${path}`); }} title="View" sx={{ p: 0.2, color: '#64748B', '&:hover': { color: UI.primary } }}>
                                                      <Eye size={12} />
                                                    </IconButton>
                                                  )}
                                                  {!form.isFinalized && (
                                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteDoc(i, itemIdx, 0); }} title="Delete" sx={{ p: 0.2, color: 'var(--text-muted)', '&:hover': { color: '#EF4444' } }}>
                                                      <Trash2 size={12} />
                                                    </IconButton>
                                                  )}
                                                </Box>
                                                {!form.isFinalized && (
                                                  <Box component="label" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3, py: 0.3, cursor: 'pointer', borderTop: '1px solid #E2E8F0', backgroundColor: '#FAFAFA', '&:hover': { backgroundColor: alpha(UI.primary, 0.05) } }}>
                                                    {isUploading ? <CircularProgress size={10} sx={{ color: UI.primary }} /> : (
                                                      <>
                                                        <Plus size={10} />
                                                        <Typography sx={{ fontSize: 9, fontWeight: 600, color: UI.primary }}>Add</Typography>
                                                      </>
                                                    )}
                                                    <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => { const files = e.target.files; if (files) { for (let fi = 0; fi < files.length; fi++) handleUploadDoc(i, itemIdx, files[fi]); } e.target.value = ''; }} />
                                                  </Box>
                                                )}
                                              </Box>
                                            );
                                          }

                                          // Multiple files: show collapsed/expanded view
                                          return (
                                            <Box sx={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', maxWidth: 140, mx: 'auto' }}>
                                              {/* Collapsed header */}
                                              <Box
                                                sx={{
                                                  display: 'flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.4,
                                                  cursor: 'pointer', '&:hover': { backgroundColor: 'var(--bg-surface-2)' },
                                                }}
                                                onClick={() => setExpandedDocs(prev => ({ ...prev, [docKey]: !isExpanded }))}
                                              >
                                                <Typography sx={{ fontSize: 10, color: UI.primary, flex: 1, fontWeight: 600 }}>
                                                  {docNames.length} files
                                                </Typography>
                                                <IconButton size="small" sx={{ p: 0.15, color: '#64748B' }}>
                                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </IconButton>
                                              </Box>

                                              {/* Expanded file list */}
                                              {isExpanded && (
                                                <Box sx={{ borderTop: '1px solid #E2E8F0', maxHeight: 80, overflowY: 'auto', '&::-webkit-scrollbar': { width: 2 }, '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--text-muted)', borderRadius: 2 } }}>
                                                  {docNames.map((name, dIdx) => (
                                                    <Box
                                                      key={`${name}-${dIdx}`}
                                                      sx={{
                                                        display: 'flex', alignItems: 'center', gap: 0.25, px: 0.5, py: 0.25,
                                                        borderBottom: dIdx < docNames.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                                        '&:hover': { backgroundColor: 'var(--bg-surface-2)' },
                                                        cursor: docPaths[dIdx] ? 'pointer' : 'default',
                                                      }}
                                                      onClick={() => docPaths[dIdx] && viewFileByPath(docPaths[dIdx].startsWith('http') ? docPaths[dIdx] : `${baseUrl}${docPaths[dIdx]}`)}
                                                    >
                                                      <Typography sx={{ fontSize: 9, color: UI.primary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                        {name.length > 10 ? name.slice(0, 8) + '..' : name}
                                                      </Typography>
                                                      {docPaths[dIdx] && (
                                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); viewFileByPath(docPaths[dIdx].startsWith('http') ? docPaths[dIdx] : `${baseUrl}${docPaths[dIdx]}`); }} title="View" sx={{ p: 0.1, color: '#64748B', '&:hover': { color: UI.primary } }}>
                                                          <Eye size={10} />
                                                        </IconButton>
                                                      )}
                                                      {!form.isFinalized && (
                                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteDoc(i, itemIdx, dIdx); }} title="Delete" sx={{ p: 0.1, color: 'var(--text-muted)', '&:hover': { color: '#EF4444' } }}>
                                                          <Trash2 size={10} />
                                                        </IconButton>
                                                      )}
                                                    </Box>
                                                  ))}
                                                </Box>
                                              )}

                                              {/* Add more button */}
                                              {!form.isFinalized && (
                                                <Box component="label" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3, py: 0.3, cursor: 'pointer', borderTop: '1px solid #E2E8F0', backgroundColor: '#FAFAFA', '&:hover': { backgroundColor: alpha(UI.primary, 0.05) } }}>
                                                  {isUploading ? <CircularProgress size={10} sx={{ color: UI.primary }} /> : (
                                                    <>
                                                      <Plus size={10} />
                                                      <Typography sx={{ fontSize: 9, fontWeight: 600, color: UI.primary }}>Add</Typography>
                                                    </>
                                                  )}
                                                  <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => { const files = e.target.files; if (files) { for (let fi = 0; fi < files.length; fi++) handleUploadDoc(i, itemIdx, files[fi]); } e.target.value = ''; }} />
                                                </Box>
                                              )}
                                            </Box>
                                          );
                                        })()
                                      ) : (
                                        <Typography variant="caption" color={UI.border}>â€”</Typography>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </TableContainer>

                        {/* Inspector notes */}
                        <Separator label="Inspector Notes" spacing={2} />
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MessageSquare size={15} color={UI.primary} />
                            <Typography sx={{ fontSize: 14, fontWeight: 600, color: UI.primary, lineHeight: 1.4 }}>Notes / Comments</Typography>
                          </Box>
                          <TextField
                            multiline minRows={6} fullWidth
                            value={form.inspectorNotes}
                            disabled={form.isFinalized}
                            onChange={e => updateForm(i, f => ({ ...f, inspectorNotes: e.target.value }))}
                            variant="outlined" size="small"
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                fontSize: '0.8125rem',
                                fontFamily: '"Inter", sans-serif',
                                color: UI.textPrimary,
                                backgroundColor: form.isFinalized ? UI.bgSubtle : '#fff',
                                borderRadius: UI.radiusXs,
                                transition: 'all 0.2s ease',
                                alignItems: 'flex-start',
                                '& fieldset':            { borderColor: UI.border, borderWidth: 1 },
                                '&:hover fieldset':      { borderColor: form.isFinalized ? UI.border : UI.textLight },
                                '&.Mui-focused fieldset': { borderColor: UI.primary, borderWidth: 2, boxShadow: '0 0 0 3px rgba(0, 200, 255,0.12)' },
                              },
                              '& .MuiInputBase-input': {
                                whiteSpace: 'pre-wrap',
                                lineHeight: 1.8,
                                wordBreak: 'break-word',
                                overflowWrap: 'break-word',
                                padding: '10px 14px',
                              },
                            }}
                          />

                          {/* Summary chips */}
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, pt: 0.5 }}>
                            <Chip label={`${totalIncluded} Included`} size="small" variant="outlined"
                              sx={{ fontWeight: 600, fontSize: 11, borderColor: UI.primary, color: UI.primary }} />
                            <Chip label={`${form.checklist.length - totalIncluded} Not Required`} size="small" variant="outlined"
                              sx={{ fontWeight: 600, fontSize: 11, borderColor: UI.border, color: UI.textSecondary }} />
                          </Box>
                        </Box>

                        {/* Action buttons */}
                        {!form.isFinalized ? (
                          <Stack direction="row" spacing={1.5} justifyContent="flex-start">
                            {editingIdx === i && (
                              <Button
                                variant="outlined" size="small"
                                startIcon={<X size={14} />}
                                onClick={() => handleCancelEdit(i)}
                                sx={{ borderRadius: UI.radius, height: 42, px: 3, textTransform: 'none', fontWeight: 600, fontSize: 13, borderColor: '#EF4444', color: '#EF4444', '&:hover': { borderColor: '#DC2626', background: '#FEF2F2' } }}
                              >
                                Cancel
                              </Button>
                            )}
                            <Button
                              variant="contained" size="small"
                              disabled={savingIdx === i}
                              startIcon={savingIdx === i ? <CircularProgress size={14} /> : <CheckCircle2 size={15} />}
                              onClick={() => handleSaveDraft(i)}
                              sx={{ background: UI.primary, borderRadius: UI.radius, height: 42, px: 3, textTransform: 'none', fontWeight: 600, fontSize: 13, boxShadow: UI.shadow, '&:hover': { background: UI.primary, filter: 'brightness(1.08)' } }}
                            >
                              Save Inspection
                            </Button>
                            <Button
                              variant="outlined" size="small"
                              disabled={pdfIdx === i}
                              startIcon={pdfIdx === i ? <CircularProgress size={14} /> : <FileDown size={14} />}
                              onClick={() => handleDownloadCoC(i)}
                              sx={{ borderRadius: UI.radius, height: 42, px: 3, textTransform: 'none', fontWeight: 600, fontSize: 13, borderColor: UI.border, color: UI.textSecondary, '&:hover': { borderColor: UI.primary, color: UI.primary, bgcolor: alpha(UI.primary, 0.04) } }}
                            >
                              Download COC PDF
                            </Button>
                          </Stack>
                        ) : (
                          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-start">
                            <Box sx={{ flex: 1, maxWidth: 'fit-content' }}>
                              <InfoBanner variant="success" message={`Inspection completed${form.completeDate ? ' on ' + new Date(form.completeDate).toLocaleDateString() : ''}`} />
                            </Box>
                            <Button
                              variant="outlined" size="small"
                              disabled={pdfIdx === i}
                              startIcon={pdfIdx === i ? <CircularProgress size={14} /> : <FileDown size={14} />}
                              onClick={() => handleDownloadCoC(i)}
                              sx={{ borderRadius: UI.radius, height: 42, px: 3, textTransform: 'none', fontWeight: 600, fontSize: 13, borderColor: UI.border, color: UI.textSecondary, '&:hover': { borderColor: UI.primary, color: UI.primary, bgcolor: alpha(UI.primary, 0.04) } }}
                            >
                              Download COC PDF
                            </Button>
                          </Stack>
                        )}
                      </Paper>
                    </motion.div>
                  )}
                </AnimatePresence>
              </MotionBox>
            </StaggerItem>
          );
        })}
      </StaggerList>

      {/* â”€â”€ Bottom nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <EnhancedNavFooter backLabel="Back to Production" nextLabel="Next: Logistics" onBack={onBack} onNext={onNext} />
    </TabContainer>
  );
};

export default QualityTab;

