import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ShoppingCart, Upload, CheckCircle2, FileText, Info } from 'lucide-react';
import {
  Visibility as ViewIcon,
  Delete as RemoveIcon,
  Add as AddIcon,
  InsertDriveFile as FileIconMui,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { Project, SalesOrder } from '../../types';
import api, { getBackendBaseUrl } from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';
import { viewDocument as viewDocumentById, viewFileByPath, buildProjectFileName } from '../../utils/documentUtils';
import {
  UI, TabContainer, AccordionSection, StatusBadge, InfoBanner,
  Separator, EnhancedNavFooter, AnimatedSection, MotionBox, inputSx,
} from '../UIComponents';

interface SalesOrderTabProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
  hasVendorSupplied?: boolean;
}

const SalesOrderTab: React.FC<SalesOrderTabProps> = ({ project, onUpdate, onBack, onNext, hasVendorSupplied }) => {
  const [salesOrder, setSalesOrder] = useState<SalesOrder | null>(null);
  const { showError, showSuccess } = useNotification();
  const [customerPo, setCustomerPo] = useState('');
  const [poDate, setPoDate] = useState('');
  const [scheduledDeliveryDate, setScheduledDeliveryDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Normalise any ISO datetime or date string to the YYYY-MM-DD format
   *  required by <input type="date"> */
  const toDateInput = (value: string | null | undefined): string => {
    if (!value) return '';
    // Handles both "2026-04-30T..." and plain "2026-04-30"
    return value.slice(0, 10);
  };

  useEffect(() => {
    loadSalesOrder();
    loadPoDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const loadSalesOrder = async () => {
    try {
      const response = await api.get(`/sales-orders/project/${project.id}`);
      const data = response.data?.data ?? null;
      setSalesOrder(data?.id ? data : null);
      if (data?.customer_po_number) {
        setCustomerPo(data.customer_po_number);
      }
      if (data?.accepted_date) {
        setPoDate(toDateInput(data.accepted_date));
      }
      if (data?.delivery_date) {
        setScheduledDeliveryDate(toDateInput(data.delivery_date));
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        showError('Error loading purchase order');
      }
    }
  };

  const handleConfirmOrder = async () => {
    if (!customerPo.trim()) {
      showError('Please enter Customer PO number');
      return;
    }
    try {
      const response = await api.post(`/sales-orders/project/${project.id}`, {
        customer_po_number: customerPo,
        accepted_date: poDate,
        delivery_date: scheduledDeliveryDate,
      });
      const data = response.data?.data ?? response.data;
      setSalesOrder(data);
      showSuccess('Order confirmed!');
      await onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error confirming order');
    }
  };

  const [poFiles, setPoFiles] = useState<{ id?: string; name: string; path?: string }[]>([]);
  const [uploadingPo, setUploadingPo] = useState(false);
  const [poFilesExpanded, setPoFilesExpanded] = useState(false);

  const loadPoDocuments = async () => {
    try {
      const res = await api.get(`/documents/project/${project.id}`);
      const docs = res.data?.data || res.data || [];
      const poDocs = docs.filter((d: any) => d.document_type === 'purchase_order');
      setPoFiles(poDocs.map((d: any) => ({
        id: d.id,
        name: d.file_name || d.file_path?.split('/').pop() || 'PO Document',
        path: d.file_path ? (d.file_path.startsWith('http') ? d.file_path : `/uploads/${d.file_path.split('/uploads/').pop() || d.file_path}`) : undefined,
      })));
    } catch { /* ignore */ }
  };

  const handleRemovePoFile = async (idx: number) => {
    const file = poFiles[idx];
    if (!file) return;
    if (file.id) {
      try {
        await api.delete(`/documents/${file.id}`);
        showSuccess('Document deleted');
      } catch (err: any) {
        showError(err.response?.data?.message || 'Error deleting document');
        return;
      }
    }
    setPoFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setUploadingPo(true);
    for (let i = 0; i < files.length; i++) {
      const renamedFile = buildProjectFileName(project.project_number, files[i], 'po');
      const formData = new FormData();
      formData.append('po_document', renamedFile);
      try {
        const response = await api.post(`/sales-orders/project/${project.id}/upload-po`, formData);
        const data = response.data?.data ?? response.data;
        setSalesOrder(data);
      } catch (err: any) {
        showError(err.response?.data?.message || 'Error uploading document');
      }
    }
    showSuccess(`${files.length} PO document(s) uploaded successfully`);
    setUploadingPo(false);
    loadSalesOrder();
    loadPoDocuments();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canConfirm = project.status === 'quoted';
  const isConfirmed = ['order_confirmed', 'in_production', 'inspected', 'shipped', 'closed'].includes(project.status);

  const handleViewFile = async (file: { id?: string; name: string; path?: string }) => {
    try {
      if (file.id) {
        await viewDocumentById(file.id);
      } else if (file.path) {
        const base = getBackendBaseUrl();
        const url = file.path.startsWith('http') ? file.path : `${base}${file.path}`;
        await viewFileByPath(url);
      }
    } catch {
      showError('Failed to view document');
    }
  };

  const handleNext = async () => {
    const poValue = salesOrder?.customer_po_number || customerPo.trim();
    if (!poValue) {
      showError('Please enter the Customer PO Number before proceeding.');
      return;
    }
    try {
      const response = await api.post(`/sales-orders/project/${project.id}`, {
        customer_po_number: poValue,
        accepted_date: poDate,
        delivery_date: scheduledDeliveryDate,
      });
      const data = response.data?.data ?? response.data;
      setSalesOrder(data);
      if (data?.delivery_date) setScheduledDeliveryDate(toDateInput(data.delivery_date));
      if (data?.accepted_date) setPoDate(toDateInput(data.accepted_date));
      if (!isConfirmed) showSuccess('Order confirmed!');
      await onUpdate();
    } catch (err: any) {
      const msg = (err.response?.data?.message || '').toLowerCase();
      if (!msg.includes('already exists') && !msg.includes('order_confirmed')) {
        if (!isConfirmed) {
          showError(err.response?.data?.message || 'Please confirm the order before proceeding to Work Order.');
          return;
        }
      } else {
        await onUpdate();
      }
    }
    onNext?.();
  };

  return (
    <TabContainer>
      <AnimatedSection>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: '12px',
            backgroundColor: 'rgba(0,200,255,0.10)',
            border: '1px solid rgba(0,200,255,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShoppingCart size={22} color="#00c8ff" />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              PO from Client
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: '#6B7280' }}>
              Manage and confirm customer purchase orders
            </Typography>
          </Box>
        </Box>
      </AnimatedSection>

      <AnimatedSection delay={0.05}>
        {!canConfirm && !isConfirmed && (
          <MotionBox initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            <InfoBanner variant="info">
              A quotation must be sent before the order can be confirmed.
            </InfoBanner>
          </MotionBox>
        )}
      </AnimatedSection>

      <AnimatedSection delay={0.1}>
        {/* Two-column layout: Left = Order Info, Right = PO Documents + Confirm */}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: { xs: 'wrap', md: 'nowrap' }, alignItems: 'stretch' }}>
          {/* LEFT COLUMN — Order Confirmation */}
          <Box sx={{ flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', '& > *': { flex: 1 } }}>
            <AccordionSection
              title="Order Confirmation"
              subtitle="Enter customer purchase order details"
              accentColor="#0891B2"
            >
              {/* Customer PO Number */}
              <Box sx={{ mb: 3 }}>
                <Typography sx={{
                  fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-primary)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1,
                }}>
                  Customer PO Number
                </Typography>
                <TextField
                  fullWidth
                  value={customerPo}
                  onChange={(e) => setCustomerPo(e.target.value)}
                  placeholder="Enter customer purchase order number"
                  variant="outlined"
                  sx={{
                    ...inputSx(),
                    '& .MuiOutlinedInput-root': {
                      ...inputSx()['& .MuiOutlinedInput-root'],
                      background: 'var(--bg-surface)',
                      '&:hover fieldset': { borderColor: '#0891B2' },
                      '&.Mui-focused fieldset': { borderColor: '#0891B2', borderWidth: 2 },
                    },
                  }}
                />
              </Box>

              {/* PO Date */}
              <Box sx={{ mb: 3 }}>
                <Typography sx={{
                  fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-primary)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1,
                }}>
                  PO Date
                </Typography>
                <TextField
                  fullWidth
                  type="date"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  variant="outlined"
                  sx={{
                    ...inputSx(),
                    '& .MuiOutlinedInput-root': {
                      ...inputSx()['& .MuiOutlinedInput-root'],
                      background: 'var(--bg-surface)',
                      '&:hover fieldset': { borderColor: '#0891B2' },
                      '&.Mui-focused fieldset': { borderColor: '#0891B2', borderWidth: 2 },
                    },
                  }}
                />
              </Box>

              {/* Scheduled Delivery Date */}
              <Box sx={{ mb: 3 }}>
                <Typography sx={{
                  fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-primary)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1,
                }}>
                  Scheduled Delivery Date
                </Typography>
                <TextField
                  fullWidth
                  type="date"
                  value={scheduledDeliveryDate}
                  onChange={(e) => setScheduledDeliveryDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  variant="outlined"
                  sx={{
                    ...inputSx(),
                    '& .MuiOutlinedInput-root': {
                      ...inputSx()['& .MuiOutlinedInput-root'],
                      background: 'var(--bg-surface)',
                      '&:hover fieldset': { borderColor: '#0891B2' },
                      '&.Mui-focused fieldset': { borderColor: '#0891B2', borderWidth: 2 },
                    },
                  }}
                />
              </Box>

              {/* Confirmed State (shown inline when confirmed) */}
              {isConfirmed && (
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  bgcolor: alpha(UI.primary, 0.04),
                  borderRadius: UI.radiusSm,
                  border: `1px solid ${alpha(UI.primary, 0.15)}`,
                  px: 2.5, py: 2,
                }}>
                  <Box sx={{
                    width: 36, height: 36, borderRadius: UI.radiusXs,
                    bgcolor: alpha(UI.primary, 0.1),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <CheckCircle2 size={18} color={UI.primary} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: UI.primary }}>
                      Order has been confirmed
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: UI.textMuted, mt: 0.25 }}>
                      This project is now progressing through production.
                    </Typography>
                  </Box>
                </Box>
              )}
            </AccordionSection>
          </Box>

          {/* RIGHT COLUMN — PO Documents + Confirm Button */}
          <Box sx={{ flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', '& > *': { flex: 1 } }}>
            <AccordionSection
              icon={<FileText size={16} />}
              title="PO Document"
              subtitle="Upload customer purchase order files"
              accentColor="#0891B2"
            >
              {/* PO Document Upload */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Typography sx={{
                    fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    Uploaded Files
                  </Typography>
                  {(() => {
                    const count = poFiles.length;
                    if (count > 2) {
                      return (
                        <Box onClick={() => setPoFilesExpanded(!poFilesExpanded)} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                          <Typography sx={{ fontSize: 10, color: UI.primary, fontWeight: 600 }}>
                            {poFilesExpanded ? 'Collapse' : `+${count - 2} more`}
                          </Typography>
                          {poFilesExpanded ? <ExpandLessIcon sx={{ fontSize: 14, color: UI.primary }} /> : <ExpandMoreIcon sx={{ fontSize: 14, color: UI.primary }} />}
                        </Box>
                      );
                    }
                    return null;
                  })()}
                </Box>
                <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" hidden aria-label="Upload PO file" title="Upload PO file" />

                {/* File list */}
                {(() => {
                  const visibleFiles = poFilesExpanded ? poFiles : poFiles.slice(0, 2);

                  if (poFiles.length === 0) {
                    return (
                      <Box
                        onClick={() => fileInputRef.current?.click()}
                        sx={{
                          border: '2px dashed #CBD5E1', borderRadius: UI.radiusSm, px: 2.5, py: 2,
                          textAlign: 'center', cursor: 'pointer', backgroundColor: '#FAFAFA',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          '&:hover': { borderColor: UI.primary, backgroundColor: alpha(UI.primary, 0.03) },
                          transition: 'all 0.2s',
                        }}
                      >
                        {uploadingPo ? (
                          <CircularProgress size={22} sx={{ color: UI.primary }} />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                            <Upload size={18} />
                            <Typography sx={{ fontSize: 14, fontWeight: 600, color: UI.primary }}>
                              Click to upload PO documents
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    );
                  }

                  return (
                    <Box sx={{ border: `1px solid ${UI.border}`, borderRadius: UI.radiusSm, overflow: 'hidden', minHeight: 56 }}>
                      <Box sx={{ maxHeight: poFilesExpanded ? 260 : 130, overflowY: 'auto', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--text-muted)', borderRadius: 2 } }}>
                        {visibleFiles.map((f, idx) => (
                          <Box key={`${f.name}-${idx}`} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderBottom: idx < visibleFiles.length - 1 ? '1px solid var(--border-subtle)' : 'none', '&:hover': { backgroundColor: 'var(--bg-surface-2)' }, cursor: 'pointer' }} onClick={() => handleViewFile(f)}>
                            <FileIconMui sx={{ fontSize: 22, color: UI.primary, flexShrink: 0 }} />
                            <Tooltip title={f.name}>
                              <Typography sx={{ fontSize: 13, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, '&:hover': { color: UI.primary } }}>
                                {f.name.length > 40 ? f.name.slice(0, 37) + '...' : f.name}
                              </Typography>
                            </Tooltip>
                            <Tooltip title="View">
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleViewFile(f); }} sx={{ p: 0.75, color: '#64748B', '&:hover': { color: UI.primary } }}>
                                <ViewIcon sx={{ fontSize: 20 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove">
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleRemovePoFile(idx); }} sx={{ p: 0.75, color: 'var(--text-muted)', '&:hover': { color: '#EF4444' } }}>
                                <RemoveIcon sx={{ fontSize: 20 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        ))}
                      </Box>
                      <Box
                        onClick={() => fileInputRef.current?.click()}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                          py: 1.25, cursor: 'pointer', borderTop: `1px solid ${UI.border}`, backgroundColor: '#FAFAFA',
                          '&:hover': { backgroundColor: alpha(UI.primary, 0.04) }, transition: 'all 0.2s',
                        }}
                      >
                        {uploadingPo ? <CircularProgress size={16} sx={{ color: UI.primary }} /> : (
                          <>
                            <AddIcon sx={{ fontSize: 18, color: UI.primary }} />
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: UI.primary }}>Add More</Typography>
                          </>
                        )}
                      </Box>
                    </Box>
                  );
                })()}
              </Box>

              <Separator />

              {/* Confirm Button */}
              <AnimatePresence mode="wait">
                {canConfirm && (
                  <motion.div
                    key="confirm-btn"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                  >
                    <Button
                      variant="contained"
                      startIcon={<CheckCircle2 size={16} />}
                      onClick={handleConfirmOrder} fullWidth
                      sx={{
                        textTransform: 'none', fontWeight: 600, fontSize: '0.875rem',
                        borderRadius: UI.radiusSm, py: 1.5,
                        background: UI.primary,
                        boxShadow: `0 2px 10px ${alpha(UI.primary, 0.15)}`,
                        '&:hover': {
                          background: UI.primaryDark,
                          boxShadow: `0 4px 16px ${alpha(UI.primary, 0.25)}`,
                          transform: 'translateY(-1px)',
                        },
                        transition: 'all 0.2s ease',
                      }}
                    >
                      Confirm Order
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </AccordionSection>
          </Box>
        </Box>
      </AnimatedSection>

      <EnhancedNavFooter
        onBack={onBack}
        onNext={handleNext}
        backLabel="Back to Quotation"
        nextLabel={hasVendorSupplied ? 'Next: PO to Vendor' : 'Next: Work Order'}
        nextDisabled={!onNext}
      />
    </TabContainer>
  );
};

export default SalesOrderTab;
