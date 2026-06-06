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
  Factory, ClipboardList, Wrench,
} from 'lucide-react';
import { PictureAsPdf as PdfIcon } from '@mui/icons-material';
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
interface SectionCRow { process: string; po: string; operator_vendor: string; inspector: string; completed: boolean; }
interface SectionEChecklist { po: string; drawing: string; materialCert: string; inspecReport: string; delivery: string; }
interface WorkingInstructions { monogram: boolean; thread71: boolean; thread5b: boolean; }
/* ── Anodizing Specifications (Yes/No toggles) ── */
interface AnodizingSpecs {
  type: string; thicknessSpec: string; anodizingClass: string; dyeColor: string;
  seal: boolean; maskThreads: boolean; tumbled: boolean; scotchBrite: boolean;
}

interface JobForm {
  procedureId: string; effectiveDate: string; dimensionReport: string;
  heatNumber: string; size: string; cutLength: string; sectionB: SectionBOp[];
  sectionC: SectionCRow[]; workingInstructions: WorkingInstructions; generalNotes: string;
  sawCutOrBarFeed: string; materialType: string; quantity: string;
  sectionACompleted?: { material: boolean; saw: boolean };
  sectionDNotes: string[];
  sectionEChecklist: SectionEChecklist;
  /* ── Anodizing WO Information fields ── */
  hamfWoNumber?: string; productDescription?: string; specDrawingRevision?: string;
  material1?: string; material2?: string; material3?: string;
  customer?: string; customerPoNumber?: string; hamfWoDate?: string; shipDate?: string;
  /* ── Anodizing Specifications ── */
  anodizingSpecs?: AnodizingSpecs;
  /* ── Per-card Process Type for Blank Modules ── */
  blankModuleProcessType?: string;
}

const REQUIRED_OP_OPTIONS = ['Yes', 'No', ''];

/* ── Machining Industry Operations (7 steps) ── */
const DEFAULT_SECTION_B_MACHINING = (): SectionBOp[] => [
  { sNo: 1, operation: 'Lathe Op(s)',           description: 'Machine as per drawing. Perform dimensional inspection.',                                     required_operation: 'Yes',                   initials: '', opDate: '', completed: false },
  { sNo: 2, operation: 'Mill Op(s)',            description: 'Mill as per drawing. Perform dimensional inspection.',                                        required_operation: 'Yes',                   initials: '', opDate: '', completed: false },
  { sNo: 3, operation: 'Deburr',                description: 'Deburr parts',                                                                                required_operation: 'Manual',                initials: '', opDate: '', completed: false },
  { sNo: 4, operation: 'Heat Treat',            description: 'Heat treat part per drawing',                                                                 required_operation: 'External',              initials: '', opDate: '', completed: false },
  { sNo: 5, operation: 'Marking',               description: 'As per Drawing',                                                                              required_operation: 'No',                    initials: '', opDate: '', completed: false },
  { sNo: 6, operation: 'Final QC/Inspection',   description: 'WO entries complete, marking correct, visual inspection of part',                             required_operation: 'Yes',                   initials: '', opDate: '', completed: false },
  { sNo: 7, operation: 'Final Acceptance',      description: 'Purchase Order Review, Packing Slip Review, Material Review, ID & Traceability, Calibration, NCR, Packaging', required_operation: 'Confirm – As Required', initials: '', opDate: '', completed: false },
];

/* ── Anodizing Industry Operations (19 steps) ── */
const DEFAULT_SECTION_B_ANODIZING = (): SectionBOp[] => [
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

/* ── Get default operations based on traveler type ── */
const getDefaultSectionB = (travelerType?: string, part?: any): SectionBOp[] => {
  if (travelerType === 'anodizing_industry') {
    const base = DEFAULT_SECTION_B_ANODIZING();
    if (!part) return base;
    return base.map(op => {
      if (!part.is_blank_module) {
        op.initials = part?.operator_initials || '';
      }
      switch (op.operation) {
        case 'Visual Inspection':
          if (part.anodize_visual_inspection) op.required_operation = part.anodize_visual_inspection;
          break;
        case 'Initial Cleaning Alkaline Wash':
          if (part.anodize_alkaline_wash) op.required_operation = part.anodize_alkaline_wash;
          break;
        case 'Masking':
          if (part.anodize_masking) op.required_operation = part.anodize_masking;
          break;
        case 'Racking':
          if (part.anodize_racking) op.required_operation = part.anodize_racking;
          break;
        case 'Secondary Cleaning Alkaline Immersion':
          if (part.anodize_secondary_cleaning) op.required_operation = part.anodize_secondary_cleaning;
          break;
        case 'Caustic Etch Rinse':
          if (part.anodize_caustic_etch) op.required_operation = part.anodize_caustic_etch;
          break;
        case 'Acid Etch Rinse':
          if (part.anodize_acid_etch) op.required_operation = part.anodize_acid_etch;
          break;
        case 'DeOx Rinse':
          if (part.anodize_deox_rinse) op.required_operation = part.anodize_deox_rinse;
          break;
        case 'Anodize Rinse':
          if (part.anodize_anodize_rinse) op.required_operation = part.anodize_anodize_rinse;
          break;
        case 'Neutralize Rinse':
          if (part.anodize_neutralize) op.required_operation = part.anodize_neutralize;
          break;
        case 'Dye Rinse':
          if (part.anodize_dye) op.required_operation = part.anodize_dye;
          break;
        case 'Seal Rinse':
          if (part.anodize_seal_rinse) op.required_operation = part.anodize_seal_rinse;
          break;
        case 'Dry':
          if (part.anodize_dry) op.required_operation = part.anodize_dry;
          break;
        case 'Un-Rack':
          if (part.anodize_un_rack) op.required_operation = part.anodize_un_rack;
          break;
        case 'Technical Inspect':
          if (part.anodize_technical_inspect) op.required_operation = part.anodize_technical_inspect;
          break;
        case 'Commercial Inspection':
          if (part.anodize_commercial_inspection) op.required_operation = part.anodize_commercial_inspection;
          break;
        case 'Package':
          if (part.anodize_package) op.required_operation = part.anodize_package;
          break;
        case 'Final Acceptance':
          if (part.anodize_final_acceptance) op.required_operation = part.anodize_final_acceptance;
          break;
        case 'Product Release':
          if (part.anodize_product_release) op.required_operation = part.anodize_product_release;
          break;
      }
      return op;
    });
  }
  
  const base = DEFAULT_SECTION_B_MACHINING();
  if (!part) return base;

    // Auto-populate based on part configuration
  return base.map(op => {
    if (!part.is_blank_module) {
      op.initials = part?.operator_initials || '';
    }
    switch (op.operation) {
      case 'Lathe Op(s)':
        if (part.lathe_ops_required === 'No') op.required_operation = 'No';
        else if (part.lathe_ops_required === 'Yes' || part.lathe_ops_required) op.required_operation = 'Yes';
        break;
      case 'Mill Op(s)':
        if (part.mill_ops_required === 'No') op.required_operation = 'No';
        else if (part.mill_ops_required === 'Yes' || part.mill_ops_required) op.required_operation = 'Yes';
        break;
      case 'Deburr':
        if (part.deburr_required === 'No') op.required_operation = 'No';
        else if (part.deburr_required === 'Yes' || part.deburr_required) op.required_operation = 'Manual';
        break;
      case 'Heat Treat':
        if (part.heat_treat_required === 'No') op.required_operation = 'No';
        else if (part.heat_treat_required === 'Yes' || part.heat_treat_required) op.required_operation = 'External';
        break;
      case 'Marking':
        if (part.marking_required === 'Yes' || part.marking_required) op.required_operation = 'Yes';
        else if (part.marking_required === 'No') op.required_operation = 'No';
        break;
      case 'Final QC/Inspection':
        if (part.final_qc_inspection_required === 'No') op.required_operation = 'No';
        else if (part.final_qc_inspection_required === 'Yes' || part.final_qc_inspection_required) op.required_operation = 'Yes';
        break;
      case 'Final Acceptance':
        if (part.final_acceptance_required === 'No') op.required_operation = 'No';
        else if (part.final_acceptance_required === 'Yes' || part.final_acceptance_required) op.required_operation = 'Yes';
        break;
    }
    return op;
  });
};

function makeDefaultForm(woNumber: string, index: number, part?: any, travelerType?: string): JobForm {
  // Build default effective-date as YYYY-MM (month input format)
  const now = new Date();
  const effectiveDateDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    procedureId: `PT-${woNumber}-${String(index + 1).padStart(2, '0')}`,
    effectiveDate: effectiveDateDefault, dimensionReport: 'YES',
    heatNumber: part?.heat_number || '',
    size: part?.raw_material_dimension || '',
    cutLength: part?.cut_length || '',
    sectionB: getDefaultSectionB(
      (part?.manufacturing_type === 'Anodizing' || part?.production_industry === 'Anodizing' ? 'anodizing_industry' : part?.manufacturing_type === 'Machining' || part?.production_industry === 'Machining' ? 'machining_industry' : travelerType), 
      part
    ),
    sectionC: [
      { process: '', po: '', operator_vendor: '', inspector: '', completed: false },
      { process: '', po: '', operator_vendor: '', inspector: '', completed: false },
      { process: '', po: '', operator_vendor: '', inspector: '', completed: false },
    ],
    workingInstructions: { monogram: false, thread71: false, thread5b: false },
    generalNotes: '',
    sawCutOrBarFeed: part?.cut_method || part?.saw_cut_or_bar_fed || '',
    materialType: part?.material_grade || part?.material || '',
    quantity: part ? String(getPartQuantity(part) || '') : '',
    sectionACompleted: { material: false, saw: false },
    sectionDNotes: ['', '', '', ''],
    sectionEChecklist: { po: '', drawing: '', materialCert: '', inspecReport: '', delivery: '' },
    /* ── Anodizing WO Information defaults ── */
    hamfWoNumber: '', productDescription: '', specDrawingRevision: '',
    material1: '', material2: '', material3: '',
    customer: '', customerPoNumber: '', hamfWoDate: '', shipDate: '',
    /* ── Anodizing Specifications defaults ── */
    /* ── Anodizing Specifications defaults ── */
    anodizingSpecs: {
      type: part?.anodize_type || '', 
      thicknessSpec: part?.anodize_thickness_spec || '', 
      anodizingClass: part?.anodize_class || '', 
      dyeColor: part?.anodize_dye_color || '',
      seal: part?.anodize_seal || false, 
      maskThreads: part?.anodize_mask_threads || false, 
      tumbled: part?.anodize_tumbled || false, 
      scotchBrite: part?.anodize_scotch_brite || false,
    },
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
  const [heatNumberOptions, setHeatNumberOptions] = useState<Record<number, Array<{ id?: string; stock_id?: string; heat_number: string; quantity: number; certificate_url?: string | null }>>>({});
  const [allHeatNumbers, setAllHeatNumbers] = useState<Array<{ id?: string; stock_id?: string; heat_number: string; quantity: number; certificate_url?: string | null }>>([]);
  const { parts: customParts } = useConfiguratorParts(project) as { parts: CustomPart[] };

  // Per-card process type replaces the global type.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  useEffect(() => {
    api.get('/system-config').then(res => {}).catch(() => {}).finally(() => {
      setSettingsLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Data Loading ── */
  const loadWorkOrder = useCallback(async () => {
    try {
      const res = await api.get(`/work-orders/project/${project.id}`);
      const raw = res.data?.data;
      const arr: any[] = Array.isArray(raw) ? raw : raw?.id ? [raw] : [];
      const wo = arr[0];
      if (!wo) { setLoading(false); return; }
      setWorkOrder(wo);

      // Fetch fresh part data for existing parts to ensure new manufacturing fields sync
      const enrichedParts = await Promise.all(customParts.map(async (cp) => {
        if (!cp.parts_master_id) return cp;
        try {
          const pRes = await api.get(`/parts/${cp.parts_master_id}`);
          if (pRes.data?.data) return { ...cp, ...pRes.data.data };
        } catch (_) {}
        return cp;
      }));

      // Build auto-fill sources for anodizing WO Information fields
      const woNum = wo.work_order_number || 'WO';
      const rawWoDate = wo.release_date || wo.created_at || '';
      const autoWoDate = rawWoDate ? rawWoDate.substring(0, 10) : ''; // YYYY-MM-DD
      const autoCustomer = (project as any).client?.client_name || (project as any).quote_info?.client_name || '';
      const autoCustomerPo = (project as any).salesOrder?.customer_po_number || '';

      const saved: JobForm[] = wo.production_forms || [];
      const count = Math.max(enrichedParts.length, saved.length);
      const forms: JobForm[] = [];
      for (let i = 0; i < count; i++) {
        const part = enrichedParts[i];
        const savedSv = saved[i] as any;
        
        let cardTravelerType = 'machining_industry';
        if (part?.is_blank_module) {
          cardTravelerType = savedSv?.blankModuleProcessType || 'machining_industry';
        } else if (part?.manufacturing_type === 'Anodizing' || part?.production_industry === 'Anodizing') {
          cardTravelerType = 'anodizing_industry';
        }

        const base = makeDefaultForm(woNum, i, part, cardTravelerType);

        // Auto-fill anodizing WO information fields
        if (cardTravelerType === 'anodizing_industry') {
          base.hamfWoNumber = woNum;
          base.productDescription = part?.job_description || '';
          const specDrawing = part ? [part.drawing_part_no, part.drawing_revision].filter(Boolean).join(' / ') : '';
          base.specDrawingRevision = specDrawing;
          base.quantity = part ? String(getPartQuantity(part) || '') : '';
          base.customer = autoCustomer;
          base.customerPoNumber = autoCustomerPo;
          base.hamfWoDate = autoWoDate;
        }

        if (saved[i]) {
          // Auto-filled anodizing fields that should always come from source data
          const ANODIZING_AUTO_FIELDS = new Set(['hamfWoNumber','productDescription','specDrawingRevision','quantity','customer','customerPoNumber','hamfWoDate']);
          const merged = { ...base };
          const sv = saved[i] as any;
          for (const key of Object.keys(sv)) {
            if (cardTravelerType === 'anodizing_industry' && ANODIZING_AUTO_FIELDS.has(key)) continue;
            if (sv[key] !== undefined && sv[key] !== null && sv[key] !== '') {
              (merged as any)[key] = sv[key];
            }
          }
          // Migrate old materialAl6000/materialAl7000 to material1/material2
          if (sv.materialAl6000 && !sv.material1) merged.material1 = sv.materialAl6000;
          if (sv.materialAl7000 && !sv.material2) merged.material2 = sv.materialAl7000;
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
              process: row.process || '', po: row.po || '',
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

  /* ── Fetch vendors for Operator/Vendor dropdown ── */
  const [vendorOptions, setVendorOptions] = useState<{ id: string; name: string }[]>([]);
  const [inspectorOptions, setInspectorOptions] = useState<string[]>([]);
  const [operatorOptions, setOperatorOptions] = useState<string[]>([]);
  useEffect(() => {
    api.get('/vendors').then(res => {
      const list = res.data?.data || res.data || [];
      setVendorOptions(list.map((v: any) => ({ id: v.id, name: v.vendor_name || v.company_name || v.name || '' })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('settings/system').then(res => {
      const sysSettings = res.data?.settings || res.data?.data || res.data || {};
      const inspectorSrc = sysSettings.productionInspector || '';
      const operatorSrc = sysSettings.productionOperator || '';
      const options = inspectorSrc
        ? inspectorSrc.split('\n').map((s: string) => s.trim()).filter(Boolean).slice(0,5)
        : [];
        setInspectorOptions(options);

      const operatorOptions = operatorSrc
        ? operatorSrc.split('\n').map((s: string) => s.trim()).filter(Boolean).slice(0,5)
        : [];
        setOperatorOptions(operatorOptions);
    }).catch(() => {
      setInspectorOptions([]);
    });
  })

  /* ── Fetch ALL heat numbers from inventory once (global pool for all job dropdowns) ── */
  useEffect(() => {
    api.get('/stocks/heat-numbers')
      .then(res => {
        const data: Array<{ id?: string; stock_id?: string; heat_number: string; quantity: number; certificate_url?: string | null }> = res.data?.data || [];
        setAllHeatNumbers(data);
      })
      .catch(() => {
        setAllHeatNumbers([]);
      });
  }, []);

  /* ── Per-job heat numbers: filter by raw_material_id when available, else use global pool ── */
  const heatNumberKey = customParts.map(p => `${p.raw_material_id || ''}_${p.parts_master_id || ''}`).join(',');

  useEffect(() => {
    if (!customParts.length) return;
    customParts.forEach((part, idx) => {
      const raw_material_id = part.raw_material_id || '';
      const parts_master_id = part.parts_master_id || '';

      const params: Record<string, string> = {};
      if (raw_material_id) {
        params.raw_material_id = raw_material_id;
      } else if (parts_master_id) {
        params.parts_master_id = parts_master_id;
      }
      // No filter → backend returns all heat numbers

      api.get('/stocks/heat-numbers', { params })
        .then(res => {
          const data: Array<{ id?: string; stock_id?: string; heat_number: string; quantity: number; certificate_url?: string | null }> = res.data?.data || [];
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
    const part = customParts[idx];
    const form = productionForms[idx];
    
    let cardTravelerType = 'machining_industry';
    if (part?.is_blank_module) {
      cardTravelerType = form?.blankModuleProcessType || 'machining_industry';
    } else if (part?.manufacturing_type === 'Anodizing' || part?.production_industry === 'Anodizing') {
      cardTravelerType = 'anodizing_industry';
    }
    
    // Skip Heat Number validation for anodizing projects
    if (cardTravelerType === 'anodizing_industry') {
      return true;
    }
    
    if (!form?.heatNumber?.trim()) {
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
      let cardTravelerType = 'machining_industry';
      if (partData?.is_blank_module) {
        cardTravelerType = formData.blankModuleProcessType || 'machining_industry';
      } else if (partData?.manufacturing_type === 'Anodizing' || partData?.production_industry === 'Anodizing') {
        cardTravelerType = 'anodizing_industry';
      }

      const res = await api.post(
        `/work-orders/${workOrder.id}/job-pdf`,
        { jobIndex: jobIdx, formData, partData, travelerType: cardTravelerType },
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

  const handleViewMaterialReport = async (idx: number, heatNumber: string) => {
    if (!heatNumber || heatNumber === 'NO_STOCK') {
      showError('No heat number selected');
      return;
    }
    const options = heatNumberOptions[idx] || allHeatNumbers;
    const selectedStock = options.find(o => o.heat_number === heatNumber);
    if (!selectedStock || (!selectedStock.id && !selectedStock.stock_id)) {
      showError('Could not find stock ID for this heat number');
      return;
    }
    
    // Attempt to open the certificate if a certificate_url exists or ID is present
    try {
      const stockIdToUse = selectedStock.id || selectedStock.stock_id;
      const res = await api.get(`/stocks/${stockIdToUse}/certificate`, { responseType: 'blob' });
      const file = new Blob([res.data], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      window.open(fileURL, '_blank');
    } catch (err: any) {
      showError('Failed to view material certificate');
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
              Manage production job travellers and processes for all parts
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
              let cardTravelerType = 'machining_industry';
              if (part?.is_blank_module) {
                cardTravelerType = form.blankModuleProcessType || 'machining_industry';
              } else if (part?.manufacturing_type === 'Anodizing' || part?.production_industry === 'Anodizing') {
                cardTravelerType = 'anodizing_industry';
              }

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
                          <PdfIcon sx={{ fontSize: 16 }} />
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

                      {/* ── Per-card Process Type Dropdown ── */}
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                          <InputLabel>Process Type</InputLabel>
                          <Select
                            value={cardTravelerType}
                            label="Process Type"
                            disabled={!part?.is_blank_module}
                            onChange={e => {
                              const newType = e.target.value as string;
                              const updatedForm = { ...form, blankModuleProcessType: newType, sectionB: getDefaultSectionB(newType) };
                              setProductionForms(prev => prev.map((f, i) => i === idx ? updatedForm : f));
                            }}
                            sx={{
                              borderRadius: UI.radiusXs,
                              bgcolor: UI.bgCard,
                            }}
                          >
                            <MenuItem value="machining_industry">Machining</MenuItem>
                            <MenuItem value="anodizing_industry">Anodizing</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>

                      {/* ══════════════════════════════════════════════════════
                         ANODIZING INDUSTRY: Section A - WO Information
                         ══════════════════════════════════════════════════════ */}
                      {cardTravelerType === 'anodizing_industry' ? (
                        <>
                          <SectionHeader icon={<ClipboardList size={18} />} title="Section A: WO Information" subtitle="Work order details and customer information" />

                          {/* Grid-based layout matching existing UI style */}
                          <Grid container spacing={2} sx={{ mb: 3 }}>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="HAMF WO #" size="small" sx={inputSx()}
                                value={form.hamfWoNumber || ''}
                                InputProps={{ readOnly: true }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="Product Description / Part Number" size="small" sx={inputSx()}
                                value={form.productDescription || ''}
                                InputProps={{ readOnly: true }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="Spec. / Drawing # Revision" size="small" sx={inputSx()}
                                value={form.specDrawingRevision || ''}
                                InputProps={{ readOnly: true }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="Material 1" size="small" sx={inputSx()}
                                value={form.material1 || ''}
                                onChange={e => updateForm(idx, 'material1', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="Material 2" size="small" sx={inputSx()}
                                value={form.material2 || ''}
                                onChange={e => updateForm(idx, 'material2', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="Material 3" size="small" sx={inputSx()}
                                value={form.material3 || ''}
                                onChange={e => updateForm(idx, 'material3', e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="Quantity" size="small" sx={inputSx()}
                                value={form.quantity}
                                InputProps={{ readOnly: true }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="Customer" size="small" sx={inputSx()}
                                value={form.customer || ''}
                                InputProps={{ readOnly: true }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="Customer PO #" size="small" sx={inputSx()}
                                value={form.customerPoNumber || ''}
                                InputProps={{ readOnly: true }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="HAMF WO # Date" size="small" type="date" sx={inputSx()}
                                value={form.hamfWoDate || ''}
                                InputProps={{ readOnly: true }}
                                InputLabelProps={{ shrink: true }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField fullWidth label="Ship Date" size="small" type="date" sx={inputSx()}
                                value={(form as any).shipDate || ''}
                                onChange={e => updateForm(idx, 'shipDate' as any, e.target.value)}
                                InputLabelProps={{ shrink: true }}
                              />
                            </Grid>
                          </Grid>

                          {/* Anodizing Spec. - Grid layout */}
                          <SectionHeader icon={<Wrench size={18} />} title="Anodizing Spec." subtitle="Anodizing process parameters and options" />
                          <Grid container spacing={2} sx={{ mb: 3 }}>
                            <Grid item xs={12} sm={6} md={3}>
                              <TextField fullWidth label="Type" size="small" type="number" sx={inputSx()}
                                value={form.anodizingSpecs?.type || ''}
                                onChange={e => updateForm(idx, 'anodizingSpecs', { ...(form.anodizingSpecs || {}), type: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <TextField fullWidth label="Thickness Spec" size="small" sx={inputSx()}
                                value={form.anodizingSpecs?.thicknessSpec || ''}
                                onChange={e => updateForm(idx, 'anodizingSpecs', { ...(form.anodizingSpecs || {}), thicknessSpec: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <TextField fullWidth label="Class" size="small" type="number" sx={inputSx()}
                                value={form.anodizingSpecs?.anodizingClass || ''}
                                onChange={e => updateForm(idx, 'anodizingSpecs', { ...(form.anodizingSpecs || {}), anodizingClass: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <TextField fullWidth label="Dye Color" size="small" sx={inputSx()}
                                value={form.anodizingSpecs?.dyeColor || ''}
                                onChange={e => updateForm(idx, 'anodizingSpecs', { ...(form.anodizingSpecs || {}), dyeColor: e.target.value })}
                              />
                            </Grid>
                            {/* Yes/No checkboxes */}
                            <Grid item xs={6} sm={3}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Checkbox
                                  checked={(form.anodizingSpecs as any)?.seal === true}
                                  onChange={e => updateForm(idx, 'anodizingSpecs', { ...(form.anodizingSpecs || {}), seal: e.target.checked })}
                                  size="small" sx={{ color: UI.primary, '&.Mui-checked': { color: UI.primary } }}
                                />
                                <Typography variant="body2">Seal</Typography>
                              </Box>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Checkbox
                                  checked={(form.anodizingSpecs as any)?.maskThreads === true}
                                  onChange={e => updateForm(idx, 'anodizingSpecs', { ...(form.anodizingSpecs || {}), maskThreads: e.target.checked })}
                                  size="small" sx={{ color: UI.primary, '&.Mui-checked': { color: UI.primary } }}
                                />
                                <Typography variant="body2">Mask Threads</Typography>
                              </Box>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Checkbox
                                  checked={(form.anodizingSpecs as any)?.tumbled === true}
                                  onChange={e => updateForm(idx, 'anodizingSpecs', { ...(form.anodizingSpecs || {}), tumbled: e.target.checked })}
                                  size="small" sx={{ color: UI.primary, '&.Mui-checked': { color: UI.primary } }}
                                />
                                <Typography variant="body2">Tumbled</Typography>
                              </Box>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Checkbox
                                  checked={(form.anodizingSpecs as any)?.scotchBrite === true}
                                  onChange={e => updateForm(idx, 'anodizingSpecs', { ...(form.anodizingSpecs || {}), scotchBrite: e.target.checked })}
                                  size="small" sx={{ color: UI.primary, '&.Mui-checked': { color: UI.primary } }}
                                />
                                <Typography variant="body2">Scotch Brite</Typography>
                              </Box>
                            </Grid>
                          </Grid>
                        </>
                      ) : (
                        <>
                          {/* ══════════════════════════════════════════════════════
                             MACHINING INDUSTRY: Job Details (original)
                             ══════════════════════════════════════════════════════ */}
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
                            // Use per-material options when available; fall back to full inventory pool
                            const perMaterial = heatNumberOptions[idx];
                            const source = (perMaterial && perMaterial.length > 0) ? perMaterial : allHeatNumbers;
                            // Deduplicate: one entry per unique heat_number, preserve all distinct values
                            const seen = new Set<string>();
                            const options = source.filter(o => {
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
                          {(() => {
                            const options = heatNumberOptions[idx] || allHeatNumbers;
                            const selectedStock = options.find(o => o.heat_number === form.heatNumber);
                            const certUrl = selectedStock?.certificate_url || '';
                            const fileName = certUrl ? certUrl.split('/').pop() : 'Material_Inspection_Report.pdf';
                            const hasReport = form.heatNumber && form.heatNumber !== 'NO_STOCK' && selectedStock && (selectedStock.id || selectedStock.stock_id);
                            
                            return (
                              <TextField
                                fullWidth
                                label="Material Inspection Report"
                                size="small"
                                value={hasReport ? fileName : 'No Report Available'}
                                onClick={() => { if(hasReport) handleViewMaterialReport(idx, form.heatNumber); }}
                                InputLabelProps={{ shrink: true }}
                                InputProps={{
                                  readOnly: true,
                                  startAdornment: <PdfIcon sx={{ color: hasReport ? '#ef4444' : UI.textMuted, fontSize: 18, mr: 1 }} />
                                }}
                                sx={{
                                  opacity: hasReport ? 1 : 0.6,
                                  '& .MuiOutlinedInput-root': {
                                    bgcolor: '#fafafa',
                                    cursor: hasReport ? 'pointer' : 'default',
                                    '& input': {
                                      cursor: hasReport ? 'pointer' : 'default',
                                      color: hasReport ? UI.textPrimary : UI.textSecondary,
                                      fontWeight: 500,
                                      fontSize: 13,
                                      textOverflow: 'ellipsis',
                                    },
                                    '&:hover fieldset': {
                                      borderColor: hasReport ? UI.primaryLight : undefined
                                    }
                                  }
                                }}
                              />
                            );
                          })()}
                        </Grid>
                      </Grid>

                      {/* Material */}
                      <SectionHeader icon={<Wrench size={18} />} title="Section A: Material" subtitle="Material dimensions and cut specifications" />
                      <Grid container spacing={2} sx={{ mb: 1 }}>
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
                        </>
                      )}

                      {/* ══════════════════════════════════════════════════════
                         Operations Table - Section B for both Machining & Anodizing
                         ══════════════════════════════════════════════════════ */}
                      <SectionHeader
                        icon={<Factory size={18} />}
                        title={cardTravelerType === 'anodizing_industry' ? 'Section B: Traveler' : 'Section B: Machining & Milling Operations'}
                        subtitle="Track each operation step — check off once complete"
                      />
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
                                      {operatorOptions.map(name => (
                                            <MenuItem key={name} value={name}>{name}</MenuItem>
                                          ))}
                                      {/* <MenuItem value="MW">MW</MenuItem>
                                      <MenuItem value="JW">JW</MenuItem>
                                      <MenuItem value="N/A">N/A</MenuItem> */}
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
                         Section C: External Processes (Machining only)
                         ══════════════════════════════════════════════════════ */}
                      {cardTravelerType !== 'anodizing_industry' && (
                        <>
                          <SectionHeader
                            icon={<Wrench size={18} />}
                            title="Section C: External Processes"
                            subtitle="Track external vendor processes"
                          />
                          <TableContainer sx={{
                            mb: 3, borderRadius: UI.radiusSm, border: `1px solid ${UI.border}`,
                            overflow: 'hidden', boxShadow: UI.shadow,
                          }}>
                            <Table size="small" sx={{ tableLayout: 'fixed' }}>
                              <TableHead>
                                <TableRow>
                                  {[
                                    { label: 'Process',         width: '30%' as any },
                                    { label: 'PO#',             width: '12%' as any },
                                    { label: 'Operator/Vendor', width: '28%' as any },
                                    { label: 'Inspector',       width: '18%' as any },
                                    { label: 'Complete',        width: '12%' as any },
                                  ].map(h => (
                                    <TableCell key={h.label} sx={{
                                      '&.MuiTableCell-head': {
                                        background: UI.gradient, color: '#FFFFFF', fontWeight: 800,
                                        fontSize: 11, py: 0.5, px: 0.75, letterSpacing: 0.5, textTransform: 'uppercase',
                                        borderBottom: 'none', textAlign: 'center', verticalAlign: 'middle',
                                        textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                      },
                                      ...(h.width ? { width: h.width } : {}),
                                    }}>{h.label}</TableCell>
                                  ))}
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {form.sectionC.map((row, ri) => (
                                  <TableRow key={ri} sx={{
                                    bgcolor: ri % 2 === 0 ? UI.bgCard : UI.bgSubtle,
                                    '&:hover': { bgcolor: UI.primaryBg },
                                    transition: 'background 0.15s',
                                    '& td': { py: 0.25, px: 0.5, fontSize: 12, lineHeight: 1.2, verticalAlign: 'middle' },
                                  }}>
                                    <TableCell>
                                      <TextField fullWidth size="small" variant="standard"
                                        placeholder="Enter Process"
                                        value={row.process}
                                        onChange={e => {
                                          const updated = [...form.sectionC];
                                          updated[ri] = { ...updated[ri], process: e.target.value };
                                          updateForm(idx, 'sectionC', updated);
                                        }}
                                        sx={{ '& .MuiInput-underline:after': { borderColor: UI.primary }, '& .MuiInput-input': { py: 0.25, fontSize: 12 } }}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <TextField fullWidth size="small" variant="standard"
                                        placeholder="PO#"
                                        value={row.po}
                                        onChange={e => {
                                          const updated = [...form.sectionC];
                                          updated[ri] = { ...updated[ri], po: e.target.value };
                                          updateForm(idx, 'sectionC', updated);
                                        }}
                                        sx={{ '& .MuiInput-underline:after': { borderColor: UI.primary }, '& .MuiInput-input': { py: 0.25, fontSize: 12 } }}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <FormControl fullWidth size="small" variant="standard">
                                        <Select
                                          value={row.operator_vendor || ''}
                                          onChange={e => {
                                            const updated = [...form.sectionC];
                                            updated[ri] = { ...updated[ri], operator_vendor: e.target.value as string };
                                            updateForm(idx, 'sectionC', updated);
                                          }}
                                          displayEmpty
                                          sx={{ fontSize: 12, '&:after': { borderColor: UI.primary }, '& .MuiSelect-select': { py: 0.25 } }}
                                          MenuProps={{ PaperProps: { sx: { maxHeight: 200, '& .MuiMenuItem-root': { fontSize: 12, minHeight: 28, py: 0.25 } } } }}
                                        >
                                          <MenuItem value="" disabled>Operator/Vendor</MenuItem>
                                          {vendorOptions.map(v => (
                                            <MenuItem key={v.id} value={v.name}>{v.name}</MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                    </TableCell>
                                    <TableCell>
                                      <FormControl fullWidth size="small" variant="standard">
                                        <Select
                                          value={row.inspector || ''}
                                          onChange={e => {
                                            const updated = [...form.sectionC];
                                            updated[ri] = { ...updated[ri], inspector: e.target.value as string };
                                            updateForm(idx, 'sectionC', updated);
                                          }}
                                          displayEmpty
                                          sx={{ fontSize: 12, '&:after': { borderColor: UI.primary }, '& .MuiSelect-select': { py: 0.25 } }}
                                          MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: 12, minHeight: 28, py: 0.25 } } } }}
                                        >
                                          <MenuItem value="" disabled>Inspector</MenuItem>
                                          {inspectorOptions.map(name => (
                                            <MenuItem key={name} value={name}>{name}</MenuItem>
                                          ))}
                                          {/* <MenuItem value="MJ">MJ</MenuItem>
                                          <MenuItem value="JW">JW</MenuItem> */}
                                        </Select>
                                      </FormControl>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: 'center' }}>
                                      <Checkbox
                                        checked={!!row.completed}
                                        onChange={e => {
                                          const updated = [...form.sectionC];
                                          updated[ri] = { ...updated[ri], completed: e.target.checked };
                                          updateForm(idx, 'sectionC', updated);
                                        }}
                                        size="small"
                                        sx={{ color: UI.primary, '&.Mui-checked': { color: UI.primary }, p: 0 }}
                                      />
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </>
                      )}

                      {/* ══════════════════════════════════════════════════════
                         General Notes - Section D for Machining, Section C for Anodizing
                         ══════════════════════════════════════════════════════ */}
                      <SectionHeader
                        icon={<Factory size={18} />}
                        title={cardTravelerType === 'anodizing_industry' ? 'Section C: General Notes' : 'Section D: General Notes'}
                        subtitle=""
                      />
                      <Box sx={{ mb: 3, border: `1px solid ${UI.border}`, borderRadius: UI.radiusSm, overflow: 'hidden', bgcolor: 'var(--bg-input)' }}>
                        {/* Line-based notes input - underline style like form writing lines */}
                        {(() => {
                          const notesLines = (form.generalNotes || '').split('\n');
                          // Ensure at least 4 lines for clean appearance
                          while (notesLines.length < 4) notesLines.push('');
                          return notesLines.map((line, lineIdx) => (
                            <Box key={lineIdx} sx={{ display: 'flex', alignItems: 'flex-end', px: 2, py: 0 }}>
                              <TextField
                                fullWidth
                                size="small"
                                variant="standard"
                                value={line}
                                onChange={e => {
                                  const newLines = [...notesLines];
                                  newLines[lineIdx] = e.target.value;
                                  // Remove trailing empty lines but keep at least 4
                                  while (newLines.length > 4 && newLines[newLines.length - 1] === '') {
                                    newLines.pop();
                                  }
                                  updateForm(idx, 'generalNotes', newLines.join('\n'));
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const newLines = [...notesLines];
                                    newLines.splice(lineIdx + 1, 0, '');
                                    updateForm(idx, 'generalNotes', newLines.join('\n'));
                                    // Focus next line after render
                                    setTimeout(() => {
                                      const inputs = document.querySelectorAll(`[data-notes-line="${idx}"]`);
                                      const nextInput = inputs[lineIdx + 1] as HTMLInputElement;
                                      if (nextInput) nextInput.focus();
                                    }, 50);
                                  }
                                  if (e.key === 'Backspace' && line === '' && lineIdx > 0 && notesLines.length > 4) {
                                    e.preventDefault();
                                    const newLines = notesLines.filter((_, i) => i !== lineIdx);
                                    updateForm(idx, 'generalNotes', newLines.join('\n'));
                                  }
                                }}
                                placeholder={lineIdx === 0 ? 'Enter notes...' : ''}
                                inputProps={{ 'data-notes-line': idx } as any}
                                sx={{
                                  '& .MuiInput-root': { fontSize: 13, py: 0.75 },
                                  '& .MuiInput-underline:before': {
                                    borderBottomStyle: 'dashed',
                                    borderBottomColor: UI.border,
                                  },
                                  '& .MuiInput-underline:after': {
                                    borderBottomColor: UI.primary,
                                  },
                                  '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                                    borderBottomColor: UI.textMuted,
                                  },
                                }}
                              />
                            </Box>
                          ));
                        })()}
                      </Box>

                      {/* ══════════════════════════════════════════════════════
                         Section E: Check List (Machining only)
                         ══════════════════════════════════════════════════════ */}
                      {cardTravelerType !== 'anodizing_industry' && (
                        <>
                          <SectionHeader
                            icon={<ClipboardList size={18} />}
                            title="Section E: Check List"
                            subtitle="Final verification checklist"
                          />
                          <TableContainer sx={{
                            mb: 3, borderRadius: UI.radiusSm, border: `1px solid ${UI.border}`,
                            overflow: 'hidden', boxShadow: UI.shadow,
                          }}>
                            <Table size="medium">
                              <TableHead>
                                <TableRow>
                                  {['PO', 'Drawing', 'Material Cert', 'Inspec. Report', 'Delivery'].map(h => (
                                    <TableCell key={h} sx={{
                                      '&.MuiTableCell-head': {
                                        background: UI.gradient, color: '#FFFFFF', fontWeight: 800,
                                        fontSize: 13, py: 2, px: 2, letterSpacing: 0.5, textTransform: 'uppercase',
                                        borderBottom: 'none', textAlign: 'center', verticalAlign: 'middle',
                                        textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                      },
                                    }}>{h}</TableCell>
                                  ))}
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                <TableRow sx={{
                                  bgcolor: UI.bgCard,
                                  '& td': { py: 1.5, px: 1.5, fontSize: 13, lineHeight: 1.5, verticalAlign: 'middle' },
                                }}>
                                  {(['po', 'drawing', 'materialCert', 'inspecReport', 'delivery'] as (keyof SectionEChecklist)[]).map(field => (
                                    <TableCell key={field}>
                                      <TextField fullWidth size="small" variant="standard"
                                        value={form.sectionEChecklist[field]}
                                        onChange={e => {
                                          updateForm(idx, 'sectionEChecklist', {
                                            ...form.sectionEChecklist,
                                            [field]: e.target.value,
                                          });
                                        }}
                                        sx={{ '& .MuiInput-underline:after': { borderColor: UI.primary } }}
                                      />
                                    </TableCell>
                                  ))}
                                </TableRow>
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </>
                      )}

                      {/* Action Buttons */}
                      <Box sx={{
                        display: 'flex', justifyContent: 'flex-start', gap: 1.5,
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
