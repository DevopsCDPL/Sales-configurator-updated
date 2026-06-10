import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Collapse,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Tooltip,
  CircularProgress,
  Checkbox,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Description as DocIcon,
  PictureAsPdf as PdfIcon,
  Image as ImageIcon,
  CallMerge as MergeIcon,
  SelectAll as SelectAllIcon,
  Visibility as ViewIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as PendingIcon,
  Warning as WarningIcon,
  AutoAwesome as GeneratedIcon,
  KeyboardArrowDown as ChevronDown,
  KeyboardArrowUp as ChevronUp
} from '@mui/icons-material';
import { Project, Document } from '../../types';
import api from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';
import { UI, TabContainer, EnhancedNavFooter, AnimatedSection } from '../UIComponents';
import { viewDocument, buildProjectFileName } from '../../utils/documentUtils';

interface DocumentsTabProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
  hasVendorSupplied?: boolean;
}

// â”€â”€ Workflow-based document order (FIXED ORDER based on project flow) â”€â”€â”€â”€â”€â”€â”€
interface WorkflowStep {
  sNo: number;
  key: string;
  label: string;
  module: string;
  docTypes: string[];
  isGenerated: boolean;
  canUpload: boolean;
}

const WORKFLOW_ORDER: WorkflowStep[] = [
  // Order follows project workflow tabs: Estimation â†’ Quotation â†’ PO from Client â†’ Work Order â†’ Production â†’ Quality â†’ Logistics â†’ Invoice
  { sNo: 1, key: 'drawing', label: 'Drawings / Attachments', module: 'Drawing', docTypes: ['drawing'], isGenerated: false, canUpload: true },
  { sNo: 2, key: 'quotation', label: 'Quotation', module: 'Quotation', docTypes: ['quotation'], isGenerated: true, canUpload: false },
  { sNo: 3, key: 'purchase_order', label: 'Purchase Order (Client PO)', module: 'Client PO', docTypes: ['purchase_order', 'sales_order'], isGenerated: false, canUpload: true },
  { sNo: 4, key: 'work_order', label: 'Work Order', module: 'Work Order', docTypes: ['work_order'], isGenerated: true, canUpload: false },
  { sNo: 5, key: 'rfq', label: 'RFQ Documents', module: 'RFQ', docTypes: ['rfq', 'rfq_quotation'], isGenerated: true, canUpload: false },
  { sNo: 6, key: 'vendor_po', label: 'PO to Vendor', module: 'PO to Vendor', docTypes: ['vendor_po', 'vendor_po_quotation'], isGenerated: true, canUpload: false },
  { sNo: 7, key: 'production_traveller', label: 'Production Traveler', module: 'Production', docTypes: ['production_traveller'], isGenerated: true, canUpload: false },
  { sNo: 8, key: 'external_po', label: 'External PO', module: 'External Process', docTypes: ['external_po'], isGenerated: false, canUpload: true },
  { sNo: 9, key: 'external_coc', label: 'External COC', module: 'External Process', docTypes: ['external_coc'], isGenerated: false, canUpload: true },
  { sNo: 10, key: 'coc', label: 'Quality Reports / COC', module: 'Quality', docTypes: ['coc', 'inspection_report', 'material_cert', 'quality'], isGenerated: true, canUpload: true },
  { sNo: 11, key: 'packing_list', label: 'Packing List', module: 'Logistics', docTypes: ['packing_list', 'tracking_slip'], isGenerated: true, canUpload: false },
  { sNo: 12, key: 'invoice', label: 'Invoice', module: 'Invoice', docTypes: ['invoice'], isGenerated: true, canUpload: true },
  { sNo: 13, key: 'other', label: 'Other Documents', module: 'Other', docTypes: ['other'], isGenerated: false, canUpload: true },
];

// â”€â”€ System-generated document types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GENERATED_TYPES = new Set([
  'quotation', 'work_order', 'production_traveller',
  'coc', 'packing_list', 'invoice',
  'rfq', 'rfq_quotation', 'vendor_po', 'vendor_po_quotation',
]);

const uploadTypes = [
  { value: 'drawing', label: 'Drawing' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'sales_order', label: 'Purchase Order' },
  { value: 'external_po', label: 'External PO' },
  { value: 'external_coc', label: 'External COC' },
  { value: 'inspection_report', label: 'Inspection Report' },
  { value: 'material_cert', label: 'Material Certificate' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'other', label: 'Other' },
];

const getFileIcon = (filename: string) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <PdfIcon color="error" sx={{ fontSize: 18 }} />;
  if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || ''))
    return <ImageIcon color="primary" sx={{ fontSize: 18 }} />;
  return <DocIcon color="action" sx={{ fontSize: 18 }} />;
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// â”€â”€ Status chip helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getStatusChip = (status: string) => {
  const statusConfig: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    completed: { color: '#059669', bg: '#D1FAE5', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
    approved: { color: '#059669', bg: '#D1FAE5', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
    pending: { color: '#D97706', bg: '#FEF3C7', icon: <PendingIcon sx={{ fontSize: 14 }} /> },
    draft: { color: '#6B7280', bg: '#F3F4F6', icon: <DocIcon sx={{ fontSize: 14 }} /> },
    missing: { color: '#DC2626', bg: '#FEE2E2', icon: <WarningIcon sx={{ fontSize: 14 }} /> },
  };
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <Chip
      icon={config.icon as React.ReactElement}
      label={status.charAt(0).toUpperCase() + status.slice(1)}
      size="small"
      sx={{
        fontSize: 11,
        fontWeight: 600,
        height: 24,
        color: config.color,
        bgcolor: config.bg,
        '& .MuiChip-icon': { color: config.color, ml: 0.5 },
      }}
    />
  );
};

// â”€â”€ Document type chip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getDocTypeChip = (isGenerated: boolean) => (
  <Chip
    icon={isGenerated ? <GeneratedIcon sx={{ fontSize: 14 }} /> : <UploadIcon sx={{ fontSize: 14 }} />}
    label={isGenerated ? 'Generated' : 'Uploaded'}
    size="small"
    variant="outlined"
    sx={{
      fontSize: 11,
      fontWeight: 600,
      height: 24,
      borderColor: isGenerated ? '#0891B2' : '#00c8ff',
      color: isGenerated ? '#0891B2' : '#00c8ff',
      '& .MuiChip-icon': { color: isGenerated ? '#0891B2' : '#00c8ff' },
    }}
  />
);

// â”€â”€ Unified row type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface UnifiedDocRow {
  sNo: number;
  key: string;
  label: string;
  module: string;
  docTypes: string[];
  documents: Document[];
  isGenerated: boolean;
  canUpload: boolean;
  status: 'completed' | 'pending' | 'missing' | 'draft';
  latestDoc?: Document;
  version: string;
  uploadedBy: string;
  date: string;
  size: string;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DocumentsTab: React.FC<DocumentsTabProps> = ({ project, onUpdate: _onUpdate, onBack, onNext, hasVendorSupplied = false }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [_loading, setLoading] = useState(true);
  const { showError, showSuccess } = useNotification();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadData, setUploadData] = useState({
    type: 'other',
    description: '',
    files: [] as File[],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  // Missing-files dialog state (shown after a partial merge)
  const [missingDialog, setMissingDialog] = useState<{
    open: boolean;
    merged: number;
    total: number;
    items: Array<{ id: string; name: string; reason?: string }>;
    showDetails: boolean;
  }>({ open: false, merged: 0, total: 0, items: [], showDetails: false });
  // Track IDs of missing documents so we can highlight them in the table
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());

  const [isMainPanelOpen, setIsMainPanelOpen] = useState(true);

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const loadDocuments = async () => {
    try {
      const response = await api.get(`/documents/project/${project.id}`);
      setDocuments(response.data.data || response.data || []);
    } catch {
      showError('Error loading documents');
    } finally {
      setLoading(false);
    }
  };

  // â”€â”€ Build unified workflow-based rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const unifiedRows: UnifiedDocRow[] = useMemo(() => {
    return WORKFLOW_ORDER.filter((step) => {
      // Hide PO to Vendor documents when no vendor-supplied parts
      if (step.key === 'vendor_po' && !hasVendorSupplied) return false;
      return true;
    }).map((step) => {
      // Find all documents matching this workflow step
      const matchingDocs = documents.filter((doc) => {
        const docType = doc.document_type || doc.type || '';
        return step.docTypes.includes(docType);
      });

      // Sort by date (newest first) to get latest version
      const sortedDocs = [...matchingDocs].sort((a, b) => 
        new Date(b.generated_at || b.createdAt || 0).getTime() - 
        new Date(a.generated_at || a.createdAt || 0).getTime()
      );

      const latestDoc = sortedDocs[0];
      const hasDocuments = matchingDocs.length > 0;

      // Determine status
      let status: 'completed' | 'pending' | 'missing' | 'draft' = 'missing';
      if (hasDocuments) {
        status = 'completed';
      } else if (step.isGenerated) {
        status = 'pending'; // Generated docs that don't exist yet
      }

      // Build version string
      const version = matchingDocs.length > 0 ? `v${matchingDocs.length}` : '-';

      // Get uploaded by info 
      const uploadedBy = latestDoc?.generatedBy?.name || latestDoc?.generated_by || 
        (step.isGenerated && hasDocuments ? 'System' : '-');

      // Format date
      const date = latestDoc 
        ? new Date(latestDoc.generated_at || latestDoc.createdAt || '').toLocaleDateString('en-GB', { 
            day: '2-digit', month: 'short', year: 'numeric' 
          })
        : '-';

      // Calculate total size
      const totalSize = matchingDocs.reduce((sum, d) => sum + (d.size || 0), 0);

      return {
        sNo: step.sNo,
        key: step.key,
        label: step.label,
        module: step.module,
        docTypes: step.docTypes,
        documents: sortedDocs,
        isGenerated: step.isGenerated && hasDocuments ? GENERATED_TYPES.has(latestDoc?.document_type || latestDoc?.type || '') : step.isGenerated,
        canUpload: step.canUpload,
        status,
        latestDoc,
        version,
        uploadedBy,
        date,
        size: totalSize > 0 ? formatFileSize(totalSize) : '-',
      };
    });
  }, [documents, hasVendorSupplied]);

  // All documents for merge functionality
  const allDocs = useMemo(() => documents, [documents]);

  // â”€â”€ handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleView = async (doc: Document) => {
    try {
      await viewDocument(doc.id);
    } catch (err: any) {
      showError(err.message || 'Error viewing document');
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const response = await api.get(`/documents/${doc.id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error downloading document');
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      showSuccess('Document deleted');
      loadDocuments();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error deleting document');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      setUploadData((prev) => ({
        ...prev,
        files: [...prev.files, ...Array.from(selected)],
      }));
    }
    e.target.value = '';
  };

  const handleRemoveFile = (idx: number) => {
    setUploadData((prev) => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== idx),
    }));
  };

  const handleUpload = async () => {
    if (uploadData.files.length === 0) { showError('Please select at least one file'); return; }
    try {
      for (const file of uploadData.files) {
        const step = WORKFLOW_ORDER.find(s => s.docTypes.includes(uploadData.type));
        const sectionName = (step?.module || uploadData.type).toLowerCase().replace(/[^a-z0-9]/g, '_');
        const renamedFile = buildProjectFileName(project.project_number, file, sectionName);
        const formData = new FormData();
        formData.append('file', renamedFile);
        formData.append('type', uploadData.type);
        formData.append('description', uploadData.description);
        await api.post(`/documents/project/${project.id}/upload`, formData);
      }
      showSuccess(`${uploadData.files.length} document(s) uploaded successfully`);
      setUploadDialogOpen(false);
      setUploadData({ type: 'other', description: '', files: [] });
      loadDocuments();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error uploading document');
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    if (selectedIds.size < 2) {
      showError('Select at least two documents to merge.');
      return;
    }
    setMerging(true);
    try {
      // Build ordered ID list following the workflow display order
      const orderedIds: string[] = [];
      for (const row of unifiedRows) {
        for (const doc of row.documents) {
          if (selectedIds.has(doc.id)) orderedIds.push(doc.id);
        }
      }
      // Safety fallback for any IDs not matched to a workflow row
      for (const id of selectedIds) {
        if (!orderedIds.includes(id)) orderedIds.push(id);
      }

      const response = await api.post(
        '/documents/merge',
        { documentIds: orderedIds, projectName: project.project_name },
        { responseType: 'blob', timeout: 120000 }
      );

      if (response.data.type === 'application/json') {
        const text = await (response.data as Blob).text();
        const json = JSON.parse(text);
        showError(json.message || 'Failed to merge selected PDFs.');
        return;
      }

      if (!response.data || response.data.size === 0) {
        showError('Merge returned an empty file. Please try again.');
        return;
      }

      const safeName = (project.project_name || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}_MergedDocuments.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const skippedHeader = response.headers?.['x-merge-skipped'];
      const mergedCount   = response.headers?.['x-merge-count'];
      const totalPagesStr = response.headers?.['x-merge-pages'];
      const missingHeader = response.headers?.['x-merge-missing'];
      const missingCountHeader = response.headers?.['x-merge-missing-count'];
      const pagesInfo = totalPagesStr ? ` (${totalPagesStr} pages)` : '';

      // Parse structured missing-docs payload (preferred)
      let missingItems: Array<{ id: string; name: string; reason?: string }> = [];
      if (missingHeader) {
        try {
          missingItems = JSON.parse(decodeURIComponent(missingHeader));
        } catch { /* fall back to header below */ }
      }
      if (missingItems.length === 0 && skippedHeader) {
        const names = [...new Set((skippedHeader as string).split(', ').map((s: string) => s.trim()))];
        missingItems = names.map(n => ({ id: '', name: n.replace(/\s*\([^)]*\)\s*$/, '') }));
      }

      const missingCount = missingItems.length || (missingCountHeader ? Number(missingCountHeader) : 0);

      if (missingCount > 0) {
        // Highlight missing rows and open the structured dialog (clean message)
        setMissingIds(new Set(missingItems.map(m => m.id).filter(Boolean)));
        setMissingDialog({
          open: true,
          merged: Number(mergedCount) || 0,
          total: orderedIds.length,
          items: missingItems,
          showDetails: false,
        });
      } else {
        showSuccess(`Merged ${mergedCount || orderedIds.length} document(s)${pagesInfo} downloaded successfully.`);
        setMissingIds(new Set());
      }
      setSelectedIds(new Set());
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        try {
          const text = await (err.response.data as Blob).text();
          const json = JSON.parse(text);
          showError(json.message || 'Failed to merge selected PDFs.');
          return;
        } catch {}
      }
      if (err.code === 'ECONNABORTED') {
        showError('Merge timed out. Try selecting fewer documents.');
      } else {
        showError(
          err.response?.data?.message ||
          'Failed to merge selected PDFs. Please try again.'
        );
      }
    } finally {
      setMerging(false);
    }
  };

  // â”€â”€ render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const allSelected = allDocs.length > 0 && allDocs.every((d) => selectedIds.has(d.id));
  // Count checked rows (not individual file IDs) so the label matches what the user sees
  const selectedRowCount = unifiedRows.filter(row => row.documents.some(d => selectedIds.has(d.id))).length;

  // Function to select all available documents and immediately merge
  const handleDownloadAll = async () => {
    if (allDocs.length === 0) return;
    // Set all available document IDs
    const ids = new Set<string>();
    allDocs.forEach((d) => ids.add(d.id));
    setSelectedIds(ids);
    
    // We cannot immediately call handleMerge() because state updates are async,
    // so we pass the ids directly or wait. For simplicity, we just trigger it and let handleMerge use the selectedIds.
    // However, handleMerge uses the state `selectedIds`. To fix this, let's modify handleMerge or wait.
    // A better approach is to call the merge logic directly with all ids:
    try {
      setMerging(true);
      const orderedIds: string[] = [];
      for (const row of unifiedRows) {
        for (const doc of row.documents) {
          orderedIds.push(doc.id);
        }
      }
      const response = await api.post(
        '/documents/merge',
        { documentIds: orderedIds, projectName: project.project_name },
        { responseType: 'blob', timeout: 120000 }
      );
      if (response.data.type === 'application/json') {
        const text = await (response.data as Blob).text();
        const json = JSON.parse(text);
        showError(json.message || 'Failed to merge PDF.');
        return;
      }
      if (!response.data || response.data.size === 0) {
        showError('Merge returned an empty file. Please try again.');
        return;
      }
      const safeName = (project.project_name || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}_MergedDocuments.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSuccess(`Merged ${orderedIds.length} document(s) successfully.`);
    } catch (err: any) {
      showError('Failed to merge all PDFs. Please try again.');
    } finally {
      setMerging(false);
    }
  };

  // â”€â”€ Open upload dialog with preset type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const openUploadForType = (docType: string) => {
    setUploadData({ type: docType, description: '', files: [] });
    setUploadDialogOpen(true);
  };

  // â”€â”€ Table header style â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const thStyle = { fontWeight: 600, fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, py: 1.5, px: 2, whiteSpace: 'nowrap' } as const;

  return (
    <TabContainer>

      {/* â”€â”€ Page Header â”€â”€ */}
      <AnimatedSection>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: '12px',
            backgroundColor: 'rgba(0,200,255,0.10)',
            border: '1px solid rgba(0,200,255,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <DocIcon sx={{ fontSize: 26, color: '#00c8ff' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 22, color: UI.textPrimary, letterSpacing: -0.3 }}>
              Documents
            </Typography>
            <Typography sx={{ fontSize: 13, color: UI.textMuted }}>
              Workflow-based document tracker â€” track what&apos;s done and what&apos;s missing
            </Typography>
          </Box>
          {/* Summary chips */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip 
              icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
              label={`${unifiedRows.filter(r => r.status === 'completed').length} Completed`} 
              size="small" 
              sx={{ fontWeight: 600, bgcolor: '#D1FAE5', color: '#059669', fontSize: 11 }} 
            />
            <Chip 
              icon={<WarningIcon sx={{ fontSize: 14 }} />}
              label={`${unifiedRows.filter(r => r.status === 'missing' || r.status === 'pending').length} Pending`} 
              size="small" 
              sx={{ fontWeight: 600, bgcolor: '#FEF3C7', color: '#D97706', fontSize: 11 }} 
            />
          </Box>
        </Box>
      </AnimatedSection>

      {/* â•â•â• Single Unified Documents Table â•â•â• */}
      <Card sx={{ mb: 3, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadow, overflow: 'hidden' }}>
        {/* Card Header */}
        <Box sx={{
          px: 3, py: 1.75, background: UI.bgSubtle, borderBottom: UI.borderLight,
          borderLeft: `4px solid ${UI.primary}`, display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
          <DocIcon sx={{ color: UI.primary, fontSize: 22 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} color={UI.textPrimary} letterSpacing={0.2}>
              Project Documents â€” Workflow View
            </Typography>
            <Typography variant="caption" sx={{ color: '#6B7280' }}>
              Documents ordered by project workflow stages
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Chip label={`${allDocs.length} Files`} size="small" sx={{ fontWeight: 700, bgcolor: UI.primary, color: '#000', fontSize: 12 }} />
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); handleDownloadAll(); }}
              disabled={merging || allDocs.length === 0}
              title="Download All Documents as PDF"
              sx={{
                border: `1px solid #CBD5E1`, color: UI.textSecondary, borderRadius: '8px', width: 30, height: 30,
                '&:hover': { borderColor: 'var(--text-muted)', bgcolor: 'var(--bg-surface-2)', color: UI.primary }
              }}
            >
              {merging ? <CircularProgress size={14} color="inherit" /> : <PdfIcon sx={{ fontSize: 16 }} />}
            </IconButton>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); setIsMainPanelOpen(!isMainPanelOpen); }}
              sx={isMainPanelOpen
                ? { bgcolor: UI.primary, color: '#000', borderRadius: '8px', width: 30, height: 30, flexShrink: 0, '&:hover': { bgcolor: UI.primary, color: '#000' } }
                : { border: `1px solid ${UI.border}`, color: UI.textSecondary, borderRadius: '8px', width: 30, height: 30, flexShrink: 0, '&:hover': { borderColor: UI.textMuted, bgcolor: 'var(--bg-surface-2)' } }
              }
            >
              {isMainPanelOpen ? <ChevronUp sx={{ fontSize: 18 }} /> : <ChevronDown sx={{ fontSize: 18 }} />}
            </IconButton>
          </Stack>
        </Box>

        <Collapse in={isMainPanelOpen} unmountOnExit>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ background: UI.bgSubtle }}>
                  <TableCell padding="checkbox" sx={{ ...thStyle, pl: 2, width: 44, background: UI.bgSubtle }} />
                  <TableCell sx={{ ...thStyle, width: 52 }}>S.No</TableCell>
                  <TableCell sx={{ ...thStyle, width: '30%', minWidth: 200 }}>Document Name</TableCell>
                  <TableCell sx={{ ...thStyle, width: 130 }}>Module</TableCell>
                  <TableCell sx={{ ...thStyle, width: 110 }}>Type</TableCell>
                  <TableCell sx={{ ...thStyle, width: 80 }}>Size</TableCell>
                  <TableCell sx={{ ...thStyle, width: 110 }}>Status</TableCell>
                  <TableCell align="center" sx={{ ...thStyle, width: 130 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unifiedRows.flatMap((row) => {
                  const hasDoc = row.documents.length > 0;
                  const docsToRender = hasDoc ? row.documents : [null];

                  return docsToRender.map((currentDoc, docIdx) => {
                    const isLatest = docIdx === 0;
                    const isRowGenerated = row.isGenerated && currentDoc ? GENERATED_TYPES.has(currentDoc.document_type || currentDoc.type || '') : row.isGenerated;
                    const rowHasMissing = currentDoc && missingIds.has(currentDoc.id);

                    // Generate S.No like "1 A", "1 B" if multiple docs
                    const serialNumber = row.documents.length > 1 
                      ? `${row.sNo} ${String.fromCharCode(65 + docIdx)}` 
                      : row.sNo;

                    return (
                    <TableRow
                      key={currentDoc ? currentDoc.id : row.key}
                      hover={hasDoc}
                      sx={{
                        cursor: hasDoc ? 'pointer' : 'default',
                        bgcolor: rowHasMissing ? 'rgba(239, 68, 68, 0.12)' :
                                 row.status === 'missing' ? 'rgba(254, 226, 226, 0.3)' :
                                 row.status === 'pending' ? 'rgba(254, 243, 199, 0.3)' : 'inherit',
                        borderLeft: rowHasMissing ? '3px solid #ef4444' : 'none',
                        '&:hover': hasDoc ? { bgcolor: rowHasMissing ? 'rgba(239, 68, 68, 0.18)' : 'rgba(0, 200, 255, 0.04)' } : {},
                      }}
                      onClick={() => hasDoc && currentDoc && handleView(currentDoc)}
                    >
                      {/* Checkbox */}
                      <TableCell padding="checkbox" sx={{ pl: 2 }}>
                        {hasDoc && currentDoc && (
                          <Checkbox
                            size="small"
                            checked={selectedIds.has(currentDoc.id)}
                            onChange={() => {
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(currentDoc.id)) next.delete(currentDoc.id);
                                else next.add(currentDoc.id);
                                return next;
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </TableCell>

                      {/* S.No */}
                      <TableCell sx={{ px: 2 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: UI.textPrimary }}>{serialNumber}</Typography>
                      </TableCell>

                      {/* Document Name */}
                      <TableCell sx={{ px: 2, maxWidth: 260 }}>
                        {hasDoc && currentDoc ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            {getFileIcon(currentDoc.file_name)}
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Tooltip title={currentDoc.file_name} placement="top-start" disableHoverListener={currentDoc.file_name.length < 30}>
                                <Typography 
                                  variant="body2" 
                                  fontWeight={600} 
                                  color="text.primary"
                                  sx={{ 
                                    fontSize: 13,
                                    '&:hover': { color: UI.primary, textDecoration: 'underline' },
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    display: 'block',
                                  }}
                                >
                                  {currentDoc.file_name}
                                </Typography>
                              </Tooltip>
                            </Box>
                          </Box>
                        ) : (
                          <Typography sx={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.label}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Module */}
                      <TableCell sx={{ px: 2 }}>
                        <Chip 
                          label={row.module} 
                          size="small" 
                          variant="outlined" 
                          sx={{ fontSize: 10, fontWeight: 600, height: 22, maxWidth: 120 }} 
                        />
                      </TableCell>

                      {/* Document Type */}
                      <TableCell sx={{ px: 2 }}>
                        {hasDoc ? getDocTypeChip(isRowGenerated) : (
                          <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>-</Typography>
                        )}
                      </TableCell>

                      {/* Size */}
                      <TableCell sx={{ px: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                          {hasDoc && currentDoc ? formatFileSize(currentDoc.size || 0) : row.size}
                        </Typography>
                      </TableCell>

                      {/* Status */}
                      <TableCell sx={{ px: 2 }}>
                        {getStatusChip(row.status)}
                      </TableCell>

                      {/* Action */}
                      <TableCell align="center" sx={{ px: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                          {hasDoc && currentDoc ? (
                            <>
                              <Tooltip title="View">
                                <IconButton
                                  size="small"
                                  onClick={(e) => { e.stopPropagation(); handleView(currentDoc); }}
                                  sx={{ color: '#64748B', '&:hover': { color: UI.primary }, p: 0.5 }}
                                >
                                  <ViewIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Download">
                                <IconButton
                                  size="small"
                                  onClick={(e) => { e.stopPropagation(); handleDownload(currentDoc); }}
                                  sx={{ color: '#64748B', '&:hover': { color: '#0891B2' }, p: 0.5 }}
                                >
                                  <DownloadIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(currentDoc.id); }}
                                  sx={{ color: 'var(--text-muted)', '&:hover': { color: '#ef4444' }, p: 0.5 }}
                                >
                                  <DeleteIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            </>
                          ) : row.canUpload ? (
                            <Tooltip title={`Upload ${row.label}`}>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<UploadIcon sx={{ fontSize: 14 }} />}
                                onClick={(e) => { e.stopPropagation(); openUploadForType(row.docTypes[0]); }}
                                sx={{
                                  textTransform: 'none',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  py: 0.25,
                                  px: 1,
                                  borderColor: '#00c8ff',
                                  color: '#00c8ff',
                                  '&:hover': { bgcolor: 'rgba(0, 200, 255, 0.04)' },
                                }}
                              >
                                Upload
                              </Button>
                            </Tooltip>
                          ) : (
                            <Typography sx={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>
                              Generate in module
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                });
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>

        {/* Upload button at bottom of card */}
        <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'flex-end', borderTop: UI.borderLight }}>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => { setUploadData({ type: 'other', description: '', files: [] }); setUploadDialogOpen(true); }}
            sx={{
              textTransform: 'none', fontWeight: 600, borderRadius: '10px',
              px: 2.5, py: 1, borderColor: '#00c8ff', color: '#00c8ff',
              '&:hover': { background: 'rgba(0, 200, 255,0.04)', borderColor: '#00c8ff' },
            }}
          >
            Upload Document
          </Button>
        </Box>
        </Collapse>
      </Card>

      {/* â•â•â• Merge Section â•â•â• */}
      <Box
        sx={{
          mb: 3, p: 2.5,
          background: selectedIds.size > 0 ? 'var(--bg-canvas)' : 'var(--bg-surface-2)',
          border: `1px solid ${selectedIds.size > 0 ? 'var(--text-muted)' : 'var(--border)'}`,
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          transition: 'all 0.25s',
        }}
      >
        <Box>
          {selectedIds.size > 0 ? (
            <>
              <Typography fontWeight={700} color="#00c8ff" fontSize={15}>
                {selectedRowCount} document{selectedRowCount !== 1 ? 's' : ''} selected
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Click &ldquo;Merge &amp; Download&rdquo; to combine into one PDF
              </Typography>
            </>
          ) : (
            <>
              <Typography fontWeight={600} color="text.secondary" fontSize={14}>
                Merge available documents into a single PDF
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Select documents using checkboxes or click &ldquo;Select All&rdquo;
              </Typography>
            </>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {selectedIds.size > 0 && (
            <Button
              variant="text"
              size="small"
              onClick={() => setSelectedIds(new Set())}
              sx={{ textTransform: 'none', fontWeight: 600, color: '#6B7280' }}
            >
              Clear
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={<SelectAllIcon />}
            disabled={allDocs.length === 0}
            onClick={() => {
              if (allSelected) {
                setSelectedIds(new Set());
              } else {
                const ids = new Set(selectedIds);
                allDocs.forEach((d) => ids.add(d.id));
                setSelectedIds(ids);
              }
            }}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              fontSize: 13,
              borderColor: UI.primary,
              color: UI.primary,
              '&:hover': { background: 'rgba(0,0,0,0.04)' },
            }}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </Button>
          <Button
            variant="contained"
            startIcon={
              merging
                ? <CircularProgress size={16} color="inherit" />
                : <MergeIcon />
            }
            onClick={handleMerge}
            disabled={selectedIds.size === 0 || merging}
            sx={{
              background: UI.primary,
              borderRadius: '8px',
              px: 3, py: 1.2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 14,
              boxShadow: selectedIds.size > 0 ? '0 4px 14px rgba(0, 200, 255,0.15)' : 'none',
              '&:hover': {
                background: UI.primary,
                transform: 'translateY(-1px)',
              },
              '&:disabled': { background: '#e0e0e0', boxShadow: 'none', color: '#9e9e9e' },
              transition: 'all 0.2s',
            }}
          >
            {merging ? 'Mergingâ€¦' : 'Merge & Download'}
          </Button>
        </Box>
      </Box>

      {/* â•â•â• Upload Dialog â•â•â• */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Upload Document</DialogTitle>
        <Divider />
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Document Type</InputLabel>
              <Select
                value={uploadData.type}
                label="Document Type"
                onChange={(e) => setUploadData({ ...uploadData, type: e.target.value })}
              >
                {uploadTypes.map((t) => (
                  <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Description (Optional)"
              value={uploadData.description}
              onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
              sx={{ mb: 2 }}
            />

            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileSelect}
              hidden
              aria-label="Upload files"
              title="Select files to upload"
            />

            {uploadData.files.length === 0 ? (
              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 3,
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'transparent',
                  '&:hover': { borderColor: '#1565c0', bgcolor: 'action.hover' },
                  transition: 'all 0.2s',
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                <Typography fontWeight={500}>Click to select files</Typography>
              </Box>
            ) : (
              <Box sx={{ border: '1px solid #E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ maxHeight: 160, overflowY: 'auto', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--text-muted)', borderRadius: 2 } }}>
                  {uploadData.files.map((file, idx) => (
                    <Box key={`${file.name}-${idx}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderBottom: idx < uploadData.files.length - 1 ? '1px solid var(--border-subtle)' : 'none', '&:hover': { backgroundColor: 'var(--bg-surface-2)' } }}>
                      {getFileIcon(file.name)}
                      <Typography sx={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {file.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {formatFileSize(file.size)}
                      </Typography>
                      <IconButton size="small" onClick={() => handleRemoveFile(idx)} sx={{ p: 0.4, color: 'var(--text-muted)', '&:hover': { color: '#EF4444' } }}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
                <Box
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                    py: 0.75, cursor: 'pointer', borderTop: '1px solid #E2E8F0', backgroundColor: '#FAFAFA',
                    '&:hover': { backgroundColor: '#E8F5E9' }, transition: 'all 0.2s',
                  }}
                >
                  <UploadIcon sx={{ fontSize: 16, color: '#2e7d32' }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#2e7d32' }}>Add More Files</Typography>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUploadDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={uploadData.files.length === 0}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Upload
          </Button>
        </DialogActions>
      </Dialog>

      {/* â”€â”€ Missing Files Dialog (shown after a partial merge) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Dialog
        open={missingDialog.open}
        onClose={() => setMissingDialog(s => ({ ...s, open: false }))}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 600 }}>
          <WarningIcon sx={{ color: '#f59e0b' }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              Some files are missing and were skipped
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 400, mt: 0.5 }}>
              Merged {missingDialog.merged} of {missingDialog.total} document(s).{' '}
              <Box component="span" sx={{ color: '#dc2626', fontWeight: 600 }}>
                {missingDialog.items.length} file{missingDialog.items.length === 1 ? '' : 's'} missing
              </Box>
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#374151', mb: 2 }}>
            The merged PDF was downloaded successfully. The files listed below could not be located and were skipped. You can re-upload them from the documents list.
          </Typography>
          <Button
            size="small"
            onClick={() => setMissingDialog(s => ({ ...s, showDetails: !s.showDetails }))}
            sx={{ textTransform: 'none', mb: 1 }}
          >
            {missingDialog.showDetails ? 'Hide details' : 'View details'}
          </Button>
          {missingDialog.showDetails && (
            <Box sx={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 1, p: 1.5, bgcolor: '#f9fafb' }}>
              {missingDialog.items.map((m, i) => (
                <Box
                  key={(m.id || 'noid') + '-' + i}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: i < missingDialog.items.length - 1 ? '1px solid #e5e7eb' : 'none' }}
                >
                  <WarningIcon sx={{ fontSize: 16, color: '#f59e0b', flexShrink: 0 }} />
                  <Typography
                    variant="body2"
                    sx={{ flex: 1, fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={m.name}
                  >
                    {m.name}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMissingDialog(s => ({ ...s, open: false }))} sx={{ textTransform: 'none' }}>
            Close
          </Button>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => {
              setMissingDialog(s => ({ ...s, open: false }));
              setUploadData({ type: 'drawing', description: '', files: [] });
              setUploadDialogOpen(true);
            }}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Re-upload Files
          </Button>
        </DialogActions>
      </Dialog>

      <EnhancedNavFooter
        onBack={onBack}
        onNext={onNext}
        backLabel="Back to Logistics"
        nextLabel="Next: Analytics"
      />
    </TabContainer>
  );
};

export default DocumentsTab;

