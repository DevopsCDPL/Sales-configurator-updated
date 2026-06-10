import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Tooltip, Chip, alpha, Button, Breadcrumbs,
  Link, TextField, InputAdornment, Alert, Snackbar, Dialog, DialogTitle,
  DialogContent, DialogActions, Skeleton, CircularProgress,
  TablePagination, MenuItem, Select,
} from '@mui/material';
import {
  FolderOpen as FolderOpenIcon,
  Description as FileIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  CloudUpload as UploadIcon,
  Search as SearchIcon,
  ChevronRight as ChevRightIcon,
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  Receipt as ReceiptIcon,
  Visibility as ViewIcon,

} from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(isToday);
dayjs.extend(relativeTime);

const PRIMARY = '#33d6ff';

interface FolderNode {
  id: string;
  name: string;
  slug: string;
  path: string;
  parent_id: string | null;
  folder_type: string;
  module_type: string | null;
  project_id: string | null;
  children?: FolderNode[];
  documents?: DocItem[];
  project?: { id: string; project_name: string } | null;
}

interface DocItem {
  id: string;
  file_name: string;
  description: string | null;
  document_type: string;
  version: number;
  status: string;
  file_type: string | null;
  size: number | null;
  created_at: string;
  module_type: string | null;
  reference_id: string | null;
  reference_name?: string | null;
  project_id?: string | null;
  generatedBy?: { id: string; name: string } | null;
  uploadedBy?: { id: string; name: string } | null;
  folder?: { id: string; name: string; path: string } | null;
  // enriched fields
  part?: { id: string; part_number: string; description: string; client?: { id: string; client_name: string } } | null;
  stock?: { id: string; stock_id: string; part_description: string; quantity: number; status?: string } | null;
}

interface PartMasterEntry {
  part_id: string;
  part_id_seq: string;
  part_name: string;
  part_number: string;
  description: string | null;
  client: { id: string; client_name: string } | null;
  drawing_url: string | null;
  created_at: string;
  document: {
    id: string;
    file_name: string;
    file_path: string;
    size: number | null;
    uploaded_by: { id: string; name: string } | null;
    created_at: string;
  } | null;
}

const ROOT_TABS = [
  { label: 'Project Documents', path: '/Project Documents', module: 'project' },
  { label: 'Procurement Documents', path: '/Procurement Documents', module: 'procurement' },
  { label: 'Part Master', path: '/Part Master', module: 'part_master' },
  { label: 'Inventory', path: '/Inventory', module: 'inventory' },
];

function formatBytes(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function statusChip(status: string) {
  const color =
    status === 'approved' ? 'success' :
    status === 'latest' ? 'info' :
    'default';
  return (
    <Chip
      label={status.charAt(0).toUpperCase() + status.slice(1)}
      size="small"
      color={color as any}
      variant="outlined"
      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
    />
  );
}

// Document type → section display name mapping (mirrors backend DOC_TYPE_TO_PROJECT_FOLDER)
const DOC_TYPE_TO_SECTION: Record<string, string> = {
  rfq: 'RFQ',
  quotation: 'Quotation',
  purchase_order: 'PO from Client',
  po_client: 'PO from Client',
  sales_order: 'PO from Client',
  work_order: 'Work Order',
  production_traveller: 'Production',
  production: 'Production',
  coc: 'Quality (COC)',
  quality: 'Quality (COC)',
  inspection_report: 'Quality (COC)',
  material_cert: 'Quality (COC)',
  packing_list: 'Logistics',
  tracking_slip: 'Logistics',
  invoice: 'Invoice',
  external_po: 'PO from Client',
  external_coc: 'Quality (COC)',
  vendor_po: 'PO to Vendor',
  vendor_po_quotation: 'PO to Vendor',
  sent_rfq: 'RFQ',
  received_quotation: 'Quotation',
  drawing: 'Estimation',
  estimation: 'Estimation',
  project_info: 'Project Info',
  approved_po: 'PO from Client',
  rfq_quotation: 'Quotation',
  upload: 'Documents',
  other: 'Documents',
};

// All project subfolders (always shown, even if empty)
const PROJECT_SUBFOLDERS = [
  'Project Info', 'Estimation', 'Quotation', 'RFQ', 'PO from Client',
  'PO to Vendor', 'Work Order', 'Production', 'Quality (COC)', 'Logistics',
  'Invoice', 'Documents', 'Analytics', 'Others',
];

const SECTION_TO_UPLOAD_DOC_TYPE: Record<string, string> = {
  'Project Info': 'project_info',
  Estimation: 'drawing',
  Quotation: 'quotation',
  RFQ: 'rfq',
  'PO from Client': 'purchase_order',
  'PO to Vendor': 'vendor_po',
  'Work Order': 'work_order',
  Production: 'production_traveller',
  'Quality (COC)': 'coc',
  Logistics: 'packing_list',
  Invoice: 'invoice',
  Documents: 'other',
  Analytics: 'other',
  Others: 'upload',
};

function getSection(docType: string): string {
  if (!docType) return 'Others';
  const lower = docType.toLowerCase().trim();
  const mapped = DOC_TYPE_TO_SECTION[lower];
  if (mapped) return mapped;
  // Check if already a valid section name
  const match = PROJECT_SUBFOLDERS.find(s => s.toLowerCase() === lower);
  if (match) return match;
  return 'Others';
}

function getRefKey(doc: DocItem): string {
  // For project docs, always group by project_id (reference_id may be RFQ/quotation/WO UUID)
  if (doc.module_type === 'project' && doc.project_id) return doc.project_id;
  return doc.reference_id || doc.project_id || 'unassigned';
}

// R2 file item returned from browse endpoint
interface R2FileItem {
  key: string;
  size: number;
  lastModified: string;
}

const FileManagerPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadDocType, setUploadDocType] = useState('upload');
  const [uploading, setUploading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // Flat-table data for Part Master and Inventory
  const [partDocs, setPartDocs] = useState<PartMasterEntry[]>([]);
  const [inventoryDocs, setInventoryDocs] = useState<DocItem[]>([]);

  // Procurement live data (RFQs + POs from mgmt-procurement)
  const [procRfqs, setProcRfqs] = useState<any[]>([]);
  const [procPos, setProcPos] = useState<any[]>([]);
  const [procSubTab, setProcSubTab] = useState<0 | 1>(0);

  // Document-driven folder data for Procurement (only)
  const [moduleDocs, setModuleDocs] = useState<DocItem[]>([]);

  // Project Documents tab state (2-level: project list → file tables)
  const [projectFolders, setProjectFolders] = useState<{ name: string; prefix: string; project_id?: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<{ name: string; prefix: string; project_id?: string } | null>(null);
  const [selectedProjectSection, setSelectedProjectSection] = useState<string | null>(null);
  const [projectDocs, setProjectDocs] = useState<DocItem[]>([]);

  // All projects list (for enriching folder names)
  const [allProjects, setAllProjects] = useState<{
    id: string; project_name: string; project_number?: string;
    reference_id?: string; created_at?: string; updated_at?: string;
    status?: string; file_count?: number; last_activity?: string;
    client_name?: string; client?: { id: string; client_name: string } | null;
  }[]>([]);
  const allProjectsRef = useRef(allProjects);
  allProjectsRef.current = allProjects;

  // ── Fetch folder tree + all projects ───────────────────────────
  const fetchTree = useCallback(async () => {
    try {
      const res = await api.get('/file-manager/tree');
      setTree(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch file manager tree', err);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await api.get('/file-manager/projects');
      const projects = res.data.data || [];
      allProjectsRef.current = projects;
      setAllProjects(projects);
    } catch (err) {
      console.error('Failed to fetch projects list', err);
    }
  }, []);

  useEffect(() => { fetchTree(); fetchProjects(); }, [fetchTree, fetchProjects]);

  // ── Load project folders for the user's company ────────────
  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/file-manager/r2/projects');
      const data = res.data.data || { projects: [] };
      setProjectFolders(data.projects || []);
      setSelectedProject(null);
      setProjectDocs([]);
      setSelectedProjectSection(null);
      setCurrentFolder(null);
    } catch (err) {
      console.error('loadProjects failed', err);
      setProjectFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load uploaded + generated files for a project (DB-driven) ─────────
  const loadProjectFiles = useCallback(async (project: { name: string; prefix: string; project_id?: string }) => {
    setLoading(true);
    setSelectedProject(project);
    try {
      const projectId = project.project_id;
      if (!projectId) {
        setProjectDocs([]);
        return;
      }
      const res = await api.get('/file-manager/documents', {
        params: { module_type: 'project', project_id: projectId },
      });
      const docs: DocItem[] = res.data.data || [];
      setProjectDocs(docs);
      setSelectedProjectSection(null);
    } catch (err) {
      console.error('loadProjectFiles failed', err);
      setProjectDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const getProjectSectionFolder = useCallback((section: string): FolderNode | null => {
    if (!selectedProject?.project_id) return null;
    return tree.find(folder =>
      folder.project_id === selectedProject.project_id &&
      folder.folder_type === 'subfolder' &&
      folder.name === section
    ) || null;
  }, [selectedProject?.project_id, tree]);

  const handleProjectSectionChange = useCallback((section: string) => {
    setSelectedProjectSection(section);
    setUploadDocType(SECTION_TO_UPLOAD_DOC_TYPE[section] || 'upload');
    setCurrentFolder(getProjectSectionFolder(section));
  }, [getProjectSectionFolder]);

  // ── Navigate to a root tab ────────────────────────────────────
  useEffect(() => {
    const tab = ROOT_TABS[activeTab];
    if (!tab) return;

    if (tab.module === 'project') {
      loadProjects();
      return;
    }
    if (tab.module === 'part_master') {
      loadPartMaster();
      return;
    }
    if (tab.module === 'inventory') {
      loadInventory();
      return;
    }
    if (tab.module === 'procurement') {
      loadProcurementDocs();
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loadProjects]);

  // ── Part Master flat data ─────────────────────────────────────
  const loadPartMaster = async () => {
    setLoading(true);
    try {
      const res = await api.get('/file-manager/parts');
      setPartDocs((res.data.data || []) as PartMasterEntry[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Procurement live data (RFQs + POs) ────────────────────────
  const loadProcurementDocs = async () => {
    setLoading(true);
    try {
      const [rfqRes, poRes] = await Promise.all([
        api.get('/mgmt-procurement/rfqs'),
        api.get('/mgmt-procurement/pos'),
      ]);
      setProcRfqs(rfqRes.data?.data || []);
      setProcPos(poRes.data?.data || []);
    } catch (err) {
      console.error('Failed to load procurement docs', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Download procurement PDF (RFQ or PO) ──────────────────────
  const handleProcDownload = async (type: 'rfq' | 'po', id: string, label: string) => {
    try {
      const url = type === 'rfq'
        ? `/mgmt-procurement/rfqs/${id}/pdf`
        : `/mgmt-procurement/pos/${id}/pdf`;
      const res = await api.get(url, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${label}.pdf`;
      a.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setSnackbar({ open: true, message: 'Download failed', severity: 'error' });
    }
  };

  // ── Inventory flat data ───────────────────────────────────────
  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/file-manager/inventory');
      setInventoryDocs(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Download ──────────────────────────────────────────────────
  const handleDownload = async (docId: string, fileName: string) => {
    try {
      const res = await api.get(`/file-manager/documents/${docId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setSnackbar({ open: true, message: 'Download failed', severity: 'error' });
    }
  };

  // R2 key-based download via presigned URL
  const handleR2Download = async (key: string) => {
    try {
      const { data } = await api.get('/file-manager/r2/signed-url', { params: { key } });
      if (!data.success || !data.url) throw new Error('Failed to get signed URL');
      const a = document.createElement('a');
      a.href = data.url;
      a.download = key.split('/').pop() || 'file';
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    } catch {
      setSnackbar({ open: true, message: 'Download failed', severity: 'error' });
    }
  };

  // ── View (open in new tab) ────────────────────────────────────
  const getApiBaseUrl = () => {
    return (window as any).__RUNTIME_API_URL__ || process.env.REACT_APP_API_URL || '/api';
  };

  const openWithAuth = async (url: string) => {
    try {
      const token = sessionStorage.getItem('token') || localStorage.getItem('token');
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch file');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch {
      setSnackbar({ open: true, message: 'Unable to view file', severity: 'error' });
    }
  };

  const handleView = (docId: string) => {
    const baseUrl = getApiBaseUrl();
    openWithAuth(`${baseUrl}/file-manager/documents/${docId}/view`);
  };

  // R2 key-based view via presigned URL
  const handleR2View = async (key: string) => {
    try {
      const { data } = await api.get('/file-manager/r2/signed-url', { params: { key } });
      if (!data.success || !data.url) throw new Error('Failed to get signed URL');
      window.open(data.url, '_blank', 'noopener');
    } catch {
      setSnackbar({ open: true, message: 'Unable to view file', severity: 'error' });
    }
  };

  const handleProcView = (type: 'rfq' | 'po', id: string) => {
    const baseUrl = getApiBaseUrl();
    const url = type === 'rfq'
      ? `${baseUrl}/mgmt-procurement/rfqs/${id}/pdf`
      : `${baseUrl}/mgmt-procurement/pos/${id}/pdf`;
    openWithAuth(url);
  };

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async (docId: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;
    try {
      await api.delete(`/file-manager/documents/${docId}`);
      setSnackbar({ open: true, message: 'File deleted', severity: 'success' });
      if (ROOT_TABS[activeTab].module === 'part_master') loadPartMaster();
      else if (ROOT_TABS[activeTab].module === 'inventory') loadInventory();
      else if (ROOT_TABS[activeTab].module === 'project' && selectedProject) loadProjectFiles(selectedProject);
    } catch {
      setSnackbar({ open: true, message: 'Delete failed', severity: 'error' });
    }
  };

  // R2 key-based delete
  const handleR2Delete = async (key: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;
    try {
      await api.delete('/file-manager/r2/file', { params: { key } });
      setSnackbar({ open: true, message: 'File deleted', severity: 'success' });
      if (selectedProject) loadProjectFiles(selectedProject);
    } catch {
      setSnackbar({ open: true, message: 'Delete failed', severity: 'error' });
    }
  };

  // ── Upload ────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      const selectedFolder = ROOT_TABS[activeTab]?.module === 'project'
        ? getProjectSectionFolder(selectedProjectSection || '')
        : currentFolder;
      const selectedDocType = ROOT_TABS[activeTab]?.module === 'project'
        ? (SECTION_TO_UPLOAD_DOC_TYPE[selectedProjectSection || ''] || uploadDocType || 'upload')
        : (uploadDocType || 'upload');

      formData.append('file', uploadFile);
      formData.append('description', uploadDesc || uploadFile.name);
      formData.append('document_type', selectedDocType);

      if (selectedFolder) {
        if (!selectedFolder.id.startsWith('vf-')) {
          formData.append('folder_id', selectedFolder.id);
        }
        if (selectedFolder.module_type) formData.append('module_type', selectedFolder.module_type);
        if (selectedFolder.project_id) {
          formData.append('project_id', selectedFolder.project_id);
          formData.append('reference_id', selectedFolder.project_id);
        }
      }
      const tab = ROOT_TABS[activeTab];
      if (tab.module === 'part_master') formData.append('module_type', 'part_master');
      if (tab.module === 'inventory') formData.append('module_type', 'inventory');
      if (tab.module === 'project') {
        formData.append('module_type', 'project');
        if (selectedProject?.project_id) {
          formData.append('project_id', selectedProject.project_id);
          formData.append('reference_id', selectedProject.project_id);
        }
      }

      await api.post('/file-manager/upload', formData);
      setSnackbar({ open: true, message: 'File uploaded', severity: 'success' });
      setUploadOpen(false);
      setUploadFile(null);
      setUploadDesc('');

      // Refresh
      if (tab.module === 'project') {
        if (selectedProject) loadProjectFiles(selectedProject);
        else loadProjects();
      }
      else if (tab.module === 'part_master') loadPartMaster();
      else if (tab.module === 'inventory') loadInventory();
    } catch {
      setSnackbar({ open: true, message: 'Upload failed', severity: 'error' });
    } finally {
      setUploading(false);
    }
  };

  // ── Helper: filter docs by search ─────────────────────────────
  const filterDocs = (docs: DocItem[]) => {
    if (!search) return docs;
    const q = search.toLowerCase();
    return docs.filter(d =>
      (d.file_name || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q) ||
      (d.document_type || '').toLowerCase().includes(q)
    );
  };

  // ── Render: Project Documents (project list → file tables) ──
  const renderProjectDocuments = () => {
    if (loading) {
      return (
        <Box sx={{ p: 3 }}>
          {[...Array(5)].map((_, i) => <Skeleton key={i} height={48} sx={{ mb: 1 }} />)}
        </Box>
      );
    }

    const q = search.toLowerCase();

    // ── Helper: render a file table (Uploaded or Generated) ──
    const _renderFileTable = (files: DocItem[], title: string) => {
      const filtered = q
        ? files.filter(f => (f.file_name || '').toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q))
        : files;

      return (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: PRIMARY, mb: 1, px: 1 }}>
            {title} ({filtered.length})
          </Typography>
          <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.7, px: 1.2, borderBottom: '1px solid #f0f0f0' } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.06) }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', width: 50 }}>S.No</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase' }}>File Name</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', width: 120 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', width: 120 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', width: 90 }}>Size</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', width: 130, textAlign: 'center' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary', fontSize: '0.82rem' }}>
                      No {title.toLowerCase()} yet
                    </TableCell>
                  </TableRow>
                ) : filtered.map((doc, idx) => (
                  <TableRow key={doc.id} hover>
                    <TableCell sx={{ fontSize: '0.78rem', color: '#6b7280' }}>{idx + 1}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FileIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{doc.file_name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', color: '#6b7280', textTransform: 'capitalize' }}>
                      {(doc.document_type || '').replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>
                      {doc.created_at ? dayjs(doc.created_at).format('DD MMM YYYY') : '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{formatBytes(doc.size)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="View">
                          <IconButton size="small" onClick={() => handleView(doc.id)} sx={{ color: PRIMARY }}>
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download">
                          <IconButton size="small" onClick={() => handleDownload(doc.id, doc.file_name)} sx={{ color: PRIMARY }}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => handleDelete(doc.id)} sx={{ color: 'error.main' }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      );
    };

    // ── PROJECT DETAIL VIEW (inside a project) ──
    if (selectedProject) {
      const docsInSection = projectDocs.filter(doc => getSection(doc.document_type) === selectedProjectSection);
      const filteredDocs = q
        ? docsInSection.filter(doc =>
            (doc.file_name || '').toLowerCase().includes(q) ||
            (doc.description || '').toLowerCase().includes(q) ||
            (doc.document_type || '').toLowerCase().includes(q)
          )
        : docsInSection;

      return (
        <Box>
          <Box sx={{ px: 3, pt: 2, pb: 1 }}>
            <Breadcrumbs separator={<ChevRightIcon fontSize="small" />} sx={{ fontSize: '0.85rem' }}>
              <Link
                component="button"
                underline="hover"
                sx={{ fontSize: '0.85rem', color: 'text.secondary', cursor: 'pointer' }}
                onClick={() => { setSelectedProject(null); setCurrentFolder(null); loadProjects(); }}
              >
                Project Documents
              </Link>
              <Link
                component="button"
                underline={selectedProjectSection ? "hover" : "none"}
                sx={{ fontWeight: selectedProjectSection ? 400 : 600, fontSize: '0.85rem', color: selectedProjectSection ? 'text.secondary' : PRIMARY, cursor: selectedProjectSection ? 'pointer' : 'default' }}
                onClick={() => { setSelectedProjectSection(null); setCurrentFolder(null); }}
              >
                {selectedProject.name}
              </Link>
              {selectedProjectSection && (
                <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: PRIMARY }}>
                  {selectedProjectSection}
                </Typography>
              )}
            </Breadcrumbs>
          </Box>

          <Box sx={{ px: 3, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Button
              size="small"
              startIcon={<BackIcon />}
              onClick={() => {
                if (selectedProjectSection) {
                  setSelectedProjectSection(null);
                  setCurrentFolder(null);
                } else {
                  setSelectedProject(null);
                  setCurrentFolder(null);
                  loadProjects();
                }
              }}
              sx={{ color: 'text.secondary', textTransform: 'none' }}
            >
              Back
            </Button>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
              {selectedProjectSection 
                ? `${projectDocs.filter(doc => getSection(doc.document_type) === selectedProjectSection).length} document(s)`
                : `${projectDocs.length} total document(s)`}
            </Typography>
          </Box>

          {!selectedProjectSection ? (
            <Box
              component="ol"
              sx={{
                px: 4,
                pb: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                m: 0,
              }}
            >
              {PROJECT_SUBFOLDERS.map(section => {
                const count = projectDocs.filter(doc => getSection(doc.document_type) === section).length;
                return (
                  <Box component="li" key={section} sx={{ pl: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FolderOpenIcon sx={{ color: '#f0a500', fontSize: 20, flexShrink: 0 }} />
                      <Link
                        component="button"
                        underline="hover"
                        onClick={() => handleProjectSectionChange(section)}
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          color: 'text.secondary',
                          textAlign: 'left',
                        }}
                      >
                        {section} ({count})
                      </Link>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Box sx={{ px: 2, pb: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: PRIMARY, mb: 1 }}>
                {selectedProjectSection}
              </Typography>
              <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Table size="small" sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { py: 0.75, px: 1.2, borderBottom: '1px solid #f0f0f0' } }}>
                  <TableHead>
                  <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.06) }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', width: 55 }}>S.No</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', width: 90 }}>Version</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', width: 110 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', width: 105 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', width: 115 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', width: 90 }}>Size</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', width: 125, textAlign: 'center' }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredDocs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary', fontSize: '0.82rem' }}>
                        No documents in {selectedProjectSection}
                      </TableCell>
                    </TableRow>
                  ) : filteredDocs.map((doc, idx) => (
                    <TableRow key={doc.id} hover>
                      <TableCell sx={{ fontSize: '0.78rem', color: '#6b7280' }}>{idx + 1}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                          <FileIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.description || doc.file_name}
                            </Typography>
                            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.file_name}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700 }}>V{doc.version || 1}</TableCell>
                      <TableCell>{statusChip(doc.status || 'draft')}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', textTransform: 'capitalize' }}>
                        {(doc.file_type || 'uploaded').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>
                        {doc.created_at ? dayjs(doc.created_at).format('DD MMM YYYY') : '-'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{formatBytes(doc.size)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Tooltip title="View">
                            <IconButton size="small" onClick={() => handleView(doc.id)} sx={{ color: PRIMARY }}>
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Download">
                            <IconButton size="small" onClick={() => handleDownload(doc.id, doc.file_name)} sx={{ color: PRIMARY }}>
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={() => handleDelete(doc.id)} sx={{ color: 'error.main' }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
          )}
        </Box>
      );
    }

    // ── PROJECT LIST VIEW (root) ──
    const filteredProjects = q
      ? projectFolders.filter(p => p.name.toLowerCase().includes(q))
      : projectFolders;

    return (
      <Box>
        <Box sx={{ px: 3, pt: 2, pb: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: PRIMARY }}>
            Projects
          </Typography>
        </Box>

        {filteredProjects.length > 0 ? (
          <TableContainer sx={{ mx: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, width: 'auto' }}>
            <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.7, px: 1.2, borderBottom: '1px solid #f0f0f0' } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8f9fa' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', width: 50 }}>S.No</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase' }}>Project</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', width: 90, textAlign: 'center' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredProjects.map((proj, idx) => (
                  <TableRow
                    key={proj.prefix}
                    hover
                    onClick={() => loadProjectFiles(proj)}
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: alpha(PRIMARY, 0.06) } }}
                  >
                    <TableCell>
                      <Typography sx={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 500 }}>{idx + 1}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FolderOpenIcon sx={{ color: '#f0a500', fontSize: 20, flexShrink: 0 }} />
                        <Typography sx={{ fontWeight: 600, fontSize: '0.82rem', color: '#1a1a2e' }}>
                          {proj.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.3, justifyContent: 'center' }}>
                        <Tooltip title="Open" arrow>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); loadProjectFiles(proj); }} sx={{ color: PRIMARY, p: 0.3 }}>
                            <ViewIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
            <FolderOpenIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', fontWeight: 500 }}>
              {q ? 'No matching projects' : 'No project files yet'}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', mt: 0.5 }}>
              {q ? `No results for "${search}"` : 'Files will appear here when documents are uploaded or generated for projects'}
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  // ── Render: Procurement Documents (RFQ + PO tables) ──────────
  const renderProcurementDocs = () => {
    if (loading) {
      return (
        <Box sx={{ p: 3 }}>
          {[...Array(5)].map((_, i) => <Skeleton key={i} height={48} sx={{ mb: 1 }} />)}
        </Box>
      );
    }

    const q = search.toLowerCase();
    const filteredRfqs = q
      ? procRfqs.filter(r =>
          (r.rfq_number || '').toLowerCase().includes(q) ||
          (r.vendor?.vendor_name || '').toLowerCase().includes(q) ||
          (r.material_category || '').toLowerCase().includes(q)
        )
      : procRfqs;
    const filteredPos = q
      ? procPos.filter(p =>
          (p.po_number || '').toLowerCase().includes(q) ||
          (p.vendor?.vendor_name || '').toLowerCase().includes(q) ||
          (p.material_category || '').toLowerCase().includes(q)
        )
      : procPos;

    return (
      <Box sx={{ px: 2, pt: 2 }}>
        {/* Pill-style sub-tabs matching Procurement module */}
        <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: alpha(PRIMARY, 0.04), borderRadius: '12px', border: '1px solid', borderColor: alpha(PRIMARY, 0.12), mb: 2, width: 'fit-content' }}>
          {[
            { label: 'RFQ', icon: <FileIcon sx={{ fontSize: 15 }} />, count: procRfqs.length },
            { label: 'PO to Vendor', icon: <ReceiptIcon sx={{ fontSize: 15 }} />, count: procPos.length },
          ].map((t, i) => (
            <Button
              key={t.label}
              size="small"
              startIcon={t.icon}
              onClick={() => setProcSubTab(i as 0 | 1)}
              sx={{
                textTransform: 'none', fontWeight: 600, fontSize: '0.82rem', borderRadius: '10px',
                px: 2, py: 0.8, minWidth: 'auto',
                ...(procSubTab === i
                  ? { bgcolor: PRIMARY, color: '#fff', boxShadow: `0 2px 6px ${alpha(PRIMARY, 0.3)}`, '&:hover': { bgcolor: alpha(PRIMARY, 0.9) } }
                  : { color: 'text.secondary', '&:hover': { bgcolor: alpha(PRIMARY, 0.08), color: 'text.primary' } }),
              }}
            >
              {t.label} ({t.count})
            </Button>
          ))}
        </Box>

        {/* RFQ Documents Table */}
        {procSubTab === 0 && (
          <>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: PRIMARY, mb: 1.5 }}>
              RFQ Documents
            </Typography>
            <TableContainer sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.06) }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 50 }}>S.No</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 120 }}>RFQ No</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: '28%' }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: '18%' }}>Vendor</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 100 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 90 }}>Document</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRfqs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No RFQ documents
                      </TableCell>
                    </TableRow>
                  ) : filteredRfqs.map((r: any, i: number) => {
                    const src = r.line_items?.[0] || r;
                    const dims = src.dimensions;
                    let dimStr = '';
                    if (dims && typeof dims === 'object') {
                      const vals: string[] = [];
                      for (const k of ['length','width','height','thickness','diameter','outer_diameter','inner_diameter','across_flats','side']) {
                        if ((dims as any)[k]) vals.push(String((dims as any)[k]));
                      }
                      if (vals.length) {
                        const unit = (dims as any).unit_system === 'imperial' ? '"' : ((dims as any).unit_system === 'metric' ? ' mm' : '');
                        dimStr = unit === '"' ? vals.map(v => `${v}"`).join(' x ') : vals.join(' x ') + unit;
                      }
                    } else if (typeof dims === 'string') {
                      dimStr = dims;
                    }
                    const desc = [src.material_category, src.material_grade, src.condition, dimStr]
                      .filter(Boolean).join(' | ') || '—';
                    const qty = r.line_items && r.line_items.length > 1
                      ? r.line_items.map((li: any) => li.quantity).join(', ')
                      : r.quantity || '—';
                    return (
                      <TableRow key={r.id} hover>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{i + 1}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600, color: PRIMARY }}>{r.rfq_number}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={desc}>{desc}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.vendor?.vendor_name || ''}>{r.vendor?.vendor_name || '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem' }}>{r.date ? dayjs(r.date).format('DD/MM/YYYY') : '—'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="View">
                              <IconButton
                                size="small"
                                onClick={() => handleProcView('rfq', r.id)}
                                sx={{ color: PRIMARY }}
                              >
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Download PDF">
                              <IconButton
                                size="small"
                                onClick={() => handleProcDownload('rfq', r.id, r.rfq_number)}
                                sx={{ color: PRIMARY }}
                              >
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* PO to Vendor Documents Table */}
        {procSubTab === 1 && (
          <>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: PRIMARY, mb: 1.5 }}>
              PO to Vendor Documents
            </Typography>
            <TableContainer sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.06) }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 50 }}>S.No</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 130 }}>PO Number</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: '30%' }}>Material</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: '20%' }}>Vendor</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 100 }}>PO Date</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 90 }}>Document</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No PO documents
                      </TableCell>
                    </TableRow>
                  ) : filteredPos.map((p: any, i: number) => {
                    const poDims = p.dimensions;
                    let poDimStr = '';
                    if (poDims && typeof poDims === 'object') {
                      const vals: string[] = [];
                      for (const k of ['length','width','height','thickness','diameter','outer_diameter','inner_diameter','across_flats','side']) {
                        if ((poDims as any)[k]) vals.push(String((poDims as any)[k]));
                      }
                      if (vals.length) {
                        const unit = (poDims as any).unit_system === 'imperial' ? '"' : ((poDims as any).unit_system === 'metric' ? ' mm' : '');
                        poDimStr = unit === '"' ? vals.map(v => `${v}"`).join(' x ') : vals.join(' x ') + unit;
                      }
                    } else if (typeof poDims === 'string') {
                      poDimStr = poDims;
                    }
                    const matDesc = [p.material_category, p.material_grade, p.condition, poDimStr].filter(Boolean).join(' | ') || p.part_name || '—';
                    return (
                      <TableRow key={p.id} hover>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{i + 1}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600, color: PRIMARY }}>{p.po_number}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={matDesc}>{matDesc}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.vendor?.vendor_name || ''}>{p.vendor?.vendor_name || '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem' }}>{p.po_date ? dayjs(p.po_date).format('DD/MM/YYYY') : '—'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="View">
                              <IconButton
                                size="small"
                                onClick={() => handleProcView('po', p.id)}
                                sx={{ color: PRIMARY }}
                              >
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Download PDF">
                              <IconButton
                                size="small"
                                onClick={() => handleProcDownload('po', p.id, p.po_number)}
                                sx={{ color: PRIMARY }}
                              >
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    );
  };

  // ── Render: Part Master flat table ────────────────────────────
  const renderPartMasterTable = () => {
    if (loading) return <Box sx={{ p: 3 }}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={48} sx={{ mb: 1 }} />)}</Box>;
    // Filter parts by search query
    const filtered = search
      ? partDocs.filter(p => {
          const q = search.toLowerCase();
          return (p.part_name || '').toLowerCase().includes(q) ||
            (p.part_number || '').toLowerCase().includes(q) ||
            (p.part_id_seq || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            (p.client?.client_name || '').toLowerCase().includes(q);
        })
      : partDocs;
    return (
      <TableContainer sx={{ mx: 2, mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, width: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.06) }}>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 50 }}>S.No</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 120 }}>Part ID</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 140 }}>Client</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Uploaded Drawing</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 130 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No parts found</TableCell></TableRow>
            ) : filtered.map((entry, i) => (
              <TableRow key={entry.part_id} hover>
                <TableCell sx={{ fontSize: '0.8rem' }}>{i + 1}</TableCell>
                <TableCell sx={{ fontSize: '0.8rem' }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{entry.part_name}</Typography>
                    {entry.part_number && <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{entry.part_number}</Typography>}
                  </Box>
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{entry.part_id_seq || '—'}</TableCell>
                <TableCell sx={{ fontSize: '0.8rem' }}>{entry.client?.client_name || '—'}</TableCell>
                <TableCell>
                  {entry.document ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileIcon sx={{ fontSize: 16, color: PRIMARY }} />
                      <Typography sx={{ fontSize: '0.78rem' }}>{entry.document.file_name}</Typography>
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: '0.78rem', color: 'text.disabled', fontStyle: 'italic' }}>No drawing uploaded</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {entry.document ? (
                    entry.document.id ? (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="View"><IconButton size="small" onClick={() => handleView(entry.document!.id)} sx={{ color: PRIMARY }}><ViewIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Download"><IconButton size="small" onClick={() => handleDownload(entry.document!.id, entry.document!.file_name)} sx={{ color: PRIMARY }}><DownloadIcon fontSize="small" /></IconButton></Tooltip>
                      </Box>
                    ) : entry.drawing_url ? (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="View">
                          <IconButton size="small" onClick={() => openWithAuth(`${getApiBaseUrl()}/file-manager/view-by-path?file=${encodeURIComponent(entry.drawing_url!)}`)} sx={{ color: PRIMARY }}>
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download">
                          <IconButton size="small" onClick={() => handleDownload(entry.document!.id, entry.drawing_url!.split('/').pop() || 'drawing')} sx={{ color: PRIMARY }}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>—</Typography>
                    )
                  ) : (
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>—</Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  // ── Render: Inventory flat table ──────────────────────────────
  const renderInventoryTable = () => {
    if (loading) return <Box sx={{ p: 3 }}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={48} sx={{ mb: 1 }} />)}</Box>;
    const docs = filterDocs(inventoryDocs);
    return (
      <TableContainer sx={{ mx: 2, mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, width: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.06) }}>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 50 }}>S.No</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 140 }}>Material Stock ID</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 120 }}>Stock status</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Uploaded COC</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 130 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No inventory documents</TableCell></TableRow>
            ) : docs.map((doc, i) => {
              return (
                <TableRow key={doc.id} hover>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{i + 1}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{doc.stock?.part_description || doc.description || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{doc.stock?.stock_id || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{doc.stock?.status || '—'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography sx={{ fontSize: '0.78rem' }}>{doc.file_name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="View"><IconButton size="small" onClick={() => handleView(doc.id)} sx={{ color: PRIMARY }}><ViewIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Download"><IconButton size="small" onClick={() => handleDownload(doc.id, doc.file_name)} sx={{ color: PRIMARY }}><DownloadIcon fontSize="small" /></IconButton></Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  // ── Main render ───────────────────────────────────────────────
  const currentModule = ROOT_TABS[activeTab]?.module;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafb' }}>
      {/* Header */}
      <Box sx={{
        px: 3, pt: 3, pb: 1.5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: 'var(--bg-surface)', borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em', color: '#1a1a2e' }}>
            File Manager
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mt: 0.3 }}>
            Central document storage — all files in one place
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            placeholder={currentModule === 'project' ? 'Search project, file, client…' : 'Search files…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
            }}
            sx={{ width: 240, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.82rem' } }}
          />
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => {
              const docType = currentModule === 'project'
                ? (SECTION_TO_UPLOAD_DOC_TYPE[selectedProjectSection || ''] || 'upload')
                : 'upload';
              setUploadDocType(docType);
              setCurrentFolder(currentModule === 'project' ? getProjectSectionFolder(selectedProjectSection || '') : currentFolder);
              setUploadOpen(true);
            }}
            sx={{
              bgcolor: PRIMARY, textTransform: 'none', fontWeight: 600, borderRadius: 2,
              '&:hover': { bgcolor: '#5ce0ff' },
            }}
          >
            Upload
          </Button>
          <Tooltip title="Refresh">
            <IconButton
              onClick={() => {
                fetchTree();
                if (currentModule === 'procurement') loadProcurementDocs();
                else if (currentModule === 'part_master') loadPartMaster();
                else if (currentModule === 'inventory') loadInventory();
                else if (currentModule === 'project') {
                  if (selectedProject) loadProjectFiles(selectedProject);
                  else loadProjects();
                }
              }}
              sx={{ color: 'text.secondary' }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ px: 3, bgcolor: 'var(--bg-surface)' }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => { setActiveTab(v); setSearch(''); }}
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none', fontWeight: 600, fontSize: '0.85rem', minHeight: 44,
              color: '#6b7280', transition: 'color 0.2s',
              '&:hover': { color: PRIMARY },
            },
            '& .Mui-selected': { color: `${PRIMARY} !important`, fontWeight: 700 },
            '& .MuiTabs-indicator': { backgroundColor: PRIMARY, height: 3, borderRadius: '3px 3px 0 0' },
          }}
        >
          {ROOT_TABS.map(t => <Tab key={t.path} label={t.label} />)}
        </Tabs>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Box sx={{ bgcolor: 'var(--bg-surface)', borderRadius: 2, border: '1px solid', borderColor: 'divider', minHeight: 300 }}>
        {currentModule === 'project' && renderProjectDocuments()}
        {currentModule === 'procurement' && renderProcurementDocs()}
        {currentModule === 'part_master' && renderPartMasterTable()}
        {currentModule === 'inventory' && renderInventoryTable()}
        </Box>
      </Box>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#1a1a2e', pb: 0.5 }}>Upload File</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadIcon />}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              {uploadFile ? uploadFile.name : 'Choose File'}
              <input type="file" hidden onChange={e => setUploadFile(e.target.files?.[0] || null)} />
            </Button>
            <TextField
              label="Description"
              size="small"
              value={uploadDesc}
              onChange={e => setUploadDesc(e.target.value)}
              fullWidth
            />
            <TextField
              label="Document Type"
              size="small"
              value={uploadDocType}
              onChange={e => setUploadDocType(e.target.value)}
              fullWidth
              helperText="e.g. drawing, coc, quotation, invoice, upload"
            />
            {currentFolder && (
              <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                Uploading to: <strong>{currentFolder.path}</strong>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={!uploadFile || uploading}
            startIcon={uploading ? <CircularProgress size={16} /> : undefined}
            sx={{ bgcolor: PRIMARY, textTransform: 'none', '&:hover': { bgcolor: '#166354' } }}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default FileManagerPage;
