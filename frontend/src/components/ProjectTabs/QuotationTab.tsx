import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, Grid, TextField, Button, alpha,
  Chip, Checkbox, FormControlLabel, Collapse, Stack,
  IconButton,
  DialogTitle,
  DialogContent,
  DialogActions,
  Dialog,
  CircularProgress,
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  Send as SendMuiIcon,
  AttachMoney as MoneyIcon,
  CalendarToday as CalendarIcon,
  LocalShipping as ShippingIcon,
  Payment as PaymentIcon,
  Gavel as GavelIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Add as AddIcon,
  EventNote as EventNoteIcon,
  ExpandMore as ExpandMoreIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { FileText, Save, Pencil, Send, RotateCcw } from 'lucide-react';
import { Project } from '../../types';
import { configuratorService } from '../../services/configuratorService';
import type {
  Configuration,
  QuotationPreviewResult,
} from '../../services/configuratorService';
import {
  quotationCompilerService,
  type QuotationRecord,
} from '../../services/quotationCompilerService';
import V2QuotationsPanel from '../../configurator/steps/V2QuotationsPanel';
import { projectService } from '../../services/projectService';
import api from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';
import { UI, TabContainer, EnhancedNavFooter, AnimatedSection } from '../UIComponents';
import dayjs from 'dayjs';

/* ========================================================================
   DESIGN TOKENS
   ======================================================================== */
const T = {
  primary: UI.primary,
  primaryLight: UI.primaryLight,
  primaryBg: UI.primaryBg,
  bg: UI.bg,
  card: UI.bgCard,
  border: UI.border,
  borderLight: UI.borderLight,
  textPrimary: UI.textPrimary,
  textSecondary: UI.textSecondary,
  textMuted: UI.textLight,
  blue: '#3B82F6',
  orange: '#F59E0B',
  red: '#EF4444',
  shadow: UI.shadow,
  shadowMd: UI.shadowMd,
  shadowHover: UI.shadowLg,
  radius: UI.radius,
  radiusSm: UI.radiusSm,
};

/* ========================================================================
   TYPES & CONSTANTS
   ======================================================================== */
interface ScheduleItem { description: string; date: string }

// Quotation form metadata persisted under `configuration.config_data.quotation_meta`.
interface QuotationMeta {
  validity_days: number;
  delivery_terms: string;
  payment_terms: string;
  notes: string;
  terms_conditions: string;
  include_terms: boolean;
  schedule_items: ScheduleItem[];
}

const DEFAULT_NOTES_BASE =
  `Commodity Price Escalation Clause: In the event of an increase in copper and sheet metal costs exceeding 8% year-over-year, an additional charge will apply based on the percentage increase above the 8% threshold.
Freight charges are not included in the quoted price.
Each day of delay in client approval will result in a minimum one-day extension of the delivery date.`;

const buildDefaultNotes = (email: string, baseText: string = DEFAULT_NOTES_BASE) =>
  `${baseText}\nPurchase Orders to be sent to: ${email}`.trim();

const DEFAULT_SCHEDULE: ScheduleItem[] = [
  { description: 'PO release date', date: '' },
  { description: 'Long lead submittal issued to client', date: '' },
  { description: 'Client approved long lead submittal', date: '' },
  { description: 'Approval Drawings issued to client', date: '' },
  { description: 'Client receiving approval drawings', date: '' },
  { description: 'Shipment date', date: '' },
];

const DEFAULT_TERMS_CONDITIONS = `1. ACCEPTANCE OF DOCUMENT.
The terms of the "Contract" between the Seller and the purchaser of the goods ("Buyer") is composed of a signed quote or purchase order, these Terms and Conditions of Sale, and any expressly incorporated documents. This Contract between Buyer and Seller is expressly subject to these Terms and Conditions of Sale. Buyer (i) acknowledges that it has received Seller's Terms and Conditions of Sale, (ii) consents and agrees to be bound by these Seller's Terms and Conditions of Sale, and (iii) acknowledges that any and all terms and conditions of Buyer NOT incorporated into this Contract as an exhibit are hereby expressly rejected by Seller.

2. DELIVERY / RISK OF LOSS
Title to and risk of loss of all goods sold hereunder by Seller shall pass to Buyer upon their delivery F.O.B. Seller's factory to a representative of Buyer, including a common carrier. Any claim by Buyer of loss or damage to the goods in transit shall be the responsibility of the carrier and not of Seller. The dispatch or carriage of the goods shall be affected in all cases at the risk and costs of the Buyer, even if the transportation is effected or organized by the Seller.

3. INSPECTION
Buyer must inspect all goods upon receipt at Seller's factory (if Buyer takes immediate receipt) or upon delivery by a carrier. Buyer must notify the Seller within three (3) days of receipt if there are any defects or shortages in the goods. If Buyer retains the goods after their delivery without giving such timely notice, such failure shall constitute an irrevocable acceptance of the goods by Buyer. Buyer's sole remedy for any defects or nonconformance shall be in accordance with the warranty terms below.

4. PRODUCT RETURNS
Buyer may not return goods to obtain credit or replacement without written approval by an officer of Seller. Custom goods may not be returned. For goods accepted for return, Buyer must pre-pay return shipping costs and a minimum restocking charge of 65% of the invoice price, plus any charges necessary to rework goods into a re-saleable condition.

5. CUSTOM PRODUCTS
Prices for custom goods will be adjusted due to additional information Seller receives after providing its quote. Buyer shall pay for field modifications or factory reworking of custom goods, unless resulting from a deficiency in manufacturing at Seller's factory. Custom goods require a deposit of twenty-five percent (25%) of the purchase price due at signing of a purchase order or quote.

6. SERVICES
Any advice, guidance, or instruction on the use of Seller's products is gratuitous and is not part of the Contract. Seller can provide Buyer with technical support and/or can arrange for installation of goods, upon request, and such services shall be confirmed in a separate written agreement with Seller.

7. WARRANTY
Subject to the terms, conditions, and limitations herein, Seller warrants, to the original Buyer only, that the goods will be free from defects in material and workmanship. Seller's warranty obligations are expressly conditioned upon Buyer having paid in full for the goods. The duration of this express warranty is (A) 12 months after startup or first use, or (B) 18 months after date of shipment from Seller's factory, whichever occurs first. Any repairs or alterations to the goods without the express, written consent of Seller voids the above warranty.

8. CONSEQUENTIAL DAMAGES
Buyer and Seller mutually waive all claims against each other for loss of use, loss of profits, or any other direct or indirect incidental or consequential damages caused by the goods, any defect in the goods, or any claims for breach of contract, tort, or other legal claim relating to or arising from the parties' contract.

9. LIMITATION OF LIABILITY
In the event of any dispute between parties about the goods or the performance of Seller, Seller's maximum monetary liability to Buyer, regardless of the legal theory claimed or the damage or loss asserted or incurred by Buyer, shall be a refund of the amounts paid by Buyer under the parties' contract.

10. DELAYS, DAMAGE OR LOSS
Seller is not responsible for and shall not be liable for delays in shipment or delivery of goods, detention thereof, loss or damage thereto, regardless of the cause (including, but not limited to, work stoppages, riots, terrorism, or force majeure). Factory shipping dates are estimates and are not guarantees.

11. INDEMNITY
Buyer unconditionally releases Seller from any claims, damages, or legal fees that Buyer may suffer, both directly and indirectly, based in whole or in part upon the manner of use of the goods. Buyer will indemnify, defend, and hold Seller harmless from any claims by third parties arising from injury, property damages, economic loss, or other claims that arise as a result of the manner of use or misapplication of the goods.

12. SALES AND TAXES
Unless otherwise indicated, prices are F.O.B. Seller's factory and do not include Federal, state, or municipal sales, use, excise, or similar taxes. All other sales or use taxes upon goods shall be paid by the Buyer to the appropriate taxing authority.

13. PAYMENT
- Orders $0-$5,000: 100% payment due upon shipment F.O.B. Net 30 days from date of invoice.
- Orders $5,000-$500,000: 30% due with purchase order, 40% due upon production start, 30% due upon shipment. Net 30 days from invoice.
- Orders >$500,000: 10% due with purchase order, 60% due upon production start, 30% due upon shipment. Net 30 days from invoice.
The 1st and 2nd payments are required paid in full before shipment.

14. CREDIT HOLD / F.O.B. PAYMENTS
Seller may place Buyer on credit hold when any invoice has not been paid in full within 45 days after the invoice date. Seller may require payments in advance of delivery or C.O.D.

15. DELINQUENT PAYMENTS
A service charge of one and one-half percent (1.5%) per month, simple interest, will be imposed on any unpaid balance of any invoice.

16. LIEN
Title shall remain the property of Seller until the entire purchase price is paid. Buyer agrees to permit Seller or its agents, during reasonable hours, to view and inspect all goods supplied pursuant to this Contract.

17. SECURITY INTEREST
Buyer hereby grants Seller a security interest in the goods until all payments are made and all conditions herein are fully satisfied.

18. DEFAULT
Buyer shall be in default if it fails to perform any of its obligations under this contract, or if bankruptcy or insolvency proceedings are instituted by or against Buyer, or if Buyer makes any assignment for the benefit of creditors.

19. PATENT OR COPYRIGHT INFRINGEMENT
If any goods are fabricated from patterns, plans, drawings, or specifications furnished by Buyer, Buyer shall indemnify and hold harmless Seller against all claims, losses, damages, and expenses (including legal fees) arising out of any suit or claim for infringement of any patent or copyright.`.trim();

/* ========================================================================
   SUB-COMPONENTS
   ======================================================================== */

/* -- Section Header with icon --------------------------------------------- */
const SectionHeader: React.FC<{
  icon: React.ReactElement<any>; title: string; subtitle?: string;
  iconColor?: string; action?: React.ReactNode;
}> = ({ icon, title, subtitle, iconColor = T.primary, action }) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    mb: 2.5, pb: 2, borderBottom: `1px solid ${T.borderLight}`,
  }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
      <Box sx={{
        width: 36, height: 36, borderRadius: '10px',
        background: `linear-gradient(135deg, ${alpha(iconColor, .12)}, ${alpha(iconColor, .04)})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${alpha(iconColor, .1)}`,
      }}>
        {React.cloneElement(icon, { sx: { fontSize: 18, color: iconColor } })}
      </Box>
      <Box>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: T.textPrimary, lineHeight: 1.2 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: '0.72rem', color: T.textMuted, mt: 0.15 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
    {action}
  </Box>
);

/* -- Collapsible Section Header ------------------------------------------ */
const CollapsibleSectionHeader: React.FC<{
  icon: React.ReactElement<any>; title: string; subtitle?: string;
  iconColor?: string; action?: React.ReactNode;
  expanded: boolean; onToggle: () => void;
}> = ({ icon, title, subtitle, iconColor = T.primary, action, expanded, onToggle }) => (
  <Box
    onClick={onToggle}
    sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      mb: expanded ? 2.5 : 0, pb: expanded ? 2 : 0,
      borderBottom: expanded ? `1px solid ${T.borderLight}` : 'none',
      cursor: 'pointer', userSelect: 'none',
      '&:hover .section-title': { color: iconColor },
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
      <Box sx={{
        width: 36, height: 36, borderRadius: '10px',
        background: `linear-gradient(135deg, ${alpha(iconColor, .12)}, ${alpha(iconColor, .04)})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${alpha(iconColor, .1)}`,
        transition: 'background .2s',
      }}>
        {React.cloneElement(icon, { sx: { fontSize: 18, color: iconColor } })}
      </Box>
      <Box>
        <Typography className="section-title" sx={{ fontSize: '0.95rem', fontWeight: 600, color: T.textPrimary, lineHeight: 1.2, transition: 'color .2s' }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: '0.72rem', color: T.textMuted, mt: 0.15 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {action}
      <ExpandMoreIcon sx={{
        fontSize: 20, color: T.textMuted,
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform .25s ease',
      }} />
    </Box>
  </Box>
);

/* -- Price Row ------------------------------------------------------------ */
const PriceRow: React.FC<{
  label: string; value: string; bold?: boolean;
  highlight?: boolean; icon?: React.ReactElement<any>;
}> = ({ label, value, bold, highlight, icon }) => (
  <Box sx={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    py: highlight ? 1.4 : 1.1,
    px: highlight ? 2 : 0,
    mx: highlight ? -0.5 : 0,
    borderRadius: highlight ? T.radiusSm : 0,
    bgcolor: highlight ? alpha(T.primary, .03) : 'transparent',
    border: highlight ? `1px solid ${alpha(T.primary, .1)}` : 'none',
    borderBottom: highlight ? 'none' : `1px solid ${T.borderLight}`,
    '&:last-child': { borderBottom: highlight ? 'none' : 'none' },
  }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
      {icon && React.cloneElement(icon, { sx: { fontSize: 15, color: T.textMuted } })}
      <Typography sx={{
        fontSize: bold ? '0.82rem' : '0.8rem',
        color: bold ? T.textPrimary : T.textSecondary,
        fontWeight: bold ? 700 : 500,
      }}>
        {label}
      </Typography>
    </Box>
    <Typography sx={{
      fontSize: bold ? '0.88rem' : '0.82rem',
      fontWeight: bold ? 800 : 600,
      color: T.textPrimary,
      fontFeatureSettings: '"tnum"',
    }}>
      {value}
    </Typography>
  </Box>
);

/* -- Styled Input --------------------------------------------------------- */
const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '10px',
    fontSize: '0.85rem',
    bgcolor: T.card,
    transition: 'all .2s',
    '& fieldset': { borderColor: T.border },
    '&:hover fieldset': { borderColor: T.textMuted },
    '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: '1.5px' },
    '&.Mui-disabled': { bgcolor: T.borderLight },
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.82rem', fontWeight: 500, color: T.textSecondary,
    '&.Mui-focused': { color: T.primary, fontWeight: 600 },
  },
  '& .MuiFormHelperText-root': {
    fontSize: '0.7rem', fontWeight: 500, color: T.textMuted, mx: 0.5,
  },
};

/* ========================================================================
   MAIN COMPONENT
   ======================================================================== */
interface QuotationTabProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

const QuotationTab: React.FC<QuotationTabProps> = ({ project, onUpdate, onBack, onNext }) => {
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [preview, setPreview] = useState<QuotationPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [latestQuotation, setLatestQuotation] = useState<QuotationRecord | null>(null);
  const { showError, showSuccess } = useNotification();
  const [isEditing, setIsEditing] = useState(false);
  const [isPdfConfirmOpen, setIsPdfConfirmOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    quotationDetails: false,
    scheduleNotes: false,
    termsConditions: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) =>
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));

  const [formData, setFormData] = useState<QuotationMeta>({
    validity_days: 30,
    delivery_terms: 'Ex-Works',
    payment_terms: 'Net 30',
    notes: '',
    terms_conditions: '',
    include_terms: false,
    schedule_items: [...DEFAULT_SCHEDULE],
  });

  /* ── Load latest configuration + run live preview ─────────────────────── */
  const loadData = useCallback(async () => {
    if (!project?.id) return;
    try {
      const list = await configuratorService.listConfigurations({ project_id: project.id });
      if (!list.length) {
        setConfiguration(null);
        setPreview(null);
        setLatestQuotation(null);
        return;
      }
      const newest = [...list].sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
      )[0];
      const cfg = await configuratorService.getConfiguration(newest.id);
      if (!cfg) return;
      setConfiguration(cfg);

      // Hydrate quotation form metadata from config_data.quotation_meta.
      let systemSettings: any = {};
      try {
        const sysRes = await api.get('/settings/system');
        systemSettings = sysRes.data?.data || {};
      } catch {
        /* non-fatal: fall back to hard-coded defaults */
      }
      const savedMeta: Partial<QuotationMeta> = (cfg.config_data?.quotation_meta as any) || {};
      const clientEmail = (project.client as any)?.poc_email || '';
      const defaultNotes = buildDefaultNotes(
        clientEmail,
        systemSettings.quotationCommercialNotes || DEFAULT_NOTES_BASE
      );
      const savedTerms =
        savedMeta.terms_conditions ||
        systemSettings.quotationTerms ||
        DEFAULT_TERMS_CONDITIONS;
      setFormData({
        validity_days: savedMeta.validity_days ?? 30,
        delivery_terms: savedMeta.delivery_terms ?? 'Ex-Works',
        payment_terms: savedMeta.payment_terms ?? 'Net 30',
        notes: savedMeta.notes != null ? savedMeta.notes : defaultNotes,
        terms_conditions: savedTerms,
        include_terms: savedMeta.include_terms === true,
        schedule_items:
          Array.isArray(savedMeta.schedule_items) && savedMeta.schedule_items.length
            ? savedMeta.schedule_items
            : [...DEFAULT_SCHEDULE],
      });

      // Run a live preview against the configurator pricing engine.
      setPreviewLoading(true);
      try {
        const result = await quotationCompilerService.preview(cfg.id);
        setPreview(result);
      } catch (err: any) {
        // Non-fatal — user may have no components yet.
        setPreview(null);
        // eslint-disable-next-line no-console
        console.warn('Quotation preview failed', err?.response?.data?.message || err?.message);
      } finally {
        setPreviewLoading(false);
      }

      // Optionally fetch the most recently compiled quotation for this configuration
      // so we can surface its status (e.g. "sold") and re-download an existing PDF.
      try {
        const quotations = await quotationCompilerService.listQuotations({
          configuration_id: cfg.id,
          project_id: project.id,
        });
        const sortedQ = [...quotations].sort((a, b) =>
          (b.created_at ?? '').localeCompare(a.created_at ?? '')
        );
        setLatestQuotation(sortedQ[0] || null);
      } catch {
        setLatestQuotation(null);
      }
    } catch (err) {
      showError('Error loading configuration data for quotation');
    }
  }, [project, showError]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  /* ── Persist quotation_meta back into the configuration ───────────────── */
  const persistMeta = useCallback(
    async (next: QuotationMeta): Promise<Configuration | null> => {
      if (!configuration?.id) return null;
      const merged = {
        ...(configuration.config_data || {}),
        quotation_meta: next,
      };
      const updated = await configuratorService.updateConfiguration(configuration.id, {
        config_data: merged,
      });
      setConfiguration(updated);
      return updated;
    },
    [configuration]
  );

  const handleSaveQuotation = async () => {
    if (!configuration) return;
    try {
      await persistMeta(formData);
      showSuccess('Quotation saved successfully');
      setIsEditing(false);
      onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving quotation');
    }
  };

  const handleSaveNotes = async () => {
    if (!configuration) return;
    try {
      await persistMeta(formData);
      showSuccess('Notes saved successfully');
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving notes');
    }
  };

  const handleSaveTerms = async () => {
    if (!configuration) return;
    try {
      await persistMeta(formData);
      showSuccess('Terms & Conditions saved successfully');
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving terms');
    }
  };

  /* ── PDF: compile via configurator pipeline + download ────────────────── */
  const compileAndDownloadPdf = async (): Promise<{ quotationId: string; pdfName: string } | null> => {
    if (!configuration?.id) {
      showError('No configuration available for this project. Create one in the Configuration step first.');
      return null;
    }

    let quotationId: string;
    let pdfName: string;

    // ── Case 1: existing quotation with PDF — reuse without recompiling ────
    if (latestQuotation?.id && latestQuotation?.pdf_document_id) {
      quotationId = latestQuotation.id;
      pdfName = `Quotation-${project.quotation_number || latestQuotation.code || quotationId}.pdf`;

    // ── Case 2: quotation exists but PDF generation previously failed ──────
    } else if (latestQuotation?.id) {
      await persistMeta(formData);
      const result = await quotationCompilerService.regeneratePdf(latestQuotation.id);
      quotationId = latestQuotation.id;
      pdfName = `Quotation-${project.quotation_number || latestQuotation.code || quotationId}.pdf`;
      setLatestQuotation(
        (prev) => (result.quotation ? { ...(prev || {}), ...result.quotation } as QuotationRecord : prev)
      );

    // ── Case 3: no quotation yet — full compile + persist + generate PDF ───
    } else {
      await persistMeta(formData);
      const compiled = await quotationCompilerService.compile(configuration.id, {
        generate_pdf: true,
      });
      const rawId = compiled?.quotation?.id;
      if (!rawId) {
        throw new Error('Compile succeeded but no quotation id was returned');
      }
      quotationId = rawId;
      pdfName =
        compiled.document?.file_name ||
        `Quotation-${project.quotation_number || compiled.quotation?.code || quotationId}.pdf`;
      setLatestQuotation(
        (prev) => (compiled.quotation ? { ...(prev || {}), ...compiled.quotation } as QuotationRecord : prev)
      );
    }

    const blob = await quotationCompilerService.downloadPdf(quotationId);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return { quotationId, pdfName };
  };

  const handleGeneratePdf = async () => {
    try {
      const result = await compileAndDownloadPdf();
      if (result) showSuccess('Quotation PDF generated successfully');
    } catch (err: any) {
      showError(err.response?.data?.message || err?.message || 'Error generating quotation PDF');
    }
  };

  const handleSendToClient = async () => {
    if (!configuration) return;
    const clientEmail = (project.client?.poc_email || '').trim();
    const clientCC = (project.client as any)?.cc_email || '';
    if (!clientEmail) {
      showError('Email ID not available');
      return;
    }
    try {
      const result = await compileAndDownloadPdf();
      if (!result) return;

      // Mark project as quoted (transition only allowed from a few statuses).
      const sendableStatuses = ['draft', 'estimated', 'configured'];
      if (sendableStatuses.includes(project.status)) {
        try {
          await projectService.updateStatus(project.id, 'quoted');
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Failed to update project status to quoted', e);
        }
      }

      // Open mailto so the user can attach the PDF that was just downloaded.
      const quotationNumber = project.quotation_number || `Quotation-${project.id}`;
      const clientName = project.client?.poc_name || project.client?.client_name || 'Client';
      const projectName = project.project_name || '';
      const subject = encodeURIComponent(
        `Quotation ${quotationNumber}${projectName ? ` | ${projectName}` : ''}`
      );
      const body = encodeURIComponent(
        `Dear ${clientName},\n\nPlease find attached Quotation ${quotationNumber}${projectName ? ` for project ${projectName}` : ''}.\n\nPlease review the attached quotation and let us know if you need any clarification.\n\nRegards`
      );
      const ccParam = clientCC ? `&cc=${encodeURIComponent(clientCC)}` : '';
      window.location.href = `mailto:${clientEmail}?subject=${subject}&body=${body}${ccParam}`;

      showSuccess('PDF downloaded. Please attach it to the email that opened.');
      onUpdate();
      loadData();
    } catch (err: any) {
      showError(err.response?.data?.message || err?.message || 'Error sending quotation');
    }
  };

  const handleNext = () => {
    if (project.status !== 'quoted') {
      showError('Please send the quotation to the client before proceeding to the next step.');
      return;
    }
    onNext?.();
  };

  /* -- Computed values: derive ALL totals from the configurator preview -- */
  const totals: any = preview?.totals || {};
  const labour: any = preview?.labour || {};
  const items: any[] = preview?.items || [];

  const rawMaterial = Math.round(Number(totals.material_total ?? 0));
  const processCost = Math.round(Number(labour?.totals?.cost_total ?? 0));
  const overhead = Math.round(
    Number(totals.overhead_amount ?? 0) + Number(totals.copper_cost ?? 0)
  );
  const totalCost = Math.round(Number(totals.total_cost ?? 0));
  const marginAmt = Math.round(Number(totals.actual_profit ?? 0));
  const marginPct = Number(((totals.actual_gm ?? 0) * 100).toFixed(2));
  const finalPrice = Math.round(Number(totals.rounded_price ?? totals.target_price ?? 0));
  const validUntil = dayjs().add(Number(formData.validity_days) || 30, 'day').format('YYYY-MM-DD');
  const hasConfiguration = !!configuration;

  return (
    <TabContainer>

      {/* Designer (V2) quotations — revision chain, proposal, handoff */}
      {project?.id && <V2QuotationsPanel projectId={project.id} onChanged={onUpdate} />}

      {/* ================================================================
          PAGE HEADER
          ================================================================ */}
      <AnimatedSection>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 1.5, mb: 3,
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
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Quotation
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: T.textMuted }}>
              {project.quotation_number || 'Generate quotation'}
            </Typography>
          </Box>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
        {/* {!isEditing && (
          <Button
            variant="contained"
            startIcon={<Send size={16} />}
            onClick={handleSendToClient}
            disabled={!hasConfiguration || isSending}
            sx={{
              borderRadius: '10px', height: 42, px: 3,
              textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
              color: '#000', background: T.primary,
              boxShadow: T.shadow,
              '&:hover': { background: '#116b33', color: '#000', boxShadow: T.shadowMd },
              '&.Mui-disabled': { color: '#000', background: T.primary, opacity: 0.5 },
              transition: 'all .2s',
            }}
          >
            {['quoted', 'order_confirmed', 'in_production', 'inspected', 'shipped', 'closed'].includes(project.status) ? 'Sent to Client' : 'Send to Client'}
          </Button>
        )} */}
        {isEditing ? (
          <Button
            variant="outlined"
            onClick={() => setIsEditing(false)}
            sx={{
              borderRadius: '10px', height: 42, px: 3,
              textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
              borderColor: T.border, color: T.textSecondary,
              '&:hover': { borderColor: T.textMuted, background: T.borderLight },
            }}
          >
            Cancel
          </Button>
        ) : (
          <Button
            variant="outlined"
            startIcon={<Pencil size={16} />}
            onClick={() => setIsEditing(true)}
            sx={{
              borderRadius: '10px', height: 42, px: 3,
              textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
              borderColor: T.border, color: T.textSecondary,
              '&:hover': { background: T.borderLight, borderColor: T.textMuted },
              transition: 'all .2s',
            }}
          >
            Edit Quotation
          </Button>
        )}
        </Stack>
      </Box>
      </AnimatedSection>

      {/* ================================================================
          MAIN 2-COLUMN LAYOUT
          ================================================================ */}
      <Grid container spacing={2}>

        {/* ============================================================
            LEFT COLUMN: QUOTATION FORM
            ============================================================ */}
        <Grid item xs={12} md={8}>
          <Card elevation={0} sx={{
            border: `1px solid ${T.border}`, borderRadius: T.radius,
            overflow: 'hidden', boxShadow: T.shadow,
            transition: 'box-shadow .3s',
            '&:hover': { boxShadow: T.shadowMd },
          }}>
            {/* Accent stripe */}
            <Box sx={{
              height: 3,
              background: `linear-gradient(90deg, ${T.primary}, ${T.primaryLight})`,
            }} />

            <Box sx={{ p: { xs: 2.5, md: '28px 32px' } }}>
              <CollapsibleSectionHeader
                icon={<FileText size={18} />}
                title="Quotation Details"
                subtitle="Review and manage quotation parameters"
                expanded={expandedSections.quotationDetails}
                onToggle={() => toggleSection('quotationDetails')}
                action={
                  hasConfiguration && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconButton
                        size='small'
                        onClick={async (e) => {
                          e.stopPropagation();
                          setIsGeneratingPdf(true);
                          await handleGeneratePdf();
                          setIsGeneratingPdf(false);
                        }}
                        disabled={isGeneratingPdf}
                        sx={{
                          border: `1px solid ${T.border}`,
                          bgcolor: T.borderLight,
                          '&:hover': {bgcolor: T.borderLight},
                        }}
                        aria-label='Download Qoutation PDF'
                      >
                        {isGeneratingPdf ? <CircularProgress size={16} /> : <PdfIcon sx={{ fontSize: 16, color: T.textSecondary }} />}
                      </IconButton>
                      <Chip
                      label={configuration?.code || configuration?.name || 'Configuration'}
                      size="small"
                      sx={{
                        fontWeight: 600, fontSize: '0.7rem',
                        bgcolor: T.borderLight, color: T.textSecondary,
                        border: `1px solid ${T.border}`, borderRadius: '8px',
                      }}
                    />
                    </Stack>
                  )
                }
              />

               <Dialog
                  open={isPdfConfirmOpen}
                  onClose={() => setIsPdfConfirmOpen(false)}
                >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  Notice
                  <IconButton size='small' onClick={() => setIsPdfConfirmOpen(false)} aria-label='close'>
                    <CloseIcon sx={{ fontSize: 18 }}/>
                  </IconButton>
                </DialogTitle>
                  <DialogContent>
                    <Typography sx={{ fontSize: '0.85rem', color: T.textSecondary }}>
                      please make sure you've selected all the terms and condtions
                    </Typography>
                  </DialogContent>
                  <DialogActions>
                    <Button
                        variant="contained"
                        onClick={async () => {
                          setIsPdfConfirmOpen(false);
                          await handleGeneratePdf();
                        }}
                        sx={{ textTransform: 'none' }}
                    >
                      Okay
                    </Button>
                  </DialogActions>
              </Dialog>

              <Collapse in={expandedSections.quotationDetails}>
                <Grid container spacing={2} sx={{ mt: 0 }}>
                  {/* Quotation Number */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth size="small"
                      label="Quotation Number"
                      value={project.quotation_number || '-'}
                      disabled
                      InputProps={{ readOnly: true }}
                      helperText="Auto-generated quotation reference number"
                      sx={inputSx}
                    />
                  </Grid>

                  {/* Project Name */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth size="small"
                      label="Project Name"
                      value={project.project_name || '-'}
                      disabled
                      InputProps={{ readOnly: true }}
                      sx={inputSx}
                    />
                  </Grid>

                  {/* Validity Days */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth size="small"
                      label="Validity (Days)"
                      value={formData.validity_days}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0))
                          setFormData({ ...formData, validity_days: val as any });
                      }}
                      onBlur={(e) => {
                        const num = parseInt(e.target.value) || 30;
                        setFormData({ ...formData, validity_days: num });
                      }}
                      disabled={!isEditing}
                      inputProps={{ inputMode: 'numeric' }}
                      helperText={
                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CalendarIcon sx={{ fontSize: 12 }} />
                          Valid until: {validUntil}
                        </Box>
                      }
                      sx={inputSx}
                    />
                  </Grid>

                  {/* Delivery Terms */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth size="small"
                      label="Delivery Terms"
                      value={formData.delivery_terms}
                      onChange={(e) => setFormData({ ...formData, delivery_terms: e.target.value })}
                      disabled={!isEditing}
                      placeholder="Ex-Works, FOB, CIF, etc."
                      sx={inputSx}
                    />
                  </Grid>

                  {/* Payment Terms */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth size="small"
                      label="Payment Terms"
                      value={formData.payment_terms}
                      onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                      disabled={!isEditing}
                      placeholder="Net 30, 50% Advance, etc."
                      sx={inputSx}
                    />
                  </Grid>

                </Grid>
              </Collapse>
            </Box>
          </Card>

          {/* ============================================================
              CONFIGURATOR ITEMS (read-only) — preview.items
              ============================================================ */}
          <Card elevation={0} sx={{
            mt: 2, border: `1px solid ${T.border}`, borderRadius: T.radius,
            overflow: 'hidden', boxShadow: T.shadow,
            transition: 'box-shadow .3s',
            '&:hover': { boxShadow: T.shadowMd },
          }}>
            <Box sx={{
              height: 3,
              background: `linear-gradient(90deg, ${T.primary}, ${T.primaryLight})`,
            }} />
            <Box sx={{ p: { xs: 2.5, md: '28px 32px' } }}>
              <SectionHeader
                icon={<FileText size={18} />}
                title="Selected Components"
                subtitle="Items derived from the configurator BOM — read-only"
                action={
                  previewLoading ? <CircularProgress size={14} /> : (
                    <Chip
                      label={`${items.length} ${items.length === 1 ? 'item' : 'items'}`}
                      size="small"
                      sx={{
                        fontWeight: 600, fontSize: '0.7rem',
                        bgcolor: T.borderLight, color: T.textSecondary,
                        border: `1px solid ${T.border}`, borderRadius: '8px',
                      }}
                    />
                  )
                }
              />
              {items.length === 0 ? (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.82rem', color: T.textMuted }}>
                    {previewLoading
                      ? 'Computing preview…'
                      : hasConfiguration
                        ? 'No components yet. Add components in the Configuration step.'
                        : 'No configuration found for this project.'}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Box component="table" sx={{
                    width: '100%', borderCollapse: 'collapse',
                    '& th': {
                      textAlign: 'left', fontSize: '0.72rem', fontWeight: 700,
                      color: T.textMuted, textTransform: 'uppercase',
                      letterSpacing: '0.04em', padding: '8px 10px',
                      borderBottom: `1px solid ${T.border}`,
                    },
                    '& td': {
                      fontSize: '0.78rem', color: T.textPrimary,
                      padding: '8px 10px', borderBottom: `1px solid ${T.borderLight}`,
                      fontFeatureSettings: '"tnum"',
                    },
                    '& td.num': { textAlign: 'right' },
                    '& th.num': { textAlign: 'right' },
                  }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Part</th>
                        <th>Description</th>
                        <th className="num">Qty</th>
                        <th className="num">Unit</th>
                        <th className="num">Ext</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.line_number ?? i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{it.part_number ?? it.name ?? '—'}</td>
                          <td style={{ color: T.textSecondary }}>{it.description || it.name || ''}</td>
                          <td className="num">{it.quantity ?? 1}</td>
                          <td className="num">{`$ ${Number(it.unit_cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{`$ ${Number(it.total_cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Box>
                </Box>
              )}
            </Box>
          </Card>

          {/* ============================================================
              PROJECT SCHEDULE & COMMERCIAL NOTES
              ============================================================ */}
          <Card elevation={0} sx={{
            mt: 2, border: `1px solid ${T.border}`, borderRadius: T.radius,
            overflow: 'hidden', boxShadow: T.shadow,
            transition: 'box-shadow .3s',
            '&:hover': { boxShadow: T.shadowMd },
          }}>
            <Box sx={{
              height: 3,
              background: `linear-gradient(90deg, ${T.primary}, ${T.primaryLight})`,
            }} />
            <Box sx={{ p: { xs: 2.5, md: '28px 32px' } }}>
              <CollapsibleSectionHeader
                icon={<EventNoteIcon />}
                title="Project Schedule & Commercial Notes"
                subtitle="Schedule details and commercial notes — shown in PDF"
                expanded={expandedSections.scheduleNotes}
                onToggle={() => toggleSection('scheduleNotes')}
              />
              <Collapse in={expandedSections.scheduleNotes}>
                <Box sx={{ mt: 0 }}>
                  <TextField
                    fullWidth
                    multiline
                    rows={5}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={`Enter schedule and commercial notes (each line becomes a bullet point in the PDF).\n\nExample:\n500 Units Lead Time 3 Weeks\nAdditional 250 Units, extra 2 Weeks`}
                    sx={{
                      width: '100%',
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '10px',
                        fontSize: '0.85rem',
                        bgcolor: T.card,
                        lineHeight: 1.7,
                        transition: 'all .2s',
                        '& fieldset': { borderColor: T.border },
                        '&:hover fieldset': { borderColor: T.textMuted },
                        '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: '1.5px' },
                        '&.Mui-disabled': { bgcolor: T.borderLight },
                      },
                    }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.7rem', color: T.textMuted, fontWeight: 500, flex: '1 1 auto', minWidth: 0 }}>
                      Each line will appear as a bullet point under &quot;Project Schedule &amp; Commercial Notes&quot; in the generated PDF.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RotateCcw size={14} />}
                        onClick={() => {
                          api.get('/settings/system').then(res => {
                            const sys = res.data?.data || {};
                            setFormData({ ...formData, notes: buildDefaultNotes((project.client as any)?.poc_email || '', sys.quotationNotes || DEFAULT_NOTES_BASE) });
                          }).catch(() => {
                            setFormData({ ...formData, notes: buildDefaultNotes((project.client as any)?.poc_email || '') });
                          });
                        }}
                        sx={{
                          textTransform: 'none', fontSize: '0.75rem', fontWeight: 600,
                          borderRadius: '8px', borderColor: T.border, color: T.textSecondary,
                          '&:hover': { bgcolor: T.borderLight, borderColor: T.textMuted },
                        }}
                      >
                        Load Default
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<Save size={13} />}
                        disabled={!hasConfiguration}
                        onClick={handleSaveNotes}
                        sx={{
                          textTransform: 'none', fontSize: '0.75rem', fontWeight: 600,
                          borderRadius: '8px', background: T.primary,
                          boxShadow: 'none',
                          '&:hover': { background: '#116b33' },
                        }}
                      >
                        Save
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Collapse>
            </Box>
          </Card>



          {/* ============================================================
              TERMS & CONDITIONS
              ============================================================ */}
          <Card elevation={0} sx={{
            mt: 2, border: `1px solid ${T.border}`, borderRadius: T.radius,
            overflow: 'hidden', boxShadow: T.shadow,
            transition: 'box-shadow .3s',
            '&:hover': { boxShadow: T.shadowMd },
          }}>
            <Box sx={{
              height: 3,
              background: `linear-gradient(90deg, ${T.primary}, ${T.primaryLight})`,
            }} />
            <Box sx={{ p: { xs: 2.5, md: '28px 32px' } }}>
              <CollapsibleSectionHeader
                icon={<GavelIcon />}
                title="Terms & Conditions"
                subtitle="Included in quotation PDF when enabled"
                expanded={expandedSections.termsConditions}
                onToggle={() => toggleSection('termsConditions')}
              />
              <Collapse in={expandedSections.termsConditions}>
                <Box sx={{ mt: 0 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.include_terms}
                        onChange={(e) => setFormData({ ...formData, include_terms: e.target.checked })}
                        sx={{ color: T.primary, '&.Mui-checked': { color: T.primary } }}
                      />
                    }
                    label={
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: T.textPrimary }}>
                        Include Terms &amp; Conditions in PDF
                      </Typography>
                    }
                    sx={{ mb: 1.5 }}
                  />
                  <Collapse in={formData.include_terms}>
                    <TextField
                      fullWidth
                      multiline
                      rows={10}
                      value={formData.terms_conditions}
                      onChange={(e) => setFormData({ ...formData, terms_conditions: e.target.value })}
                      placeholder="Enter Terms & Conditions..."
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '10px',
                          fontSize: '0.8rem',
                          bgcolor: T.card,
                          lineHeight: 1.7,
                          transition: 'all .2s',
                          '& fieldset': { borderColor: T.border },
                          '&:hover fieldset': { borderColor: T.textMuted },
                          '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: '1.5px' },
                          '&.Mui-disabled': { bgcolor: T.borderLight },
                        },
                      }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}>
                      <Typography sx={{ fontSize: '0.7rem', color: T.textMuted, fontWeight: 500 }}>
                        These terms will appear as a separate section in the generated PDF.
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<RotateCcw size={14} />}
                          onClick={() => {
                            api.get('/settings/system').then(res => {
                              const sys = res.data?.data || {};
                              setFormData({ ...formData, terms_conditions: sys.quotationTerms || DEFAULT_TERMS_CONDITIONS });
                            }).catch(() => {
                              setFormData({ ...formData, terms_conditions: DEFAULT_TERMS_CONDITIONS });
                            });
                          }}
                          sx={{
                            textTransform: 'none', fontSize: '0.75rem', fontWeight: 600,
                            borderRadius: '8px', borderColor: T.border, color: T.textSecondary,
                            '&:hover': { bgcolor: T.borderLight, borderColor: T.textMuted },
                          }}
                        >
                          Load Default
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Save size={13} />}
                          disabled={!hasConfiguration}
                          onClick={handleSaveTerms}
                          sx={{
                            textTransform: 'none', fontSize: '0.75rem', fontWeight: 600,
                            borderRadius: '8px', background: T.primary,
                            boxShadow: 'none',
                            '&:hover': { background: '#116b33' },
                          }}
                        >
                          Save
                        </Button>
                      </Box>
                    </Box>
                  </Collapse>
                </Box>
              </Collapse>
            </Box>
          </Card>

          {/* Generate PDF + Save Quotation buttons */}
          <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<PdfIcon sx={{ fontSize: 18 }} />}
              onClick={handleGeneratePdf}
              disabled={!hasConfiguration || isGeneratingPdf}
              sx={{
                borderRadius: '10px', height: 42, px: 3,
                textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
                borderColor: T.border, color: T.textSecondary,
                '&:hover': { bgcolor: T.borderLight, borderColor: T.textMuted },
                transition: 'all .2s',
              }}
            >
              Generate Quotation PDF
            </Button>
            {isEditing && (
              <Button
                variant="contained"
                startIcon={<Save size={16} />}
                onClick={handleSaveQuotation}
                sx={{
                  background: T.primary, borderRadius: '10px', height: 42, px: 3,
                  textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
                  boxShadow: T.shadow,
                  '&:hover': { background: '#116b33', boxShadow: T.shadowMd },
                  transition: 'all .2s',
                }}
              >
                Save Quotation
              </Button>
            )}
            {!isEditing && (
              <Typography sx={{ fontSize: '0.75rem', color: T.textMuted, fontWeight: 500 }}>
                Click <strong>Edit Quotation</strong> to make changes.
              </Typography>
            )}
            {!hasConfiguration && (
              <Typography sx={{ fontSize: '0.75rem', color: T.orange, fontWeight: 500 }}>
                &#9888; No configuration found for this project. Add components in the Configuration step first.
              </Typography>
            )}
          </Box>
        </Grid>

        {/* ============================================================
            RIGHT COLUMN: PRICE SUMMARY (Sticky)
            ============================================================ */}
        <Grid item xs={12} md={4}>
          <Box sx={{ position: 'sticky', top: 24 }}>
            {/* Sent badge */}
            {project.status === 'quoted' && (
              <Box sx={{
                mb: 2, display: 'flex', alignItems: 'center', gap: 1,
                px: 2, py: 1.2, borderRadius: T.radiusSm,
                bgcolor: T.primaryBg, border: `1px solid ${alpha(T.primary, .2)}`,
              }}>
                <CheckCircleIcon sx={{ color: T.primary, fontSize: 18 }} />
                <Typography sx={{ color: T.primary, fontWeight: 600, fontSize: '0.8rem' }}>
                  Quotation Sent to Client
                </Typography>
              </Box>
            )}

            <Card elevation={0} sx={{
              border: `1px solid ${T.border}`, borderRadius: T.radius,
              overflow: 'hidden', boxShadow: T.shadow,
              transition: 'box-shadow .3s',
              '&:hover': { boxShadow: T.shadowMd },
            }}>
              {/* Accent stripe */}
              <Box sx={{
                height: 3,
                background: `linear-gradient(90deg, ${T.primary}, ${T.primaryLight})`,
              }} />

              <Box sx={{ p: '24px 24px 20px' }}>
                <SectionHeader
                  icon={<MoneyIcon />}
                  title="Price Summary"
                  subtitle="Cost breakdown & quoted price"
                  iconColor={T.primary}
                />

                {/* Cost breakdown */}
                <Box sx={{ mb: 2.5 }}>
                  <PriceRow label="Raw Material" value={`$ ${rawMaterial.toLocaleString()}`} />
                  <PriceRow label="Process Cost" value={`$ ${processCost.toLocaleString()}`} />
                  <PriceRow label="Overhead" value={`$ ${overhead.toLocaleString()}`} />
                </Box>

                {/* Total Cost */}
                <PriceRow
                  label="Total Cost"
                  value={`$ ${totalCost.toLocaleString()}`}
                  bold highlight
                />

                {/* Margin */}
                <Box sx={{ mt: 1.5 }}>
                  <PriceRow
                    label={`Margin (${marginPct}%)`}
                    value={`$ ${marginAmt.toLocaleString()}`}
                  />
                </Box>

                {/* Quoted Price Hero */}
                <Box sx={{
                  mt: 3, p: '22px 24px', borderRadius: T.radiusSm,
                  background: `linear-gradient(135deg, ${T.primary} 0%, #116b33 100%)`,
                  textAlign: 'center',
                  boxShadow: `0 4px 16px ${alpha(T.primary, .25)}`,
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Decorative circles */}
                  <Box sx={{
                    position: 'absolute', top: -20, right: -20,
                    width: 80, height: 80, borderRadius: '50%',
                    bgcolor: 'rgba(255,255,255,.06)',
                  }} />
                  <Box sx={{
                    position: 'absolute', bottom: -15, left: -15,
                    width: 60, height: 60, borderRadius: '50%',
                    bgcolor: 'rgba(255,255,255,.04)',
                  }} />

                  <Typography sx={{
                    color: 'rgba(255,255,255,.7)', textTransform: 'uppercase',
                    letterSpacing: '0.12em', fontSize: '0.62rem', fontWeight: 600,
                  }}>
                    Quoted Price
                  </Typography>
                  <Typography sx={{
                    color: '#FFFFFF', fontWeight: 900, fontSize: '2rem',
                    mt: 0.5, letterSpacing: '-0.02em',
                    fontFeatureSettings: '"tnum"',
                  }}>
                    $ {finalPrice.toLocaleString()}
                  </Typography>
                </Box>

                {/* Configuration / quotation status badge */}
                <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    icon={previewLoading
                      ? <ScheduleIcon sx={{ fontSize: 14 }} />
                      : preview
                        ? <CheckCircleIcon sx={{ fontSize: 14 }} />
                        : <ScheduleIcon sx={{ fontSize: 14 }} />
                    }
                    label={previewLoading
                      ? 'Computing…'
                      : preview
                        ? 'Live Pricing'
                        : hasConfiguration
                          ? 'Awaiting components'
                          : 'No configuration'}
                    size="small"
                    sx={{
                      fontWeight: 600, fontSize: '0.72rem', borderRadius: '8px',
                      bgcolor: preview ? T.primaryBg : '#FFF7ED',
                      color: preview ? T.primary : T.orange,
                      border: `1px solid ${preview ? alpha(T.primary, .2) : alpha(T.orange, .2)}`,
                    }}
                  />
                  {latestQuotation && (
                    <Chip
                      label={`Last compiled: ${latestQuotation.code || latestQuotation.id?.slice(0, 8)}${latestQuotation.status ? ` · ${latestQuotation.status}` : ''}`}
                      size="small"
                      sx={{
                        fontWeight: 600, fontSize: '0.7rem', borderRadius: '8px',
                        bgcolor: T.borderLight, color: T.textSecondary,
                        border: `1px solid ${T.border}`,
                      }}
                    />
                  )}
                </Box>
              </Box>
            </Card>

            {/* Quick Info */}
            <Card elevation={0} sx={{
              mt: 2, border: `1px solid ${T.border}`, borderRadius: T.radius,
              overflow: 'hidden', boxShadow: T.shadow,
            }}>
              <Box sx={{ p: '18px 24px' }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: T.textPrimary, mb: 1.5 }}>
                  Quick Info
                </Typography>
                <Stack spacing={1.2}>
                  {[
                    { icon: <CalendarIcon />, label: 'Valid Until', value: validUntil },
                    { icon: <ShippingIcon />, label: 'Delivery', value: formData.delivery_terms },
                    { icon: <PaymentIcon />, label: 'Payment', value: formData.payment_terms },
                  ].map(item => (
                    <Box key={item.label} sx={{
                      display: 'flex', alignItems: 'center', gap: 1.2,
                      py: 0.8, px: 1.5, borderRadius: '8px',
                      bgcolor: T.borderLight,
                      transition: 'all .2s',
                      '&:hover': { bgcolor: alpha(T.primary, .03) },
                    }}>
                      {React.cloneElement(item.icon, { sx: { fontSize: 15, color: T.textMuted } })}
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: '0.68rem', color: T.textMuted, fontWeight: 500, lineHeight: 1 }}>
                          {item.label}
                        </Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: T.textPrimary, fontWeight: 600, mt: 0.15 }}>
                          {item.value}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </Card>
          </Box>
        </Grid>
      </Grid>

      <EnhancedNavFooter onBack={onBack} onNext={onNext} backLabel="Back to Estimation" nextLabel="Next: PO from Client" />
    </TabContainer>
  );
};

export default QuotationTab;
