import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  TextField,
  Button,
  Chip,
  FormControl,
  Select,
  MenuItem,
  IconButton,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Snackbar,
  Alert,
  Collapse,
} from '@mui/material';
import Stack from '@mui/material/Stack';
import {
  Add as AddIcon,
  PictureAsPdf as PdfIcon
} from '@mui/icons-material';
import { FileText, FileDown, Pencil, CheckCircle, Send, Trash2, Copy, ChevronUp, ChevronDown } from 'lucide-react';
import { Project } from '../../types';
import { UI, FieldLabel, FieldGroup, inputSx, textareaSx, selectSx, TabContainer, EnhancedNavFooter, AnimatedSection, SectionHeader } from '../UIComponents';
import invoiceService, { InvoiceData, InvoiceLineItem } from '../../services/invoiceService';
import { useConfiguratorParts } from '../../hooks/useConfiguratorParts';
import { diag } from '../../utils/diag';
import api from 'services/api';

/* â”€â”€â”€ Design tokens â”€â”€â”€â”€â”€â”€â”€â”€ */
const T = {
  primary: UI.primary,
  primaryLight: UI.primaryLight,
  primaryBg: UI.primaryBg,
  text: UI.textPrimary,
  textSec: UI.textSecondary,
  textMuted: UI.textMuted,
  border: UI.border,
  bg: UI.bg,
  white: UI.bgCard,
  danger: UI.danger,
  radius: UI.radiusSm,
};

/* â”€â”€â”€ Shared card & header styles â”€â”€â”€â”€â”€â”€â”€â”€ */
const cardSx = {
  bgcolor: T.white,
  border: `1px solid ${T.border}`,
  borderRadius: '14px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  mb: 2,
  px: 3,
  py: 2.5,
};
const sectionHeaderSx = {
  fontSize: 14,
  fontWeight: 600,
  color: '#374151',
  letterSpacing: '0.4px',
  textTransform: 'uppercase' as const,
  mb: 2,
};

const TAX_OPTIONS = [
  { label: 'Exempt (0%)', value: 'Exempt', pct: 0 },
  { label: 'GST 5%',  value: 'GST 5%',  pct: 5 },
  { label: 'GST 8%',  value: 'GST 8%',  pct: 8 },
  { label: 'GST 10%', value: 'GST 10%', pct: 10 },
  { label: 'GST 18%', value: 'GST 18%', pct: 18 },
  { label: 'Custom',  value: 'Custom',  pct: 0 },
];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Draft:     { bg: 'var(--border-subtle)', color: '#6B7280' },
  Sent:      { bg: '#E0F2FE', color: '#0369A1' },
  Paid:      { bg: '#e0e7ff', color: '#00c8ff' },
  Cancelled: { bg: '#FEF2F2', color: '#EF4444' },
};

interface InvoiceTabProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

/* â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const fmt = (n: number | string | undefined) => {
  const v = Number(n) || 0;
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const emptyLineItem = (): InvoiceLineItem => ({
  part: '', description: '', quantity: 1, unit_price: 0, line_total: 0,
});

const DEFAULT_TERMS = [
  { title: 'Delivery Timeline', body: 'As per purchase order requirements. Seller will notify Buyer of any delays.' },
  { title: 'Payment Terms', body: 'Net 30 days from invoice date. Payment via bank transfer.' },
  { title: 'Taxation', body: 'All prices are exclusive of applicable taxes unless stated otherwise. Buyer is responsible for all applicable taxes.' },
  { title: 'Confidentiality', body: 'Both parties agree to maintain confidentiality of all proprietary information exchanged in connection with this transaction.' },
];

/**
 * Coerce any terms_conditions value into the canonical {title,body}[] shape.
 * The backend autopopulate endpoint historically returns the raw
 * `sysSettings.invoiceTerms` string (newline-separated), which would crash
 * downstream `.map(...)` calls. We also defensively handle stale draft
 * invoices that were persisted with a string in the JSONB column.
 */
function normalizeTerms(value: unknown): { title: string; body: string }[] {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is { title?: unknown; body?: unknown } => v != null && typeof v === 'object')
      .map((v) => ({
        title: typeof v.title === 'string' ? v.title : '',
        body: typeof v.body === 'string' ? v.body : '',
      }));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((body) => ({ title: 'Term', body }));
  }
  return [];
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   INVOICE TAB â€” Two-panel layout like Estimation
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const InvoiceTab: React.FC<InvoiceTabProps> = ({ project, onUpdate, onBack, onNext }) => {
  /* â”€â”€â”€ State â”€â”€â”€â”€ */
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Active invoice being viewed/edited
  const [active, setActive] = useState<InvoiceData | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [form, setForm] = useState<Partial<InvoiceData>>({});

  // Toast
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' | 'info' } | null>(null);

  // Main panel collapse
  const [isMainPanelOpen, setIsMainPanelOpen] = useState(true);

  // set is downloading property
  const[isDownloading, setIsDownloading] = useState(false);

  // Line items collapse (expanded by default for direct use)
  const [lineItemsOpen, setLineItemsOpen] = useState(true);

  /* Configurator-driven BOM fallback. When the backend autopopulate endpoint
   * returns zero line items (typical for configurator-only projects with no
   * Estimate row), we synthesise invoice line items from the configurator
   * BOM so the invoice is not silently empty. The hook is module-cached so
   * tab switches don't re-run the pricing engine. */
  const { parts: configuratorParts, fromConfigurator } = useConfiguratorParts(project);

  const buildLineItemsFromConfigurator = useCallback((): InvoiceLineItem[] => {
    return configuratorParts.map((p) => {
      const qty = Number(p.quantity) || 0;
      const unit = Number(p.job_cost_per_unit) || 0;
      const lineTotal = Number(p.total_cost);
      return {
        part: p.drawing_part_no || p.job_description || '',
        description: p.job_description || '',
        quantity: qty,
        unit_price: unit,
        line_total: Number.isFinite(lineTotal) && lineTotal > 0 ? lineTotal : qty * unit,
      };
    });
  }, [configuratorParts]);

  // Inline section editing (view mode only)
  const [editingSection, setEditingSection] = useState<'payment_terms' | 'notes' | 'terms_conditions' | null>(null);
  const [sectionDraft, setSectionDraft] = useState<{
    payment_terms: string;
    notes: string;
    terms_conditions: { title: string; body: string }[];
  }>({ payment_terms: '', notes: '', terms_conditions: [] });
  const [savingSection, setSavingSection] = useState(false);

  /* â”€â”€â”€ Auto-open new invoice form â”€â”€â”€â”€ */
  const autoPopulateNew = useCallback(async () => {
    try {
      setCreating(true);
      const [data, sysRes] = await Promise.all([
        invoiceService.getAutoPopulatedData(project.id),
        api.get('/settings/system')
      ]);
      const sysSettings = sysRes.data?.data || {};

      // Coerce backend terms (string OR array) into the canonical array shape.
      // Fall back through: response â†’ system settings â†’ built-in defaults.
      let defaultTerms = normalizeTerms(data.terms_conditions);
      if (defaultTerms.length === 0) defaultTerms = normalizeTerms(sysSettings.invoiceTerms);
      if (defaultTerms.length === 0) defaultTerms = DEFAULT_TERMS;

      const notes = data.notes || sysSettings.invoiceNotes || '';
      const payment_terms = data.payment_terms || sysSettings.invoicePaymentTerms || '';

      // Configurator BOM fallback when backend returned no line items.
      const backendItems = Array.isArray(data.line_items) ? data.line_items : [];
      const lineItems = backendItems.length > 0
        ? backendItems
        : buildLineItemsFromConfigurator();
      if (backendItems.length === 0 && lineItems.length > 0) {
        diag('workflow', 'invoice items sourced from configurator', { count: lineItems.length, fromConfigurator });
      }

      setForm({
        ...data,
        project_id: project.id,
        invoice_type: 'Commercial',
        status: 'Draft',
        terms_conditions: defaultTerms,
        line_items: lineItems,
        notes,
        payment_terms
      });
      setIsEditMode(true);
      setActive(null);
    } catch {
      // silently fall back â€” user can still click New Invoice
    } finally {
      setCreating(false);
    }
  }, [project.id, buildLineItemsFromConfigurator, fromConfigurator]);

  /* â”€â”€â”€ Load â”€â”€â”€â”€ */
  const loadInvoices = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const data = await invoiceService.getByProjectId(project.id);
      const list = data || [];
      setInvoices(list);
      if (list.length > 0) {
        // Show the latest invoice in view mode
        setActive(list[0]);
      } else {
        // No invoices â€” auto-open the creation form immediately
        await autoPopulateNew();
      }
    } catch {
      setToast({ msg: 'Failed to load invoices', sev: 'error' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, autoPopulateNew]);

  useEffect(() => { loadInvoices(true); }, [loadInvoices]);

  /* â”€â”€â”€ Computed totals (for form in edit mode) â”€â”€â”€â”€ */
  const formItems = useMemo(
    () => (Array.isArray(form.line_items) ? form.line_items : []),
    [form.line_items]
  );
  const formSubtotal = useMemo(() => formItems.reduce((s, i) => s + (Number(i.line_total) || 0), 0), [formItems]);
  const formTaxPct = useMemo(() => form.tax_type === 'Exempt' ? 0 : (Number(form.tax_percent) || 0), [form.tax_type, form.tax_percent]);
  const formTax = useMemo(() => formSubtotal * (formTaxPct / 100), [formSubtotal, formTaxPct]);
  const formShipping = useMemo(() => Number(form.shipping_charges) || 0, [form.shipping_charges]);
  const formGrand = useMemo(() => formSubtotal + formTax + formShipping, [formSubtotal, formTax, formShipping]);

  /* â”€â”€â”€ Handlers â”€â”€â”€â”€ */
  const handleNewInvoice = async () => {
    try {
      setCreating(true);
      const [data, sysRes] = await Promise.all([
        invoiceService.getAutoPopulatedData(project.id),
        api.get('/settings/system')
      ]);
      const sysSettings = sysRes.data?.data || {};

      let defaultTerms = normalizeTerms(data.terms_conditions);
      if (defaultTerms.length === 0) defaultTerms = normalizeTerms(sysSettings.invoiceTerms);
      if (defaultTerms.length === 0) defaultTerms = DEFAULT_TERMS;

      const notes = data.notes || sysSettings.invoiceNotes || '';
      const payment_terms = data.payment_terms || sysSettings.invoicePaymentTerms || '';

      const backendItems = Array.isArray(data.line_items) ? data.line_items : [];
      const lineItems = backendItems.length > 0
        ? backendItems
        : buildLineItemsFromConfigurator();
      if (backendItems.length === 0 && lineItems.length > 0) {
        diag('workflow', 'invoice items sourced from configurator', { count: lineItems.length, fromConfigurator });
      }

      const newForm: Partial<InvoiceData> = {
        ...data,
        project_id: project.id,
        invoice_type: 'Commercial',
        status: 'Draft',
        terms_conditions: defaultTerms,
        line_items: lineItems,
        notes,
        payment_terms,
      };
      setForm(newForm);
      setIsEditMode(true);
      setActive(null);
    } catch (err: any) {
      setToast({ msg: err.response?.data?.message || 'Failed to auto-populate', sev: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Normalize line items â€” recalculate line_total = qty Ã— unit_price
      const normalizedItems = (form.line_items || []).map(item => {
        const q = Number(item.quantity) || 0;
        const u = Number(item.unit_price) || 0;
        return { ...item, quantity: q, unit_price: u, line_total: q * u };
      });
      const payload = {
        ...form,
        project_id: project.id,
        line_items: normalizedItems,
        subtotal: formSubtotal,
        tax_amount: formTax,
        final_total: formGrand,
        terms_conditions: normalizeTerms(form.terms_conditions).length > 0 ? normalizeTerms(form.terms_conditions) : DEFAULT_TERMS,
      };

      if (active?.id) {
        await invoiceService.update(active.id, payload);
        setToast({ msg: 'Invoice updated successfully', sev: 'success' });
      } else {
        await invoiceService.create(payload);
        setToast({ msg: 'Invoice created successfully', sev: 'success' });
      }
      setIsEditMode(false);
      setForm({});

      const list = await invoiceService.getByProjectId(project.id);
      setInvoices(list || []);
      setActive(list?.[0] || null);
      onUpdate();
    } catch (err: any) {
      setToast({ msg: err.response?.data?.message || 'Failed to save invoice', sev: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    if (!active) return;
    const safeTerms = normalizeTerms(active.terms_conditions);
    setForm({ ...active, terms_conditions: safeTerms.length > 0 ? safeTerms : DEFAULT_TERMS });
    setIsEditMode(true);
  };

  /* â”€â”€â”€ Inline section edit handlers â”€â”€â”€â”€ */
  const handleSectionEdit = (section: 'payment_terms' | 'notes' | 'terms_conditions') => {
    if (!active) return;
    setSectionDraft({
      payment_terms: active.payment_terms || '',
      notes: active.notes || '',
      terms_conditions: normalizeTerms(active.terms_conditions).length > 0 ? normalizeTerms(active.terms_conditions) : DEFAULT_TERMS,
    });
    setEditingSection(section);
  };

  const handleSectionSave = async () => {
    if (!active?.id || !editingSection) return;
    try {
      setSavingSection(true);
      const payload: Partial<InvoiceData> = {};
      if (editingSection === 'payment_terms') payload.payment_terms = sectionDraft.payment_terms;
      if (editingSection === 'notes') payload.notes = sectionDraft.notes;
      if (editingSection === 'terms_conditions') payload.terms_conditions = sectionDraft.terms_conditions;
      await invoiceService.update(active.id, payload);
      const list = await invoiceService.getByProjectId(project.id);
      setInvoices(list || []);
      const updated = list?.find(i => i.id === active.id);
      if (updated) setActive(updated);
      setEditingSection(null);
      setToast({ msg: 'Saved successfully', sev: 'success' });
    } catch {
      setToast({ msg: 'Failed to save changes', sev: 'error' });
    } finally {
      setSavingSection(false);
    }
  };

  const handleSectionCancel = () => {
    setEditingSection(null);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setForm({});
    if (!active && invoices.length > 0) setActive(invoices[0]);
  };

  const handleSelectInvoice = (inv: InvoiceData) => {
    if (isEditMode) {
      setIsEditMode(false);
      setForm({});
    }
    setActive(inv);
  };

  const handleDelete = async (inv: InvoiceData) => {
    if (!inv.id) return;
    try {
      await invoiceService.delete(inv.id);
      setToast({ msg: 'Invoice deleted', sev: 'success' });
      const list = await invoiceService.getByProjectId(project.id);
      setInvoices(list || []);
      if (active?.id === inv.id) setActive(list?.[0] || null);
      onUpdate();
    } catch {
      setToast({ msg: 'Failed to delete invoice', sev: 'error' });
    }
  };

  const handleDuplicate = async (inv: InvoiceData) => {
    try {
      setCreating(true);
      const data = await invoiceService.getAutoPopulatedData(project.id);
      const dup: Partial<InvoiceData> = {
        ...data,
        project_id: project.id,
        invoice_type: inv.invoice_type,
        status: 'Draft',
        line_items: inv.line_items,
        tax_type: inv.tax_type,
        tax_percent: inv.tax_percent,
        shipping_charges: inv.shipping_charges,
        payment_terms: inv.payment_terms,
        notes: inv.notes,
      };
      setForm(dup);
      setIsEditMode(true);
      setActive(null);
    } catch {
      setToast({ msg: 'Failed to duplicate invoice', sev: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (inv: InvoiceData, status: string) => {
    try {
      await invoiceService.update(inv.id!, { status: status as any });
      setToast({ msg: `Invoice marked as ${status}`, sev: 'success' });
      const list = await invoiceService.getByProjectId(project.id);
      setInvoices(list || []);
      const updated = list?.find(i => i.id === inv.id);
      if (updated) setActive(updated);
    } catch {
      setToast({ msg: 'Failed to update status', sev: 'error' });
    }
  };

  const handleDownloadPdf = async (inv: InvoiceData) => {
    try {
      // If in edit mode, save first to ensure latest data is persisted
      setIsDownloading(true);
      if (isEditMode && inv.id) {
        const normalizedItems = (form.line_items || []).map(item => {
          const q = Number(item.quantity) || 0;
          const u = Number(item.unit_price) || 0;
          return { ...item, quantity: q, unit_price: u, line_total: q * u };
        });
        await invoiceService.update(inv.id, {
          ...form,
          project_id: project.id,
          line_items: normalizedItems,
          subtotal: formSubtotal,
          tax_amount: formTax,
          final_total: formGrand,
        });
      }
      await invoiceService.downloadPdf(inv.id!);
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message || err?.response?.data?.errors?.join(', ') || '';
      setToast({ msg: serverMsg || 'Failed to download PDF', sev: 'error' });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSendToClient = async (inv: InvoiceData) => {
    if (!inv.id) {
      setToast({ msg: 'Please save the invoice first', sev: 'error' });
      return;
    }
    const clientEmail = (project.client?.poc_email || project.client?.email || '').trim();
    if (!clientEmail) {
      setToast({ msg: 'Client email not available', sev: 'error' });
      return;
    }
    try {
      // Download PDF first
      await invoiceService.downloadPdf(inv.id!);
      // Build mailto link
      const clientName = project.client?.poc_name || project.client?.client_name || 'Client';
      const invoiceNumber = inv.invoice_number || `INV-${inv.id}`;
      const subject = encodeURIComponent(`Invoice: ${invoiceNumber}`);
      const body = encodeURIComponent(
        `Dear ${clientName},\n\n` +
        `Please find attached the invoice (${invoiceNumber}).\n\n` +
        `Kindly process the payment at your earliest convenience.\n\n` +
        `Best regards`
      );
      const mailto = `mailto:${clientEmail}?subject=${subject}&body=${body}`;
      window.open(mailto, '_blank');
      // Update invoice status to Sent
      await invoiceService.update(inv.id!, { status: 'Sent' });
      const list = await invoiceService.getByProjectId(project.id);
      setInvoices(list || []);
      const updated = list?.find(i => i.id === inv.id);
      if (updated) setActive(updated);
      setToast({ msg: 'Invoice downloaded. Please attach it to the email that just opened.', sev: 'success' });
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message || err?.response?.data?.errors?.join(', ') || '';
      setToast({ msg: serverMsg || 'Failed to send invoice', sev: 'error' });
    }
  };

  /* â”€â”€â”€ Line item helpers â”€â”€â”€â”€ */
  const updateLineItem = (idx: number, field: keyof InvoiceLineItem, value: any) => {
    const items = [...(form.line_items || [])];
    (items[idx] as any)[field] = value;
    if (field === 'quantity' || field === 'unit_price') {
      items[idx].line_total = (Number(items[idx].quantity) || 0) * (Number(items[idx].unit_price) || 0);
    }
    setForm({ ...form, line_items: items });
  };

  const addLineItem = () => {
    setForm({ ...form, line_items: [...(form.line_items || []), emptyLineItem()] });
  };

  const removeLineItem = (idx: number) => {
    const items = [...(form.line_items || [])];
    items.splice(idx, 1);
    setForm({ ...form, line_items: items });
  };

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     RENDER
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
      <CircularProgress size={28} sx={{ color: T.primary }} />
    </Box>;
  }

  // Data for display: either the form (edit/create) or active invoice (view)
  const displayData = isEditMode ? form : active;
  const displayItems: InvoiceLineItem[] = isEditMode
    ? formItems
    : (Array.isArray(active?.line_items) ? active!.line_items : []);
  const displaySubtotal = isEditMode ? formSubtotal : Number(active?.subtotal) || 0;
  const displayTax = isEditMode ? formTax : Number(active?.tax_amount) || 0;
  const displayShipping = isEditMode ? formShipping : Number(active?.shipping_charges) || 0;
  const displayGrand = isEditMode ? formGrand : Number(active?.final_total) || 0;
  const displayStatus = (isEditMode ? form.status : active?.status) || 'Draft';
  const stC = STATUS_COLORS[displayStatus] || STATUS_COLORS.Draft;

  return (
    <TabContainer>

      {/* â•â•â• TOP BAR: Invoice list + actions â•â•â• */}
      <AnimatedSection>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 1.5, mb: 2,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: '12px',
            backgroundColor: 'rgba(0,200,255,0.10)',
            border: '1px solid rgba(0,200,255,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={22} color="#00c8ff" />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Invoices
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: T.textMuted }}>
              {invoices.length > 0 ? `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}` : 'No invoices yet'}
            </Typography>
          </Box>
        </Box>

        <Button size="small" variant="contained" startIcon={creating ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <AddIcon />}
          onClick={handleNewInvoice} disabled={creating}
          sx={{
            textTransform: 'none', bgcolor: T.primary, borderRadius: '10px',
            fontSize: 12.5, fontWeight: 600, px: 2.5, boxShadow: `0 2px 8px ${T.primary}30`,
            '&:hover': { bgcolor: T.primaryLight, boxShadow: `0 4px 12px ${T.primary}35` },
          }}>
          New Invoice
        </Button>
      </Box>

      {/* â•â•â• INVOICE SELECTOR STRIP â•â•â• */}
      {invoices.length > 0 && (
        <Box sx={{
          display: 'flex', gap: 1, mb: 2, overflowX: 'auto', pb: 0.5,
          '&::-webkit-scrollbar': { height: 4 },
          '&::-webkit-scrollbar-thumb': { bgcolor: '#E2E8F0', borderRadius: 2 },
        }}>
          {invoices.map((inv) => {
            const isAct = !isEditMode && active?.id === inv.id;
            const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.Draft;
            return (
              <Box key={inv.id}
                onClick={() => handleSelectInvoice(inv)}
                sx={{
                  minWidth: 160, cursor: 'pointer', borderRadius: '10px',
                  border: `1.5px solid ${isAct ? T.primary : T.border}`,
                  bgcolor: isAct ? T.primaryBg : T.white,
                  px: 2, py: 1.25, transition: 'all 0.15s',
                  '&:hover': { borderColor: T.primary, bgcolor: T.primaryBg },
                  boxShadow: isAct ? `0 0 0 1px ${T.primary}40` : 'none',
                  flexShrink: 0,
                }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: isAct ? T.primary : T.text }}>
                    {inv.invoice_number}
                  </Typography>
                  <Chip label={inv.status} size="small" sx={{
                    height: 18, fontSize: 9.5, fontWeight: 700,
                    bgcolor: sc.bg, color: sc.color,
                    border: `1px solid ${sc.color}20`,
                  }} />
                </Stack>
                <Typography sx={{ fontSize: 11, color: T.textMuted }}>
                  {fmt(inv.final_total)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
      </AnimatedSection>

      {/* â•â•â• MAIN CONTENT: Two-panel layout â•â•â• */}
      {
        <Grid container spacing={2} alignItems="flex-start">

          {/* â”€â”€â”€ LEFT PANEL: Main workspace (9/12) â”€â”€â”€ */}
          <Grid item xs={12} md={9}>

            {/* â”€â”€ Action bar (card-style like Estimation revision header) â”€â”€ */}
            <Box sx={{
              bgcolor: T.white, border: `1px solid ${T.border}`, borderRadius: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)', mb: 2, overflow: 'hidden',
            }}>
              <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                px: 2.5, py: 1.5, flexWrap: 'wrap', gap: 1,
                background: 'linear-gradient(135deg, #FAFBFC, #F1F5F9)',
                borderBottom: `1px solid ${T.border}`,
              }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.2 }}>
                    {isEditMode ? (active?.id ? 'Edit Invoice' : 'New Invoice') : displayData?.invoice_number}
                  </Typography>
                  {!isEditMode && (
                    <>
                      <Chip label={`${displayData?.invoice_type || 'Commercial'} Invoice`} size="small" sx={{
                        fontWeight: 600, fontSize: 10.5, height: 22,
                        bgcolor: T.primaryBg, color: T.primary,
                        border: `1px solid ${T.primary}25`, borderRadius: '7px',
                      }} />
                      <Chip label={displayStatus} size="small" sx={{
                        fontWeight: 700, fontSize: 10.5, height: 22,
                        bgcolor: stC.bg, color: stC.color,
                        border: `1.5px solid ${stC.color}25`, borderRadius: '7px',
                      }} />
                    </>
                  )}
                </Stack>

                <Stack direction="row" spacing={1}>
                  {isEditMode ? (
                    <>
                      <Button size="small" onClick={handleCancelEdit}
                        sx={{
                          textTransform: 'none', color: T.textSec, fontSize: 12.5, fontWeight: 600,
                          borderRadius: '8px', px: 2, border: `1px solid ${T.border}`,
                          '&:hover': { borderColor: 'var(--text-muted)', bgcolor: 'var(--bg-surface-2)' },
                        }}>
                        Cancel
                      </Button>
                      <Button size="small" variant="contained" disabled={saving} onClick={handleSave}
                        sx={{
                          textTransform: 'none', bgcolor: T.primary, fontSize: 12.5, fontWeight: 600,
                          borderRadius: '8px', px: 2.5, boxShadow: `0 2px 8px ${T.primary}30`,
                          '&:hover': { bgcolor: T.primaryLight },
                        }}>
                        {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Save'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" startIcon={<Pencil size={15} />} onClick={handleEdit}
                        sx={{
                          textTransform: 'none', borderRadius: '8px', px: 2, fontSize: 12.5, fontWeight: 600,
                          color: T.text, border: `1px solid ${T.border}`,
                          '&:hover': { borderColor: T.primary, color: T.primary, bgcolor: T.primaryBg },
                        }}>
                        Edit
                      </Button>
                      <IconButton
                        size="small"
                        onClick={() => active && handleDownloadPdf(active)}
                        disabled={isDownloading}
                        title="Download Invoice PDF"
                        sx={{
                          border: `1px solid #CBD5E1`, color: T.textSec, borderRadius: '8px', width: 30, height: 30,
                          '&:hover': { borderColor: 'var(--text-muted)', bgcolor: 'var(--bg-surface-2)', color: T.primary }
                        }}
                      >
                        {isDownloading ? <CircularProgress size={14} color="inherit" /> : <PdfIcon sx={{ fontSize: 16 }} />}
                      </IconButton>
                    </>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => setIsMainPanelOpen(!isMainPanelOpen)}
                    sx={isMainPanelOpen
                      ? { bgcolor: T.primary, color: '#fff', borderRadius: '8px', width: 30, height: 30, flexShrink: 0, '&:hover': { bgcolor: T.primary } }
                      : { border: `1px solid ${T.border}`, color: T.textSec, borderRadius: '8px', width: 30, height: 30, flexShrink: 0, '&:hover': { borderColor: T.textMuted, bgcolor: 'var(--bg-surface-2)' } }
                    }
                  >
                    {isMainPanelOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </IconButton>
                </Stack>
              </Box>
            </Box>

            <Collapse in={isMainPanelOpen} unmountOnExit>
            {/* â”€â”€ Invoice Details Card â”€â”€ */}
            <Box sx={cardSx}>
              <Typography sx={sectionHeaderSx}>
                Invoice Details
              </Typography>
              <Grid container spacing={2} sx={{ mb: 1.5 }}>
                <Grid item xs={12} sm={4}>
                  <FieldGroup><FieldLabel>Invoice Number</FieldLabel>
                    <TextField fullWidth size="small" value={displayData?.invoice_number || ''} disabled sx={inputSx(true)} />
                  </FieldGroup>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FieldGroup><FieldLabel>Invoice Type</FieldLabel>
                    {isEditMode ? (
                      <FormControl fullWidth size="small">
                        <Select value={form.invoice_type || 'Commercial'}
                          onChange={e => setForm({ ...form, invoice_type: e.target.value as any })}
                          sx={selectSx()}>
                          <MenuItem value="Commercial">Commercial Invoice</MenuItem>
                          <MenuItem value="Proforma">Proforma Invoice</MenuItem>
                          <MenuItem value="Tax">Tax Invoice</MenuItem>
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField fullWidth size="small" value={`${displayData?.invoice_type || 'Commercial'} Invoice`} disabled sx={inputSx(true)} />
                    )}
                  </FieldGroup>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FieldGroup><FieldLabel>Invoice Date</FieldLabel>
                    <TextField fullWidth size="small" type={isEditMode ? 'date' : 'text'}
                      value={displayData?.invoice_date || ''}
                      disabled={!isEditMode}
                      onChange={e => setForm({ ...form, invoice_date: e.target.value })}
                      sx={inputSx(!isEditMode)} />
                  </FieldGroup>
                </Grid>
              </Grid>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <FieldGroup><FieldLabel>Project Name</FieldLabel>
                    <TextField fullWidth size="small" value={displayData?.project_name || ''} disabled sx={inputSx(true)} />
                  </FieldGroup>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FieldGroup><FieldLabel>Revision</FieldLabel>
                    <TextField fullWidth size="small" value={displayData?.revision || ''} disabled sx={inputSx(true)} />
                  </FieldGroup>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FieldGroup><FieldLabel>Client PO Number</FieldLabel>
                    <TextField fullWidth size="small"
                      value={(isEditMode ? form.client_po_number : displayData?.client_po_number) || ''}
                      disabled={!isEditMode}
                      onChange={e => setForm({ ...form, client_po_number: e.target.value })}
                      sx={inputSx(!isEditMode)} />
                  </FieldGroup>
                </Grid>
              </Grid>
            </Box>

            {/* â”€â”€ Customer Info Card â”€â”€ */}
            <Box sx={cardSx}>
              <Typography sx={sectionHeaderSx}>
                Customer Information
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FieldGroup><FieldLabel>Customer Name</FieldLabel>
                    <TextField fullWidth size="small" value={displayData?.customer_name || ''} disabled sx={inputSx(true)} />
                  </FieldGroup>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FieldGroup><FieldLabel>Customer Address</FieldLabel>
                    <TextField fullWidth size="small" multiline rows={2}
                      value={displayData?.customer_address || ''} disabled sx={textareaSx()} />
                  </FieldGroup>
                </Grid>
              </Grid>
            </Box>

            {/* â”€â”€ Line Items Table â”€â”€ */}
            <Box sx={{
              bgcolor: T.white, border: `1px solid ${T.border}`, borderRadius: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)', mb: 2, overflow: 'hidden',
            }}>
              <Box
                sx={{
                  px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  cursor: 'pointer', userSelect: 'none',
                  '&:hover': { bgcolor: 'var(--bg-surface-2)' }, transition: 'background 0.15s',
                }}
                onClick={() => setLineItemsOpen(o => !o)}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Typography sx={{
                    fontSize: 14, fontWeight: 600, color: '#374151',
                    letterSpacing: '0.4px', textTransform: 'uppercase',
                  }}>
                    Line Items
                  </Typography>
                  <Box sx={{
                    bgcolor: '#E8F5F0', color: '#1B7F5C',
                    fontWeight: 700, fontSize: 12,
                    px: 1.5, py: 0.5,
                    borderRadius: '20px',
                    lineHeight: 1.4,
                    display: 'inline-flex', alignItems: 'center',
                  }}>
                    {displayItems.length} Item{displayItems.length !== 1 ? 's' : ''}
                  </Box>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                  {isEditMode && (
                    <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                      onClick={e => { e.stopPropagation(); addLineItem(); setLineItemsOpen(true); }}
                      sx={{
                        textTransform: 'none', fontSize: 12.5, fontWeight: 600,
                        bgcolor: '#E8F5F0', color: '#1B7F5C',
                        borderRadius: '8px', px: 1.5, py: 0.5,
                        '&:hover': { bgcolor: '#D6EFE6' },
                      }}>
                      Add Item
                    </Button>
                  )}
                  <IconButton size="small" sx={{ color: '#6B7280' }}>
                    {lineItemsOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                  </IconButton>
                </Stack>
              </Box>

              {/* Collapsed preview â€” show part numbers */}
              {!lineItemsOpen && displayItems.length > 0 && (
                <Box sx={{ px: 3, pb: 2 }}>
                  <Typography sx={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.6 }}>
                    <Box component="span" sx={{ fontWeight: 600, color: '#374151' }}>Parts: </Box>
                    {displayItems.map(i => i.part).filter(Boolean).join(', ') || 'â€”'}
                  </Typography>
                </Box>
              )}

              <Collapse in={lineItemsOpen} timeout={250}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Part', 'Description', 'Qty', 'Unit Price', 'Total', ...(isEditMode ? [''] : [])].map((h, i) => (
                        <TableCell key={h || 'act'} align={i >= 2 && i <= 4 ? 'right' : 'left'} sx={{
                          '&.MuiTableCell-head': {
                            background: `linear-gradient(135deg, ${T.primary}, ${T.primaryLight})`,
                            color: '#FFFFFF', fontWeight: 700,
                            fontSize: 11, py: 1.5, px: 2.5, letterSpacing: 0.5,
                            textTransform: 'uppercase', borderBottom: 'none',
                          },
                        }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {displayItems.map((item, idx) => (
                      <TableRow key={idx} sx={{
                        bgcolor: idx % 2 === 0 ? T.white : 'var(--bg-surface-2)',
                        '&:hover': { bgcolor: T.primaryBg },
                        transition: 'background 0.15s',
                      }}>
                        <TableCell sx={{ fontSize: 12.5, color: T.text, fontWeight: 600, py: 1.5, px: 2.5, borderBottom: `1px solid #F1F3F5`, minWidth: 120 }}>
                          {isEditMode ? (
                            <TextField size="small" fullWidth value={item.part}
                              onChange={e => updateLineItem(idx, 'part', e.target.value)}
                              sx={{ ...inputSx(), '& .MuiInputBase-input': { fontSize: 12.5, py: 0.75 } }} />
                          ) : item.part}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12.5, color: T.textSec, py: 1.5, px: 2.5, borderBottom: `1px solid #F1F3F5`, minWidth: 180 }}>
                          {isEditMode ? (
                            <TextField size="small" fullWidth value={item.description}
                              onChange={e => updateLineItem(idx, 'description', e.target.value)}
                              sx={{ ...inputSx(), '& .MuiInputBase-input': { fontSize: 12.5, py: 0.75 } }} />
                          ) : item.description}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: 12.5, color: T.text, fontWeight: 500, py: 1.5, px: 2.5, borderBottom: `1px solid #F1F3F5`, width: 80 }}>
                          {isEditMode ? (
                            <TextField size="small" type="number" value={item.quantity}
                              onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value))}
                              sx={{ ...inputSx(), width: 70, '& .MuiInputBase-input': { fontSize: 12.5, py: 0.75, textAlign: 'right' } }} />
                          ) : item.quantity}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: 12.5, color: T.text, fontWeight: 500, py: 1.5, px: 2.5, borderBottom: `1px solid #F1F3F5`, width: 110 }}>
                          {isEditMode ? (
                            <TextField size="small" type="number" value={item.unit_price}
                              onChange={e => updateLineItem(idx, 'unit_price', Number(e.target.value))}
                              sx={{ ...inputSx(), width: 100, '& .MuiInputBase-input': { fontSize: 12.5, py: 0.75, textAlign: 'right' } }} />
                          ) : fmt(item.unit_price)}
                        </TableCell>
                        <TableCell align="right" sx={{
                          fontSize: 13, color: T.primary, fontWeight: 700, py: 1.5, px: 2.5,
                          borderBottom: `1px solid #F1F3F5`, bgcolor: `${T.primary}06`, width: 110,
                        }}>
                          {fmt(item.line_total)}
                        </TableCell>
                        {isEditMode && (
                          <TableCell sx={{ borderBottom: `1px solid #F1F3F5`, width: 40, px: 0.5 }}>
                            <Tooltip title="Remove item">
                              <IconButton size="small" onClick={() => removeLineItem(idx)}>
                                <Trash2 size={16} color={T.danger} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {displayItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={isEditMode ? 6 : 5} align="center" sx={{ py: 4 }}>
                          <Typography sx={{ fontSize: 13, color: T.textMuted }}>No line items</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              </Collapse>
            </Box>

            {/* â”€â”€ Tax & Charges Card â”€â”€ */}
            <Box sx={cardSx}>
              <Typography sx={sectionHeaderSx}>
                Tax & Charges
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <FieldGroup><FieldLabel>Tax Type</FieldLabel>
                    {isEditMode ? (
                      <FormControl fullWidth size="small">
                        <Select value={form.tax_type || 'Exempt'}
                          onChange={e => {
                            const sel = TAX_OPTIONS.find(t => t.value === e.target.value);
                            setForm({
                              ...form,
                              tax_type: e.target.value,
                              tax_percent: sel?.value === 'Custom' ? (form.tax_percent || 0) : (sel?.pct || 0),
                            });
                          }}
                          sx={selectSx()}>
                          {TAX_OPTIONS.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField fullWidth size="small" value={displayData?.tax_type || 'Exempt'} disabled sx={inputSx(true)} />
                    )}
                  </FieldGroup>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FieldGroup><FieldLabel>Tax %</FieldLabel>
                    <TextField fullWidth size="small" type="number"
                      value={isEditMode ? (form.tax_type === 'Exempt' ? 0 : (form.tax_percent || 0)) : (displayData?.tax_percent || 0)}
                      disabled={!isEditMode || form.tax_type !== 'Custom'}
                      onChange={e => setForm({ ...form, tax_percent: Number(e.target.value) })}
                      sx={inputSx(!isEditMode || form.tax_type !== 'Custom')} />
                  </FieldGroup>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FieldGroup><FieldLabel>Shipping Charges</FieldLabel>
                    <TextField fullWidth size="small" type="number"
                      value={isEditMode ? (form.shipping_charges || 0) : (displayData?.shipping_charges || 0)}
                      disabled={!isEditMode}
                      onChange={e => setForm({ ...form, shipping_charges: Number(e.target.value) })}
                      sx={inputSx(!isEditMode)} />
                  </FieldGroup>
                </Grid>
              </Grid>
            </Box>

            {/* â”€â”€ Payment Terms & Notes â”€â”€ */}
            <Grid container spacing={2} sx={{ mb: 0 }}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ ...cardSx, mb: 0, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography sx={sectionHeaderSx}>Payment Terms</Typography>
                    {!isEditMode && active?.id && (
                      editingSection === 'payment_terms' ? (
                        <Box sx={{ display: 'flex', gap: 0.75 }}>
                          <Button size="small" variant="contained"
                            onClick={handleSectionSave} disabled={savingSection}
                            sx={{ textTransform: 'none', fontSize: 11.5, fontWeight: 600, minWidth: 54, py: 0.4, px: 1.25, borderRadius: '7px', bgcolor: T.primary, '&:hover': { bgcolor: T.primaryLight } }}>
                            {savingSection ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : 'Save'}
                          </Button>
                          <Button size="small" onClick={handleSectionCancel}
                            sx={{ textTransform: 'none', fontSize: 11.5, fontWeight: 600, minWidth: 54, py: 0.4, px: 1.25, borderRadius: '7px', color: T.textMuted }}>
                            Cancel
                          </Button>
                        </Box>
                      ) : (
                        <IconButton size="small" onClick={() => handleSectionEdit('payment_terms')}
                          sx={{ color: T.textMuted, '&:hover': { color: T.primary, bgcolor: T.primaryBg } }}>
                          <Pencil size={14} />
                        </IconButton>
                      )
                    )}
                  </Box>
                  {isEditMode ? (
                    <TextField fullWidth size="small" multiline rows={3}
                      value={form.payment_terms || ''}
                      onChange={e => setForm({ ...form, payment_terms: e.target.value })}
                      sx={textareaSx()} />
                  ) : editingSection === 'payment_terms' ? (
                    <TextField fullWidth size="small" multiline rows={3}
                      value={sectionDraft.payment_terms}
                      onChange={e => setSectionDraft({ ...sectionDraft, payment_terms: e.target.value })}
                      autoFocus
                      sx={textareaSx()} />
                  ) : (
                    <Typography sx={{ fontSize: 13, color: T.textSec, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {active?.payment_terms || displayData?.payment_terms || 'N/A'}
                    </Typography>
                  )}
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ ...cardSx, mb: 0, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography sx={sectionHeaderSx}>Notes</Typography>
                    {!isEditMode && active?.id && (
                      editingSection === 'notes' ? (
                        <Box sx={{ display: 'flex', gap: 0.75 }}>
                          <Button size="small" variant="contained"
                            onClick={handleSectionSave} disabled={savingSection}
                            sx={{ textTransform: 'none', fontSize: 11.5, fontWeight: 600, minWidth: 54, py: 0.4, px: 1.25, borderRadius: '7px', bgcolor: T.primary, '&:hover': { bgcolor: T.primaryLight } }}>
                            {savingSection ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : 'Save'}
                          </Button>
                          <Button size="small" onClick={handleSectionCancel}
                            sx={{ textTransform: 'none', fontSize: 11.5, fontWeight: 600, minWidth: 54, py: 0.4, px: 1.25, borderRadius: '7px', color: T.textMuted }}>
                            Cancel
                          </Button>
                        </Box>
                      ) : (
                        <IconButton size="small" onClick={() => handleSectionEdit('notes')}
                          sx={{ color: T.textMuted, '&:hover': { color: T.primary, bgcolor: T.primaryBg } }}>
                          <Pencil size={14} />
                        </IconButton>
                      )
                    )}
                  </Box>
                  {isEditMode ? (
                    <TextField fullWidth size="small" multiline rows={3}
                      value={form.notes || ''}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      sx={textareaSx()} />
                  ) : editingSection === 'notes' ? (
                    <TextField fullWidth size="small" multiline rows={3}
                      value={sectionDraft.notes}
                      onChange={e => setSectionDraft({ ...sectionDraft, notes: e.target.value })}
                      autoFocus
                      sx={textareaSx()} />
                  ) : (
                    <Typography sx={{ fontSize: 13, color: T.textSec, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {active?.notes || displayData?.notes || 'N/A'}
                    </Typography>
                  )}
                </Box>
              </Grid>
            </Grid>

            {/* â”€â”€ Terms & Conditions â”€â”€ */}
            <Box sx={{ ...cardSx, mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography sx={{ ...sectionHeaderSx, mb: 0 }}>Terms &amp; Conditions</Typography>
                {!isEditMode && active?.id && (
                  editingSection === 'terms_conditions' ? (
                    <Box sx={{ display: 'flex', gap: 0.75 }}>
                      <Button size="small" variant="contained"
                        onClick={handleSectionSave} disabled={savingSection}
                        sx={{ textTransform: 'none', fontSize: 11.5, fontWeight: 600, minWidth: 54, py: 0.4, px: 1.25, borderRadius: '7px', bgcolor: T.primary, '&:hover': { bgcolor: T.primaryLight } }}>
                        {savingSection ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : 'Save'}
                      </Button>
                      <Button size="small" onClick={handleSectionCancel}
                        sx={{ textTransform: 'none', fontSize: 11.5, fontWeight: 600, minWidth: 54, py: 0.4, px: 1.25, borderRadius: '7px', color: T.textMuted }}>
                        Cancel
                      </Button>
                    </Box>
                  ) : (
                    <IconButton size="small" onClick={() => handleSectionEdit('terms_conditions')}
                      sx={{ color: T.textMuted, '&:hover': { color: T.primary, bgcolor: T.primaryBg } }}>
                      <Pencil size={14} />
                    </IconButton>
                  )
                )}
              </Box>

              {isEditMode
                ? (() => {
                    const editTerms = normalizeTerms(form.terms_conditions);
                    return (editTerms.length > 0 ? editTerms : DEFAULT_TERMS).map((tc: any, idx: number) => (
                    <Box key={idx} sx={{ mb: 2 }}>
                      <TextField fullWidth size="small"
                        value={tc.title || ''}
                        onChange={e => {
                          const updated = [...(normalizeTerms(form.terms_conditions).length > 0 ? normalizeTerms(form.terms_conditions) : DEFAULT_TERMS)];
                          updated[idx] = { ...updated[idx], title: e.target.value };
                          setForm({ ...form, terms_conditions: updated });
                        }}
                        placeholder="Term title"
                        sx={{ ...inputSx(), mb: 0.5, '& .MuiInputBase-input': { fontSize: 13, fontWeight: 600 } }} />
                      <TextField fullWidth size="small" multiline rows={2}
                        value={tc.body || ''}
                        onChange={e => {
                          const updated = [...(normalizeTerms(form.terms_conditions).length > 0 ? normalizeTerms(form.terms_conditions) : DEFAULT_TERMS)];
                          updated[idx] = { ...updated[idx], body: e.target.value };
                          setForm({ ...form, terms_conditions: updated });
                        }}
                        placeholder="Term description"
                        sx={textareaSx()} />
                    </Box>
                  ));
                  })()
                : editingSection === 'terms_conditions'
                  ? (
                    <>
                      {sectionDraft.terms_conditions.map((tc, idx) => (
                        <Box key={idx} sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
                            <TextField size="small"
                              value={tc.title || ''}
                              onChange={e => {
                                const updated = [...sectionDraft.terms_conditions];
                                updated[idx] = { ...updated[idx], title: e.target.value };
                                setSectionDraft({ ...sectionDraft, terms_conditions: updated });
                              }}
                              placeholder="Term title"
                              sx={{ flex: 1, ...inputSx(), '& .MuiInputBase-input': { fontSize: 13, fontWeight: 600 } }} />
                            <IconButton size="small"
                              onClick={() => {
                                const updated = sectionDraft.terms_conditions.filter((_, i) => i !== idx);
                                setSectionDraft({ ...sectionDraft, terms_conditions: updated });
                              }}
                              sx={{ color: T.danger, flexShrink: 0 }}>
                              <Trash2 size={14} />
                            </IconButton>
                          </Box>
                          <TextField fullWidth size="small" multiline rows={2}
                            value={tc.body || ''}
                            onChange={e => {
                              const updated = [...sectionDraft.terms_conditions];
                              updated[idx] = { ...updated[idx], body: e.target.value };
                              setSectionDraft({ ...sectionDraft, terms_conditions: updated });
                            }}
                            placeholder="Term description"
                            sx={textareaSx()} />
                        </Box>
                      ))}
                      <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                        onClick={() => setSectionDraft({ ...sectionDraft, terms_conditions: [...sectionDraft.terms_conditions, { title: '', body: '' }] })}
                        sx={{ textTransform: 'none', fontSize: 12.5, fontWeight: 600, bgcolor: '#E8F5F0', color: '#1B7F5C', borderRadius: '8px', px: 1.5, py: 0.5, '&:hover': { bgcolor: '#D6EFE6' } }}>
                        Add Term
                      </Button>
                    </>
                  )
                  : (() => {
                      const viewTerms = normalizeTerms(active?.terms_conditions);
                      const fallbackTerms = viewTerms.length > 0 ? viewTerms : normalizeTerms(displayData?.terms_conditions);
                      const finalTerms = fallbackTerms.length > 0 ? fallbackTerms : DEFAULT_TERMS;
                      return finalTerms.map((tc: any, idx: number) => (
                      <Box key={idx} sx={{ mb: 2 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text, mb: 0.25 }}>
                          {idx + 1}. {tc.title}
                        </Typography>
                        <Typography sx={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.7, pl: 2 }}>
                          {tc.body}
                        </Typography>
                      </Box>
                    ));
                    })()
              }
              {isEditMode && (
                <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                  onClick={() => {
                    const updated = [...(form.terms_conditions || DEFAULT_TERMS), { title: '', body: '' }];
                    setForm({ ...form, terms_conditions: updated });
                  }}
                  sx={{
                    textTransform: 'none', fontSize: 12.5, fontWeight: 600,
                    bgcolor: '#E8F5F0', color: '#1B7F5C', borderRadius: '8px', px: 1.5, py: 0.5,
                    '&:hover': { bgcolor: '#D6EFE6' },
                  }}>
                  Add Term
                </Button>
              )}
            </Box>
            </Collapse>

          </Grid>

          {/* â”€â”€â”€ RIGHT PANEL: Summary sidebar (3/12) â”€â”€â”€ */}
          <Grid item xs={12} md={3}>
            <Box sx={{
              position: 'sticky', top: 16,
              bgcolor: T.white, border: `1px solid ${T.border}`, borderRadius: '16px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
              overflow: 'hidden',
            }}>
              {/* Summary header â€” matches Estimation Cost Summary */}
              <Box sx={{
                px: 3, py: 2,
                background: 'linear-gradient(135deg, #FAFBFC, #F1F5F9)',
                borderBottom: `1px solid ${T.border}`,
              }}>
                <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 16, letterSpacing: -0.2 }}>
                  Invoice Summary
                </Typography>
              </Box>

              <Box sx={{ px: 2.5, py: 2.5 }}>
                {/* Status chip */}
                <Box sx={{ mb: 2 }}>
                  <Chip label={displayStatus} size="small" sx={{
                    fontWeight: 700, fontSize: 11, height: 24,
                    bgcolor: stC.bg, color: stC.color,
                    border: `1.5px solid ${stC.color}25`, borderRadius: '8px',
                  }} />
                </Box>

                {/* Totals breakdown â€” dot + label style like Estimation */}
                {([
                  ['Subtotal', fmt(displaySubtotal)],
                  [`Tax (${isEditMode ? (form.tax_type === 'Exempt' ? '0' : form.tax_percent) : (displayData?.tax_type === 'Exempt' ? '0' : displayData?.tax_percent)}%)`, fmt(displayTax)],
                  ['Shipping', fmt(displayShipping)],
                ] as [string, string][]).map(([label, value]) => (
                  <Stack key={label} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1.25 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: label.startsWith('Tax') ? '#3B82F6' : label === 'Shipping' ? '#F59E0B' : '#10B981', flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1F2937', fontFamily: '"JetBrains Mono", monospace' }}>{value}</Typography>
                  </Stack>
                ))}

                <Divider sx={{ my: 1.5, borderColor: T.border }} />

                {/* Grand Total â€” hero block (matching Estimation Final Price) */}
                <Box sx={{
                  mt: 1, p: 2.5, borderRadius: '12px',
                  backgroundColor: '#00c8ff',
                  color: '#06151c',
                  textAlign: 'center', mb: 2,
                  boxShadow: 'none',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <Box sx={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
                  <Box sx={{ position: 'absolute', bottom: -15, left: -15, width: 60, height: 60, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.03)' }} />
                  <Typography sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 10, fontWeight: 700, mb: 0.5 }}>
                    Grand Total
                  </Typography>
                  <Typography sx={{ fontSize: 28, fontWeight: 900, color: '#FFFFFF', letterSpacing: -1, lineHeight: 1.1 }}>
                    {fmt(displayGrand)}
                  </Typography>
                </Box>

                {/* Quick actions (view mode only) */}
                {!isEditMode && active?.id && (
                  <>
                    <Divider sx={{ my: 1.5, borderColor: T.border }} />
                    <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5 }}>
                      Quick Actions
                    </Typography>

                    <Stack spacing={1}>
                      {active.status === 'Draft' && (
                        <Button fullWidth size="small" variant="outlined" startIcon={<Send size={14} />}
                          onClick={() => handleStatusChange(active, 'Sent')}
                          sx={{
                            textTransform: 'none', fontSize: 12, fontWeight: 600, borderRadius: '8px',
                            borderColor: '#0369A1', color: '#0369A1',
                            '&:hover': { bgcolor: '#E0F2FE', borderColor: '#0369A1' },
                          }}>
                          Mark as Sent
                        </Button>
                      )}
                      {active.status === 'Sent' && (
                        <Button fullWidth size="small" variant="outlined" startIcon={<CheckCircle size={14} />}
                          onClick={() => handleStatusChange(active, 'Paid')}
                          sx={{
                            textTransform: 'none', fontSize: 12, fontWeight: 600, borderRadius: '8px',
                            borderColor: T.primary, color: T.primary,
                            '&:hover': { bgcolor: T.primaryBg, borderColor: T.primary },
                          }}>
                          Mark as Paid
                        </Button>
                      )}
                      {(active.status === 'Draft' || active.status === 'Sent') && (
                        <Button fullWidth size="small" variant="contained" startIcon={<Send size={14} />}
                          onClick={() => handleSendToClient(active)}
                          sx={{
                            textTransform: 'none', fontSize: 12, fontWeight: 600, borderRadius: '8px',
                            bgcolor: '#0369A1', color: '#FFFFFF',
                            '&:hover': { bgcolor: '#075985' },
                          }}>
                          Send to Client
                        </Button>
                      )}
                      <Button fullWidth size="small" variant="outlined" startIcon={<Copy size={14} />}
                        onClick={() => handleDuplicate(active)}
                        sx={{
                          textTransform: 'none', fontSize: 12, fontWeight: 600, borderRadius: '8px',
                          borderColor: T.border, color: T.textSec,
                          '&:hover': { borderColor: 'var(--text-muted)', bgcolor: 'var(--bg-surface-2)' },
                        }}>
                        Duplicate
                      </Button>
                      {active.status === 'Draft' && (
                        <Button fullWidth size="small" variant="outlined" startIcon={<Trash2 size={14} />}
                          onClick={() => handleDelete(active)}
                          sx={{
                            textTransform: 'none', fontSize: 12, fontWeight: 600, borderRadius: '8px',
                            borderColor: '#FCA5A5', color: T.danger,
                            '&:hover': { bgcolor: '#FEF2F2', borderColor: T.danger },
                          }}>
                          Delete Invoice
                        </Button>
                      )}
                    </Stack>
                  </>
                )}
              </Box>
            </Box>
          </Grid>

        </Grid>
      }

      {/* â•â•â• TOAST â•â•â• */}
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity={toast?.sev || 'success'}
          variant="filled" sx={{ width: '100%', fontWeight: 600 }}>
          {toast?.msg}
        </Alert>
      </Snackbar>

      <EnhancedNavFooter onBack={onBack} onNext={onNext} backLabel="Back to Logistics" nextLabel="Next: Documents" />
    </TabContainer>
  );
};

export default InvoiceTab;

