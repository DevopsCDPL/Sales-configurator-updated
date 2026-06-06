import os

filepath = r'c:\Users\priya\Forged-Final\frontend\src\components\ProjectTabs\QuotationTab.tsx'
BT = '\x60'

content = f"""import React, {{ useState, useEffect }} from 'react';
import {{
  Box, Typography, Card, Grid, TextField, Button, alpha,
  Chip, Checkbox, FormControlLabel, Collapse, Stack,
}} from '@mui/material';
import {{
  PictureAsPdf as PdfIcon,
  Send as SendIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  SettingsBackupRestore as RestoreIcon,
  Description as QuoteIcon,
  AttachMoney as MoneyIcon,
  Receipt as ReceiptIcon,
  CalendarToday as CalendarIcon,
  LocalShipping as ShippingIcon,
  Payment as PaymentIcon,
  Notes as NotesIcon,
  Gavel as GavelIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
}} from '@mui/icons-material';
import {{ Project, Estimate }} from '../../types';
import {{ estimateService }} from '../../services/estimateService';
import {{ useNotification }} from '../../contexts/NotificationContext';
import dayjs from 'dayjs';

/* ========================================================================
   DESIGN TOKENS
   ======================================================================== */
const T = {{
  primary: '#15803d',
  primaryLight: '#22c55e',
  primaryBg: '#F0FDF4',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  blue: '#3B82F6',
  orange: '#F59E0B',
  red: '#EF4444',
  shadow: '0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03)',
  shadowMd: '0 4px 12px rgba(0,0,0,.06)',
  shadowHover: '0 8px 25px rgba(0,0,0,.07), 0 4px 10px rgba(0,0,0,.04)',
  radius: '16px',
  radiusSm: '12px',
}};

/* ========================================================================
   TYPES & CONSTANTS
   ======================================================================== */
interface LineItem {{ description: string; unit_price: number; quantity: number }}
interface ScheduleItem {{ description: string; date: string }}
interface BomItem {{ section: string; parameter: string; quantity: number }}

const DEFAULT_NOTES =
  {BT}Commodity Price Escalation Clause: In the event of an increase in copper and sheet metal costs exceeding 8% year-over-year, an additional charge will apply based on the percentage increase above the 8% threshold.
Freight charges are not included in the quoted price.
Each day of delay in client approval will result in a minimum one-day extension of the delivery date.{BT};

const DEFAULT_SCHEDULE: ScheduleItem[] = [
  {{ description: 'PO release date', date: '' }},
  {{ description: 'Long lead submittal issued to client', date: '' }},
  {{ description: 'Client approved long lead submittal', date: '' }},
  {{ description: 'Approval Drawings issued to client', date: '' }},
  {{ description: 'Client receiving approval drawings', date: '' }},
  {{ description: 'Shipment date', date: '' }},
];

const DEFAULT_TERMS_CONDITIONS = {BT}1. ACCEPTANCE OF DOCUMENT.
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
If any goods are fabricated from patterns, plans, drawings, or specifications furnished by Buyer, Buyer shall indemnify and hold harmless Seller against all claims, losses, damages, and expenses (including legal fees) arising out of any suit or claim for infringement of any patent or copyright.{BT}.trim();

/* ========================================================================
   SUB-COMPONENTS
   ======================================================================== */

/* -- Section Header with icon --------------------------------------------- */
const SectionHeader: React.FC<{{
  icon: React.ReactElement; title: string; subtitle?: string;
  iconColor?: string; action?: React.ReactNode;
}}> = ({{ icon, title, subtitle, iconColor = T.primary, action }}) => (
  <Box sx={{{{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    mb: 2.5, pb: 2, borderBottom: {BT}1px solid ${{T.borderLight}}{BT},
  }}}}>
    <Box sx={{{{ display: 'flex', alignItems: 'center', gap: 1.2 }}}}>
      <Box sx={{{{
        width: 36, height: 36, borderRadius: '10px',
        background: {BT}linear-gradient(135deg, ${{alpha(iconColor, .12)}}, ${{alpha(iconColor, .04)}}){BT},
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: {BT}1px solid ${{alpha(iconColor, .1)}}{BT},
      }}}}>
        {{React.cloneElement(icon, {{ sx: {{ fontSize: 18, color: iconColor }} }})}}
      </Box>
      <Box>
        <Typography sx={{{{ fontSize: '0.95rem', fontWeight: 700, color: T.textPrimary, lineHeight: 1.2 }}}}>
          {{title}}
        </Typography>
        {{subtitle && (
          <Typography sx={{{{ fontSize: '0.72rem', color: T.textMuted, mt: 0.15 }}}}>
            {{subtitle}}
          </Typography>
        )}}
      </Box>
    </Box>
    {{action}}
  </Box>
);

/* -- Price Row ------------------------------------------------------------ */
const PriceRow: React.FC<{{
  label: string; value: string; bold?: boolean;
  highlight?: boolean; icon?: React.ReactElement;
}}> = ({{ label, value, bold, highlight, icon }}) => (
  <Box sx={{{{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    py: highlight ? 1.4 : 1.1,
    px: highlight ? 2 : 0,
    mx: highlight ? -0.5 : 0,
    borderRadius: highlight ? T.radiusSm : 0,
    bgcolor: highlight ? alpha(T.primary, .03) : 'transparent',
    border: highlight ? {BT}1px solid ${{alpha(T.primary, .1)}}{BT} : 'none',
    borderBottom: highlight ? 'none' : {BT}1px solid ${{T.borderLight}}{BT},
    '&:last-child': {{ borderBottom: highlight ? 'none' : 'none' }},
  }}}}>
    <Box sx={{{{ display: 'flex', alignItems: 'center', gap: 0.8 }}}}>
      {{icon && React.cloneElement(icon, {{ sx: {{ fontSize: 15, color: T.textMuted }} }})}}
      <Typography sx={{{{
        fontSize: bold ? '0.82rem' : '0.8rem',
        color: bold ? T.textPrimary : T.textSecondary,
        fontWeight: bold ? 700 : 500,
      }}}}>
        {{label}}
      </Typography>
    </Box>
    <Typography sx={{{{
      fontSize: bold ? '0.88rem' : '0.82rem',
      fontWeight: bold ? 800 : 600,
      color: T.textPrimary,
      fontFeatureSettings: '"tnum"',
    }}}}>
      {{value}}
    </Typography>
  </Box>
);

/* -- Styled Input --------------------------------------------------------- */
const inputSx = {{
  '& .MuiOutlinedInput-root': {{
    borderRadius: '10px',
    fontSize: '0.85rem',
    bgcolor: T.card,
    transition: 'all .2s',
    '& fieldset': {{ borderColor: T.border }},
    '&:hover fieldset': {{ borderColor: T.textMuted }},
    '&.Mui-focused fieldset': {{ borderColor: T.primary, borderWidth: '1.5px' }},
    '&.Mui-disabled': {{ bgcolor: T.borderLight }},
  }},
  '& .MuiInputLabel-root': {{
    fontSize: '0.82rem', fontWeight: 500, color: T.textSecondary,
    '&.Mui-focused': {{ color: T.primary, fontWeight: 600 }},
  }},
  '& .MuiFormHelperText-root': {{
    fontSize: '0.7rem', fontWeight: 500, color: T.textMuted, mx: 0.5,
  }},
}};

/* ========================================================================
   MAIN COMPONENT
   ======================================================================== */
interface QuotationTabProps {{
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
}}

const QuotationTab: React.FC<QuotationTabProps> = ({{ project, onUpdate, onBack, onNext }}) => {{
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const {{ showError, showSuccess }} = useNotification();
  const [isEditing, setIsEditing] = useState(false);
  const [tcSaving, setTcSaving] = useState(false);
  const [tcSaved, setTcSaved] = useState(false);
  const [formData, setFormData] = useState({{
    validity_days: 30,
    delivery_terms: 'Ex-Works',
    payment_terms: 'Net 30',
    notes: DEFAULT_NOTES,
    terms_conditions: '',
    include_terms: false,
    line_items: [] as LineItem[],
    schedule_items: [...DEFAULT_SCHEDULE] as ScheduleItem[],
    bom_items: [] as BomItem[],
  }});

  useEffect(() => {{
    loadEstimate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }}, [project.id]);

  const loadEstimate = async () => {{
    try {{
      const allRevs = await estimateService.getAllByProjectId(project.id);
      const approved = allRevs.find(r => r.is_approved);
      const data = approved
        ? await estimateService.getByProjectId(project.id, approved.revision)
        : await estimateService.getByProjectId(project.id);
      setEstimate(data);
      if (data?.quotation) {{
        const savedTerms = data.quotation.terms_conditions || '';
        setFormData({{
          validity_days: data.quotation.validity_days || 30,
          delivery_terms: data.quotation.delivery_terms || 'Ex-Works',
          payment_terms: data.quotation.payment_terms || 'Net 30',
          notes: data.quotation.notes !== undefined && data.quotation.notes !== null ? data.quotation.notes : DEFAULT_NOTES,
          terms_conditions: savedTerms,
          include_terms: data.quotation.include_terms === true,
          line_items: data.quotation.line_items || [],
          schedule_items: data.quotation.schedule_items?.length ? data.quotation.schedule_items : [...DEFAULT_SCHEDULE],
          bom_items: data.quotation.bom_items || [],
        }});
      }}
    }} catch (err) {{
      showError('Error loading quotation data');
    }}
  }};

  const handleSaveQuotation = async () => {{
    if (!estimate) return;
    try {{
      await estimateService.updateQuotation(estimate.id, formData);
      showSuccess('Quotation saved successfully');
      setIsEditing(false);
      loadEstimate();
      onUpdate();
    }} catch (err: any) {{
      showError(err.response?.data?.message || 'Error saving quotation');
    }}
  }};

  const handleSaveTerms = async () => {{
    if (!estimate) return;
    setTcSaving(true);
    try {{
      await estimateService.updateQuotation(estimate.id, formData);
      setTcSaved(true);
      showSuccess('Terms & Conditions saved successfully');
      loadEstimate();
      onUpdate();
    }} catch (err: any) {{
      showError(err.response?.data?.message || 'Error saving Terms & Conditions');
    }} finally {{
      setTcSaving(false);
    }}
  }};

  const handleGeneratePdf = async () => {{
    if (!estimate) return;
    try {{
      await estimateService.updateQuotation(estimate.id, formData);
      const blob = await estimateService.generateQuotationPdf(estimate.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = {BT}Quotation-${{project.quotation_number || project.id}}.pdf{BT};
      a.click();
      window.URL.revokeObjectURL(url);
      showSuccess('Quotation PDF generated successfully');
    }} catch (err: any) {{
      showError(err.response?.data?.message || 'Error generating quotation PDF');
    }}
  }};

  const handleSendToClient = async () => {{
    if (!estimate) return;
    try {{
      await estimateService.updateQuotation(estimate.id, formData);
      const blob = await estimateService.generateQuotationPdf(estimate.id);
      const pdfFilename = {BT}Quotation-${{project.quotation_number || project.id}}.pdf{BT};
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const clientEmail = project.client?.poc_email || '';
      const subject = encodeURIComponent(
        {BT}Quotation ${{project.quotation_number || ''}} \u2014 ${{project.project_name}}{BT}
      );
      const body = encodeURIComponent(
        {BT}Dear ${{project.client?.poc_name || 'Sir/Madam'}},\\n\\n{BT} +
        {BT}Please find attached our quotation ${{project.quotation_number || ''}} for your reference.\\n\\n{BT} +
        {BT}Note: The quotation PDF (${{pdfFilename}}) has been downloaded to your device. {BT} +
        {BT}Please attach it to this email before sending.\\n\\n{BT} +
        {BT}Validity: ${{formData.validity_days}} days\\n{BT} +
        {BT}Delivery Terms: ${{formData.delivery_terms}}\\n{BT} +
        {BT}Payment Terms: ${{formData.payment_terms}}\\n\\n{BT} +
        {BT}Regards,\\nForge i-DAS Team{BT}
      );
      window.open({BT}mailto:${{clientEmail}}?subject=${{subject}}&body=${{body}}{BT}, '_blank');

      await estimateService.sendQuotationToClient(estimate.id);
      showSuccess('PDF downloaded and Outlook opened. Please attach the PDF before sending.');
      loadEstimate();
      onUpdate();
    }} catch (err: any) {{
      showError(err.response?.data?.message || 'Error sending quotation');
    }}
  }};

  const handleNext = () => {{
    if (project.status !== 'quoted') {{
      showError('Please send the quotation to the client before proceeding to the next step.');
      return;
    }}
    onNext?.();
  }};

  /* -- Computed values -- */
  const rawMaterial = Math.round(Number(estimate?.raw_material_cost || 0));
  const processCost = Math.round(Number(estimate?.process_cost || 0));
  const overhead = Math.round(Number(estimate?.overhead_cost || 0));
  const totalCost = Math.round(Number(estimate?.total_cost || 0));
  const marginPct = Number(estimate?.margin_percent || 0);
  const marginAmt = Math.round(totalCost * (marginPct / 100));
  const finalPrice = Math.round(Number(estimate?.final_price || 0));
  const validUntil = dayjs().add(Number(formData.validity_days) || 30, 'day').format('YYYY-MM-DD');

  return (
    <Box sx={{{{ pb: 4, bgcolor: T.bg, mx: -3, mt: -3, px: 3, pt: 3 }}}}>

      {{/* ================================================================
          ACTION BAR
          ================================================================ */}}
      <Box sx={{{{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        mb: 3, gap: 1.5,
      }}}}>
        {{!isEditing && (
          <Button
            variant="contained"
            startIcon={{<SendIcon sx={{{{ fontSize: 16 }}}} />}}
            onClick={{handleSendToClient}}
            disabled={{!estimate?.is_approved || project.status === 'quoted'}}
            sx={{{{
              borderRadius: '10px', height: 42, px: 3,
              textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
              color: 'white', background: T.primary,
              boxShadow: T.shadow,
              '&:hover': {{ background: '#116b33', boxShadow: T.shadowMd }},
              '&.Mui-disabled': {{ color: 'white', background: T.primary, opacity: 0.5 }},
              transition: 'all .2s',
            }}}}
          >
            {{project.status === 'quoted' ? 'Sent to Client' : 'Send to Client'}}
          </Button>
        )}}
        {{isEditing ? (
          <Stack direction="row" spacing={{1.5}}>
            <Button
              variant="outlined"
              onClick={{() => setIsEditing(false)}}
              sx={{{{
                borderRadius: '10px', height: 42, px: 3,
                textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
                borderColor: T.border, color: T.textSecondary,
                '&:hover': {{ borderColor: T.textMuted, background: T.borderLight }},
              }}}}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={{<SaveIcon sx={{{{ fontSize: 16 }}}} />}}
              onClick={{handleSaveQuotation}}
              sx={{{{
                background: T.primary, borderRadius: '10px', height: 42, px: 3,
                textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
                boxShadow: T.shadow,
                '&:hover': {{ background: '#116b33', boxShadow: T.shadowMd }},
                transition: 'all .2s',
              }}}}
            >
              Save Quotation
            </Button>
          </Stack>
        ) : (
          <Button
            variant="outlined"
            startIcon={{<EditIcon sx={{{{ fontSize: 16 }}}} />}}
            onClick={{() => setIsEditing(true)}}
            sx={{{{
              borderRadius: '10px', height: 42, px: 3,
              textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
              borderColor: T.border, color: T.textSecondary,
              '&:hover': {{ background: T.borderLight, borderColor: T.textMuted }},
              transition: 'all .2s',
            }}}}
          >
            Edit Quotation
          </Button>
        )}}
      </Box>

      {{/* ================================================================
          MAIN 2-COLUMN LAYOUT
          ================================================================ */}}
      <Grid container spacing={{3}}>

        {{/* ============================================================
            LEFT COLUMN: QUOTATION FORM
            ============================================================ */}}
        <Grid item xs={{12}} md={{8}}>
          <Card elevation={{0}} sx={{{{
            border: {BT}1px solid ${{T.border}}{BT}, borderRadius: T.radius,
            overflow: 'hidden', boxShadow: T.shadow,
            transition: 'box-shadow .3s',
            '&:hover': {{ boxShadow: T.shadowMd }},
          }}}}>
            {{/* Accent stripe */}}
            <Box sx={{{{
              height: 3,
              background: {BT}linear-gradient(90deg, ${{T.primary}}, ${{T.primaryLight}}){BT},
            }}}} />

            <Box sx={{{{ p: {{ xs: 2.5, md: '28px 32px' }} }}}}>
              <SectionHeader
                icon={{<QuoteIcon />}}
                title="Quotation Details"
                subtitle="Review and manage quotation parameters"
                action={{
                  estimate && (
                    <Chip
                      label={{{BT}Revision R${{estimate.revision ?? 0}}{BT}}}
                      size="small"
                      sx={{{{
                        fontWeight: 700, fontSize: '0.7rem',
                        bgcolor: T.borderLight, color: T.textSecondary,
                        border: {BT}1px solid ${{T.border}}{BT}, borderRadius: '8px',
                      }}}}
                    />
                  )
                }}
              />

              <Grid container spacing={{2.5}}>
                {{/* Quotation Number */}}
                <Grid item xs={{12}} sm={{6}}>
                  <TextField
                    fullWidth size="small"
                    label="Quotation Number"
                    value={{project.quotation_number || '-'}}
                    disabled
                    InputProps={{{{ readOnly: true }}}}
                    helperText="Auto-generated quotation reference number"
                    sx={{inputSx}}
                  />
                </Grid>

                {{/* Project Name */}}
                <Grid item xs={{12}} sm={{6}}>
                  <TextField
                    fullWidth size="small"
                    label="Project Name"
                    value={{project.project_name || '-'}}
                    disabled
                    InputProps={{{{ readOnly: true }}}}
                    sx={{inputSx}}
                  />
                </Grid>

                {{/* Validity Days */}}
                <Grid item xs={{12}} sm={{6}}>
                  <TextField
                    fullWidth size="small"
                    label="Validity (Days)"
                    value={{formData.validity_days}}
                    onChange={{(e) => {{
                      const val = e.target.value;
                      if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0))
                        setFormData({{ ...formData, validity_days: val as any }});
                    }}}}
                    onBlur={{(e) => {{
                      const num = parseInt(e.target.value) || 30;
                      setFormData({{ ...formData, validity_days: num }});
                    }}}}
                    disabled={{!isEditing}}
                    inputProps={{{{ inputMode: 'numeric' }}}}
                    helperText={{
                      <Box component="span" sx={{{{ display: 'flex', alignItems: 'center', gap: 0.5 }}}}>
                        <CalendarIcon sx={{{{ fontSize: 12 }}}} />
                        Valid until: {{validUntil}}
                      </Box>
                    }}
                    sx={{inputSx}}
                  />
                </Grid>

                {{/* Delivery Terms */}}
                <Grid item xs={{12}} sm={{6}}>
                  <TextField
                    fullWidth size="small"
                    label="Delivery Terms"
                    value={{formData.delivery_terms}}
                    onChange={{(e) => setFormData({{ ...formData, delivery_terms: e.target.value }})}}
                    disabled={{!isEditing}}
                    placeholder="Ex-Works, FOB, CIF, etc."
                    sx={{inputSx}}
                  />
                </Grid>

                {{/* Payment Terms */}}
                <Grid item xs={{12}} sm={{6}}>
                  <TextField
                    fullWidth size="small"
                    label="Payment Terms"
                    value={{formData.payment_terms}}
                    onChange={{(e) => setFormData({{ ...formData, payment_terms: e.target.value }})}}
                    disabled={{!isEditing}}
                    placeholder="Net 30, 50% Advance, etc."
                    sx={{inputSx}}
                  />
                </Grid>

                {{/* Notes */}}
                <Grid item xs={{12}}>
                  <TextField
                    fullWidth size="small"
                    multiline rows={{3}}
                    label="Notes / Special Terms"
                    value={{formData.notes}}
                    onChange={{(e) => setFormData({{ ...formData, notes: e.target.value }})}}
                    disabled={{!isEditing}}
                    placeholder="Additional notes or special instructions for this quotation."
                    sx={{inputSx}}
                  />
                </Grid>

                {{/* Terms & Conditions */}}
                <Grid item xs={{12}}>
                  <Box sx={{{{
                    border: '1px solid',
                    borderColor: formData.include_terms ? alpha(T.primary, .2) : T.border,
                    borderRadius: T.radiusSm,
                    p: 2.5,
                    bgcolor: formData.include_terms ? alpha(T.primary, .015) : T.card,
                    transition: 'all .25s',
                  }}}}>
                    <FormControlLabel
                      control={{
                        <Checkbox
                          checked={{formData.include_terms}}
                          onChange={{(e) => {{
                            const checked = e.target.checked;
                            setFormData({{
                              ...formData,
                              include_terms: checked,
                              terms_conditions: checked
                                ? formData.terms_conditions || DEFAULT_TERMS_CONDITIONS
                                : formData.terms_conditions,
                            }});
                          }}}}
                          sx={{{{
                            color: T.primary,
                            '&.Mui-checked': {{ color: T.primary }},
                          }}}}
                        />
                      }}
                      label={{
                        <Box sx={{{{ display: 'flex', alignItems: 'center', gap: 0.8 }}}}>
                          <GavelIcon sx={{{{ fontSize: 16, color: formData.include_terms ? T.primary : T.textMuted }}}} />
                          <Typography sx={{{{
                            fontWeight: 600, fontSize: '0.85rem',
                            color: formData.include_terms ? T.textPrimary : T.textSecondary,
                          }}}}>
                            Include Terms &amp; Conditions
                          </Typography>
                        </Box>
                      }}
                    />

                    <Collapse in={{formData.include_terms}}>
                      <Box sx={{{{ mt: 1.5 }}}}>
                        <TextField
                          fullWidth multiline rows={{12}}
                          value={{formData.terms_conditions}}
                          onChange={{(e) => {{
                            setTcSaved(false);
                            setFormData({{ ...formData, terms_conditions: e.target.value }});
                          }}}}
                          placeholder="Terms and conditions will appear here..."
                          InputProps={{{{
                            sx: {{
                              fontSize: '0.78rem', fontFamily: 'monospace',
                              lineHeight: 1.7, bgcolor: T.card, borderRadius: '10px',
                            }},
                          }}}}
                          sx={{{{
                            '& .MuiOutlinedInput-root': {{
                              '& fieldset': {{ borderColor: T.border }},
                              '&:hover fieldset': {{ borderColor: T.textMuted }},
                              '&.Mui-focused fieldset': {{ borderColor: T.primary }},
                            }},
                          }}}}
                        />
                        <Box sx={{{{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5, mt: 1.5 }}}}>
                          {{tcSaved && (
                            <Chip
                              icon={{<CheckCircleIcon sx={{{{ fontSize: 14 }}}} />}}
                              label="Saved"
                              size="small"
                              sx={{{{
                                fontWeight: 700, fontSize: '0.72rem',
                                bgcolor: T.primaryBg, color: T.primary,
                                border: {BT}1px solid ${{alpha(T.primary, .2)}}{BT},
                                mr: 'auto',
                              }}}}
                            />
                          )}}
                          <Button
                            variant="outlined"
                            startIcon={{<RestoreIcon sx={{{{ fontSize: 15 }}}} />}}
                            onClick={{() => setFormData({{ ...formData, terms_conditions: DEFAULT_TERMS_CONDITIONS }})}}
                            sx={{{{
                              textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
                              color: T.textSecondary, borderColor: T.border, borderRadius: '10px',
                              height: 36, px: 2,
                              '&:hover': {{ bgcolor: T.borderLight, borderColor: T.textMuted }},
                            }}}}
                          >
                            Load Default
                          </Button>
                          <Button
                            variant="contained"
                            startIcon={{<SaveIcon sx={{{{ fontSize: 15 }}}} />}}
                            onClick={{handleSaveTerms}}
                            disabled={{tcSaving}}
                            sx={{{{
                              textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
                              borderRadius: '10px', height: 36, px: 2,
                              background: T.primary, boxShadow: T.shadow,
                              '&:hover': {{ background: '#116b33' }},
                              transition: 'all .2s',
                            }}}}
                          >
                            {{tcSaving ? 'Saving...' : 'Save'}}
                          </Button>
                        </Box>
                      </Box>
                    </Collapse>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          </Card>

          {{/* Generate PDF button */}}
          <Box sx={{{{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}}}>
            <Button
              variant="outlined"
              startIcon={{<PdfIcon sx={{{{ fontSize: 18 }}}} />}}
              onClick={{handleGeneratePdf}}
              disabled={{!estimate}}
              sx={{{{
                borderRadius: '10px', height: 42, px: 3,
                textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
                borderColor: T.border, color: T.textSecondary,
                '&:hover': {{ bgcolor: T.borderLight, borderColor: T.textMuted }},
                transition: 'all .2s',
              }}}}
            >
              Generate Quotation PDF
            </Button>
            {{!estimate?.is_approved && (
              <Typography sx={{{{ fontSize: '0.75rem', color: T.orange, fontWeight: 500 }}}}>
                &#9888; Approve the estimate first to enable Send to Client.
              </Typography>
            )}}
          </Box>
        </Grid>

        {{/* ============================================================
            RIGHT COLUMN: PRICE SUMMARY (Sticky)
            ============================================================ */}}
        <Grid item xs={{12}} md={{4}}>
          <Box sx={{{{ position: 'sticky', top: 24 }}}}>
            {{/* Sent badge */}}
            {{project.status === 'quoted' && (
              <Box sx={{{{
                mb: 2, display: 'flex', alignItems: 'center', gap: 1,
                px: 2, py: 1.2, borderRadius: T.radiusSm,
                bgcolor: T.primaryBg, border: {BT}1px solid ${{alpha(T.primary, .2)}}{BT},
              }}}}>
                <CheckCircleIcon sx={{{{ color: T.primary, fontSize: 18 }}}} />
                <Typography sx={{{{ color: T.primary, fontWeight: 700, fontSize: '0.8rem' }}}}>
                  Quotation Sent to Client
                </Typography>
              </Box>
            )}}

            <Card elevation={{0}} sx={{{{
              border: {BT}1px solid ${{T.border}}{BT}, borderRadius: T.radius,
              overflow: 'hidden', boxShadow: T.shadow,
              transition: 'box-shadow .3s',
              '&:hover': {{ boxShadow: T.shadowMd }},
            }}}}>
              {{/* Accent stripe */}}
              <Box sx={{{{
                height: 3,
                background: {BT}linear-gradient(90deg, ${{T.primary}}, ${{T.primaryLight}}){BT},
              }}}} />

              <Box sx={{{{ p: '24px 24px 20px' }}}}>
                <SectionHeader
                  icon={{<MoneyIcon />}}
                  title="Price Summary"
                  subtitle="Cost breakdown & quoted price"
                  iconColor={{T.primary}}
                />

                {{/* Cost breakdown */}}
                <Box sx={{{{ mb: 2.5 }}}}>
                  <PriceRow label="Raw Material" value={{{BT}$ ${{rawMaterial.toLocaleString()}}{BT}}} />
                  <PriceRow label="Process Cost" value={{{BT}$ ${{processCost.toLocaleString()}}{BT}}} />
                  <PriceRow label="Overhead" value={{{BT}$ ${{overhead.toLocaleString()}}{BT}}} />
                </Box>

                {{/* Total Cost */}}
                <PriceRow
                  label="Total Cost"
                  value={{{BT}$ ${{totalCost.toLocaleString()}}{BT}}}
                  bold highlight
                />

                {{/* Margin */}}
                <Box sx={{{{ mt: 1.5 }}}}>
                  <PriceRow
                    label={{{BT}Margin (${{marginPct}}%){BT}}}
                    value={{{BT}$ ${{marginAmt.toLocaleString()}}{BT}}}
                  />
                </Box>

                {{/* Quoted Price Hero */}}
                <Box sx={{{{
                  mt: 3, p: '22px 24px', borderRadius: T.radiusSm,
                  background: {BT}linear-gradient(135deg, ${{T.primary}} 0%, #116b33 100%){BT},
                  textAlign: 'center',
                  boxShadow: {BT}0 4px 16px ${{alpha(T.primary, .25)}}{BT},
                  position: 'relative', overflow: 'hidden',
                }}}}>
                  {{/* Decorative circles */}}
                  <Box sx={{{{
                    position: 'absolute', top: -20, right: -20,
                    width: 80, height: 80, borderRadius: '50%',
                    bgcolor: 'rgba(255,255,255,.06)',
                  }}}} />
                  <Box sx={{{{
                    position: 'absolute', bottom: -15, left: -15,
                    width: 60, height: 60, borderRadius: '50%',
                    bgcolor: 'rgba(255,255,255,.04)',
                  }}}} />

                  <Typography sx={{{{
                    color: 'rgba(255,255,255,.7)', textTransform: 'uppercase',
                    letterSpacing: '0.12em', fontSize: '0.62rem', fontWeight: 700,
                  }}}}>
                    Quoted Price
                  </Typography>
                  <Typography sx={{{{
                    color: '#FFFFFF', fontWeight: 900, fontSize: '2rem',
                    mt: 0.5, letterSpacing: '-0.02em',
                    fontFeatureSettings: '"tnum"',
                  }}}}>
                    $ {{finalPrice.toLocaleString()}}
                  </Typography>
                </Box>

                {{/* Estimate status badge */}}
                <Box sx={{{{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}}}>
                  <Chip
                    icon={{estimate?.is_approved
                      ? <CheckCircleIcon sx={{{{ fontSize: 14 }}}} />
                      : <ScheduleIcon sx={{{{ fontSize: 14 }}}} />
                    }}
                    label={{estimate?.is_approved ? 'Estimate Approved' : 'Estimate Pending'}}
                    size="small"
                    sx={{{{
                      fontWeight: 700, fontSize: '0.72rem', borderRadius: '8px',
                      bgcolor: estimate?.is_approved ? T.primaryBg : '#FFF7ED',
                      color: estimate?.is_approved ? T.primary : T.orange,
                      border: {BT}1px solid ${{estimate?.is_approved ? alpha(T.primary, .2) : alpha(T.orange, .2)}}{BT},
                    }}}}
                  />
                </Box>
              </Box>
            </Card>

            {{/* Quick Info */}}
            <Card elevation={{0}} sx={{{{
              mt: 2, border: {BT}1px solid ${{T.border}}{BT}, borderRadius: T.radius,
              overflow: 'hidden', boxShadow: T.shadow,
            }}}}>
              <Box sx={{{{ p: '18px 24px' }}}}>
                <Typography sx={{{{ fontSize: '0.78rem', fontWeight: 700, color: T.textPrimary, mb: 1.5 }}}}>
                  Quick Info
                </Typography>
                <Stack spacing={{1.2}}>
                  {{[
                    {{ icon: <CalendarIcon />, label: 'Valid Until', value: validUntil }},
                    {{ icon: <ShippingIcon />, label: 'Delivery', value: formData.delivery_terms }},
                    {{ icon: <PaymentIcon />, label: 'Payment', value: formData.payment_terms }},
                  ].map(item => (
                    <Box key={{item.label}} sx={{{{
                      display: 'flex', alignItems: 'center', gap: 1.2,
                      py: 0.8, px: 1.5, borderRadius: '8px',
                      bgcolor: T.borderLight,
                      transition: 'all .2s',
                      '&:hover': {{ bgcolor: alpha(T.primary, .03) }},
                    }}}}>
                      {{React.cloneElement(item.icon, {{ sx: {{ fontSize: 15, color: T.textMuted }} }})}}
                      <Box sx={{{{ flex: 1 }}}}>
                        <Typography sx={{{{ fontSize: '0.68rem', color: T.textMuted, fontWeight: 500, lineHeight: 1 }}}}>
                          {{item.label}}
                        </Typography>
                        <Typography sx={{{{ fontSize: '0.8rem', color: T.textPrimary, fontWeight: 600, mt: 0.15 }}}}>
                          {{item.value}}
                        </Typography>
                      </Box>
                    </Box>
                  ))}}
                </Stack>
              </Box>
            </Card>
          </Box>
        </Grid>
      </Grid>

      {{/* ================================================================
          BOTTOM ACTION BAR
          ================================================================ */}}
      <Box sx={{{{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        pt: 3, mt: 4, borderTop: {BT}1px solid ${{T.border}}{BT},
      }}}}>
        <Button
          variant="outlined"
          startIcon={{<ArrowBackIcon sx={{{{ fontSize: 16 }}}} />}}
          onClick={{onBack}}
          disabled={{!onBack}}
          sx={{{{
            borderRadius: '10px', height: 44, px: 3,
            textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
            borderColor: T.border, color: T.textSecondary,
            '&:hover': {{ borderColor: T.textMuted, color: T.textPrimary, bgcolor: T.borderLight }},
            transition: 'all .2s',
          }}}}
        >
          Back to Estimation
        </Button>

        <Stack direction="row" spacing={{1.5}} alignItems="center">
          {{isEditing && (
            <>
              <Button
                variant="outlined"
                onClick={{() => setIsEditing(false)}}
                sx={{{{
                  borderRadius: '10px', height: 44, px: 3,
                  textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
                  borderColor: T.border, color: T.textSecondary,
                  '&:hover': {{ borderColor: T.textMuted, bgcolor: T.borderLight }},
                }}}}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                startIcon={{<SaveIcon sx={{{{ fontSize: 16 }}}} />}}
                onClick={{handleSaveQuotation}}
                sx={{{{
                  background: T.primary, borderRadius: '10px', height: 44, px: 3,
                  textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
                  boxShadow: T.shadow,
                  '&:hover': {{ background: '#116b33', boxShadow: T.shadowMd }},
                  transition: 'all .2s',
                }}}}
              >
                Save Quotation
              </Button>
            </>
          )}}
          {{!isEditing && (
            <Button
              variant="contained"
              endIcon={{<ArrowForwardIcon sx={{{{ fontSize: 16 }}}} />}}
              onClick={{handleNext}}
              disabled={{!onNext}}
              sx={{{{
                background: T.primary, borderRadius: '10px', height: 44, px: 3.5,
                textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
                letterSpacing: 0.2, boxShadow: T.shadow,
                '&:hover': {{ background: '#116b33', boxShadow: T.shadowMd }},
                transition: 'all .2s',
              }}}}
            >
              Next: Purchase Order
            </Button>
          )}}
        </Stack>
      </Box>
    </Box>
  );
}};

export default QuotationTab;
"""

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("File written successfully!")
print(f"Size: {{os.path.getsize(filepath)}} bytes")
