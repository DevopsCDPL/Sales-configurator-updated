import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  IconButton,
  Collapse,
  Divider,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Tooltip,
  Stack,
  Chip,
  Switch,
  FormControlLabel,
  Radio,
  Menu,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  CircularProgress,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Save as SaveIcon,
  CheckCircle as ApproveIcon,
  Check as CheckIcon,
  ContentCopy as CopyIcon,
  AttachFile as AttachFileIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Calculate as CalculateIcon,
  Payments as PaymentsIcon,
  MoreVert as MoreVertIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { Calculator } from 'lucide-react';
import { Project, Estimate, EstimateItem, CustomPart, ProcessModuleType } from '../../types';
import { estimateService } from '../../services/estimateService';
import { projectService } from '../../services/projectService';
import { vendorService } from '../../services/vendorService';
import { partService, PartData } from '../../services/partService';
import api from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';
import { UI, TabContainer, EnhancedNavFooter, AnimatedSection } from '../UIComponents';
import { viewDocument, buildProjectFileName } from '../../utils/documentUtils';
import { buildDescription } from '../../utils/calculations';

interface EstimationTabProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onProceedToQuotation?: () => void;
}

const moduleLabels: Record<ProcessModuleType, string> = {
  cnc_turning:         'CNC Turning',
  cnc_milling:         'CNC Milling',
  laser_cutting:       'Laser Cutting',
  fabrication_welding: 'Fabrication / Welding',
  welding:             'Welding',
  heat_treatment:      'Heat Treatment',
  grinding:            'Grinding',
  drilling:            'Drilling',
  boring:              'Boring',
  threading:           'Threading',
  surface_treatment:   'Surface Treatment',
  assembly:            'Assembly',
  testing:             'Testing',
  blank_module:        'Balnk Module',
  other:               'Other Process',
};

// --- Module Field Definitions -------------------------------------------------
interface ModuleField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
  placeholder?: string;
}

interface AutoField {
  key: string;
  label: string;
  isManualOk?: boolean;
}

interface ModuleFieldDef {
  inputs: ModuleField[];
  auto: AutoField[];
}

// Helper for generic process modules (welding, grinding, drilling, etc.)
const _genericModuleDef = (_processName: string): ModuleFieldDef => ({
  inputs: [
    { key: 'job_name',                  label: 'Job Name',               type: 'text' },
    { key: 'material_type',             label: 'Material Type',          type: 'text' },
    { key: 'drawing_part_no',           label: 'Drawing/Part No.',       type: 'text' },
    { key: 'material_grade',            label: 'Material Grade',         type: 'text' },
    { key: 'no_of_operations',          label: 'No. of Operations',      type: 'number' },
    { key: 'quantity',                  label: 'Quantity',               type: 'number' },
    { key: 'cycle_time_per_operation',  label: 'Cycle Time / Operation', type: 'number', placeholder: 'or auto-estimated' },
    { key: 'overall_margin_percent',    label: 'Overall Margin %',       type: 'number' },
    { key: 'operator_rate',             label: 'Operator Rate',          type: 'number' },
    { key: 'setup_time',                label: 'Setup Time (hrs)',        type: 'number' },
  ],
  auto: [
    { key: 'process_time_hrs', label: 'Process Time (hrs)' },
    { key: 'labor_cost',       label: 'Labor Cost' },
    { key: 'raw_material_cost', label: 'Raw Material Cost', isManualOk: true },
    { key: 'process_cost',     label: 'Process Cost' },
    { key: 'total_job_cost',   label: 'Total Job Cost' },
    { key: 'profit',           label: 'Profit' },
  ],
});

const moduleFieldDefs: Record<ProcessModuleType, ModuleFieldDef> = {
  // -- CNC Turning --------------------------------------------------
  cnc_turning: {
    inputs: [
      { key: 'job_name',                  label: 'Job Name',                   type: 'text' },
      { key: 'material_type',             label: 'Material Type',              type: 'text' },
      { key: 'tool_change_count',         label: 'Tool Change Count',          type: 'number' },
      { key: 'drawing_part_no',           label: 'Drawing/Part No.',           type: 'text' },
      { key: 'material_grade',            label: 'Material Grade',             type: 'text' },
      { key: 'tolerance_class',           label: 'Tolerance Class',            type: 'select', options: ['Normal', 'Tight', 'Critical'] },
      { key: 'raw_diameter',              label: 'Raw Diameter',               type: 'number' },
      { key: 'no_of_operations',          label: 'No. of Operations',          type: 'select', options: ['Rough', 'Finish', 'Groove', 'Thread'] },
      { key: 'quantity',                  label: 'Quantity',                   type: 'number' },
      { key: 'finished_diameter',         label: 'Finished Diameter',          type: 'number' },
      { key: 'cycle_time_per_operation',  label: 'Cycle Time / Operation',     type: 'number', placeholder: 'or auto-estimated' },
      { key: 'overall_margin_percent',    label: 'Overall Margin %',           type: 'number' },
      { key: 'part_length',               label: 'Part Length',                type: 'number' },
      { key: 'setup_time',                label: 'Setup Time (hrs)',            type: 'number' },
      { key: 'operator_rate',             label: 'Operator Rate',              type: 'number' },
    ],
    auto: [
      { key: 'machine_selection',     label: 'Machine Selection' },
      { key: 'machining_cost',        label: 'Machining Cost' },
      { key: 'raw_material_cost',     label: 'Raw Material Cost', isManualOk: true },
      { key: 'machining_time_hrs',    label: 'Machining Time (hrs)' },
      { key: 'tool_wear_cost',        label: 'Tool Wear Cost' },
      { key: 'total_job_cost',        label: 'Total Job Cost' },
      { key: 'setup_cost',            label: 'Setup Cost' },
      { key: 'turning_process_cost',  label: 'Turning Process Cost' },
      { key: 'profit',                label: 'Profit' },
    ],
  },
  // -- CNC Milling ---------------------------------------------------
  cnc_milling: {
    inputs: [
      { key: 'job_name',               label: 'Job Name',                type: 'text' },
      { key: 'material_type',          label: 'Material Type',           type: 'text' },
      { key: 'tool_change_count',      label: 'Tool Change Count',       type: 'number' },
      { key: 'drawing_part_no',        label: 'Drawing/Part No.',        type: 'text' },
      { key: 'material_grade',         label: 'Material Grade',          type: 'text' },
      { key: 'tolerance_class',        label: 'Tolerance Class',         type: 'select', options: ['Normal', 'Tight', 'Critical'] },
      { key: 'no_of_setups',           label: 'No. of Setups',           type: 'number' },
      { key: 'no_of_operations',       label: 'No. of Operations',       type: 'select', options: ['Rough', 'Finish', 'Groove', 'Thread'] },
      { key: 'quantity',               label: 'Quantity',                type: 'number' },
      { key: 'machine_type',           label: 'Machine Type',            type: 'text' },
      { key: 'cycle_time_per_operation', label: 'Cycle Time / Operation', type: 'number', placeholder: 'or auto-estimated' },
      { key: 'overall_margin_percent', label: 'Overall Margin %',        type: 'number' },
      { key: 'operator_rate',          label: 'Operator Rate',           type: 'number' },
      { key: 'setup_time',             label: 'Setup Time (hrs)',         type: 'number' },
    ],
    auto: [
      { key: 'machining_time_hrs', label: 'Machining Time (hrs)' },
      { key: 'labor_cost',         label: 'Labor Cost' },
      { key: 'raw_material_cost',  label: 'Raw Material Cost', isManualOk: true },
      { key: 'machine_cost',       label: 'Machine Cost' },
      { key: 'tool_wear_cost',     label: 'Tool Wear Cost' },
      { key: 'total_job_cost',     label: 'Total Job Cost' },
      { key: 'profit',             label: 'Profit' },
    ],
  },
  laser_cutting: {
    inputs: [
      { key: 'job_name',               label: 'Job Name',                type: 'text' },
      { key: 'material_type',          label: 'Material Type',           type: 'text' },
      { key: 'total_cut_length',       label: 'Total Cut Length',        type: 'number' },
      { key: 'drawing_part_no',        label: 'Drawing/Part No.',        type: 'text' },
      { key: 'material_grade',         label: 'Material Grade',          type: 'text' },
      { key: 'machine_type',           label: 'Machine Type',            type: 'text' },
      { key: 'thickness',              label: 'Thickness',               type: 'number' },
      { key: 'no_of_operations',       label: 'No. of Operations',       type: 'select', options: ['Rough', 'Finish', 'Groove', 'Thread'] },
      { key: 'quantity',               label: 'Quantity',                type: 'number' },
      { key: 'cutting_speed',          label: 'Cutting Speed',           type: 'number' },
      { key: 'cycle_time_per_operation', label: 'Cycle Time / Operation', type: 'number', placeholder: 'or auto-estimated' },
      { key: 'overall_margin_percent', label: 'Overall Margin %',        type: 'number' },
      { key: 'operator_rate',          label: 'Operator Rate',           type: 'number' },
      { key: 'setup_time',             label: 'Setup Time (hrs)',         type: 'number' },
    ],
    auto: [
      { key: 'cutting_time_hrs',  label: 'Cutting Time (hrs)' },
      { key: 'labor_cost',        label: 'Labor Cost' },
      { key: 'raw_material_cost', label: 'Raw Material Cost', isManualOk: true },
      { key: 'laser_cost',        label: 'Laser Cost' },
      { key: 'scrap_percent',     label: 'Scrap %' },
      { key: 'total_job_cost',    label: 'Total Job Cost' },
      { key: 'profit',            label: 'Profit' },
    ],
  },
  fabrication_welding: {
    inputs: [
      { key: 'job_name',               label: 'Job Name',                type: 'text' },
      { key: 'material_type',          label: 'Material Type',           type: 'text' },
      { key: 'total_cut_length',       label: 'Total Cut Length',        type: 'number' },
      { key: 'drawing_part_no',        label: 'Drawing/Part No.',        type: 'text' },
      { key: 'material_grade',         label: 'Material Grade',          type: 'text' },
      { key: 'machine_type',           label: 'Machine Type',            type: 'text' },
      { key: 'thickness',              label: 'Thickness',               type: 'number' },
      { key: 'no_of_operations',       label: 'No. of Operations',       type: 'select', options: ['Rough', 'Finish', 'Groove', 'Thread'] },
      { key: 'quantity',               label: 'Quantity',                type: 'number' },
      { key: 'cutting_speed',          label: 'Cutting Speed',           type: 'number' },
      { key: 'cycle_time_per_operation', label: 'Cycle Time / Operation', type: 'number', placeholder: 'or auto-estimated' },
      { key: 'overall_margin_percent', label: 'Overall Margin %',        type: 'number' },
      { key: 'operator_rate',          label: 'Operator Rate',           type: 'number' },
      { key: 'setup_time',             label: 'Setup Time (hrs)',         type: 'number' },
    ],
    auto: [
      { key: 'cutting_time_hrs',  label: 'Cutting Time (hrs)' },
      { key: 'labor_cost',        label: 'Labor Cost' },
      { key: 'raw_material_cost', label: 'Raw Material Cost', isManualOk: true },
      { key: 'laser_cost',        label: 'Laser / Weld Cost' },
      { key: 'scrap_percent',     label: 'Scrap %' },
      { key: 'total_job_cost',    label: 'Total Job Cost' },
      { key: 'profit',            label: 'Profit' },
    ],
  },
  // -- Generic modules -----------------------------------------------
  welding:           _genericModuleDef('Welding'),
  heat_treatment:    _genericModuleDef('Heat Treatment'),
  grinding:          _genericModuleDef('Grinding'),
  drilling:          _genericModuleDef('Drilling'),
  boring:            _genericModuleDef('Boring'),
  threading:         _genericModuleDef('Threading'),
  surface_treatment: _genericModuleDef('Surface Treatment'),
  assembly:          _genericModuleDef('Assembly'),
  testing:           _genericModuleDef('Testing'),
  blank_module:      _genericModuleDef('Blank Module'),
  other:             _genericModuleDef('Process'),
};

/**
 * SYNC WARNING: This function mirrors backend PROCESS_CALCULATORS in
 * backend/src/services/estimateService.js. Any formula change must be
 * applied to BOTH files. This local copy exists for instant UI feedback.
 */
const calculateModuleLocally = (
  moduleType: ProcessModuleType,
  inputs: Record<string, any>
): Record<string, number> => {
  if (moduleType === 'cnc_turning') {
    const operatorRate      = parseFloat(inputs.operator_rate) || 0;
    const setupTime         = parseFloat(inputs.setup_time) || 0;
    const cycleTime         = parseFloat(inputs.cycle_time_per_operation) || 0;
    const quantity          = parseFloat(inputs.quantity) || 0;
    const toolChanges       = parseFloat(inputs.tool_change_count) || 0;
    const rawMat            = parseFloat(inputs.raw_material_cost) || 0;
    const margin            = parseFloat(inputs.overall_margin_percent) || 0;
    const machining_time_hrs = (setupTime + quantity * cycleTime) / 60;
    const setup_cost         = parseFloat((setupTime * operatorRate / 60).toFixed(2));
    const machining_cost     = parseFloat((machining_time_hrs * operatorRate * 1.5).toFixed(2));
    const tool_wear_cost     = parseFloat((toolChanges * 50).toFixed(2));
    const turning_process_cost = parseFloat((setup_cost + machining_cost + tool_wear_cost).toFixed(2));
    const total_job_cost     = parseFloat((turning_process_cost + rawMat).toFixed(2));
    const profit             = parseFloat((total_job_cost * margin / 100).toFixed(2));
    return { machining_time_hrs: parseFloat(machining_time_hrs.toFixed(3)), setup_cost, machining_cost, tool_wear_cost, turning_process_cost, raw_material_cost: rawMat, total_job_cost, profit };
  }
  if (moduleType === 'cnc_milling') {
    const operatorRate   = parseFloat(inputs.operator_rate) || 0;
    const setupTime      = parseFloat(inputs.setup_time) || 0;
    const noOfSetups     = parseFloat(inputs.no_of_setups) || 1;
    const cycleTime      = parseFloat(inputs.cycle_time_per_operation) || 0;
    const quantity       = parseFloat(inputs.quantity) || 0;
    const toolChanges    = parseFloat(inputs.tool_change_count) || 0;
    const rawMat         = parseFloat(inputs.raw_material_cost) || 0;
    const margin         = parseFloat(inputs.overall_margin_percent) || 0;
    const machining_time_hrs = (noOfSetups * setupTime + quantity * cycleTime) / 60;
    const labor_cost     = parseFloat((machining_time_hrs * operatorRate).toFixed(2));
    const machine_cost   = parseFloat((machining_time_hrs * operatorRate * 1.5).toFixed(2));
    const tool_wear_cost = parseFloat((toolChanges * 50).toFixed(2));
    const total_job_cost = parseFloat((labor_cost + machine_cost + tool_wear_cost + rawMat).toFixed(2));
    const profit         = parseFloat((total_job_cost * margin / 100).toFixed(2));
    return { machining_time_hrs: parseFloat(machining_time_hrs.toFixed(3)), labor_cost, raw_material_cost: rawMat, machine_cost, tool_wear_cost, total_job_cost, profit };
  }
  if (moduleType === 'laser_cutting' || moduleType === 'fabrication_welding') {
    const totalLen    = parseFloat(inputs.total_cut_length) || 0;
    const speed       = parseFloat(inputs.cutting_speed) || 1;
    const opRate      = parseFloat(inputs.operator_rate) || 0;
    const qty         = parseFloat(inputs.quantity) || 1;
    const thickness   = parseFloat(inputs.thickness) || 1;
    const rawMat      = parseFloat(inputs.raw_material_cost) || 0;
    const margin      = parseFloat(inputs.overall_margin_percent) || 0;
    const cutting_time_hrs = parseFloat(((totalLen / speed) / 60).toFixed(3));
    const labor_cost  = parseFloat((cutting_time_hrs * opRate * qty).toFixed(2));
    const laser_cost  = parseFloat((cutting_time_hrs * 500 * qty).toFixed(2));
    const scrap_percent = thickness > 10 ? 8 : thickness > 5 ? 5 : 3;
    const total_job_cost = parseFloat((labor_cost + laser_cost + rawMat).toFixed(2));
    const profit      = parseFloat((total_job_cost * margin / 100).toFixed(2));
    return { cutting_time_hrs, labor_cost, raw_material_cost: rawMat, laser_cost, scrap_percent, total_job_cost, profit };
  }
  // Generic modules (welding, grinding, drilling, boring, etc.)
  {
    const opRate     = parseFloat(inputs.operator_rate) || 0;
    const cycleTime  = parseFloat(inputs.cycle_time_per_operation) || 0;
    const qty        = parseFloat(inputs.quantity) || 1;
    const ops        = parseFloat(inputs.no_of_operations) || 1;
    const setupTime  = parseFloat(inputs.setup_time) || 0;
    const rawMat     = parseFloat(inputs.raw_material_cost) || 0;
    const margin     = parseFloat(inputs.overall_margin_percent) || 0;
    const process_time_hrs = (setupTime + qty * ops * cycleTime) / 60;
    const labor_cost  = parseFloat((process_time_hrs * opRate).toFixed(2));
    const process_cost = parseFloat((process_time_hrs * opRate * 1.5).toFixed(2));
    const total_job_cost = parseFloat((labor_cost + process_cost + rawMat).toFixed(2));
    const profit      = parseFloat((total_job_cost * margin / 100).toFixed(2));
    return { process_time_hrs: parseFloat(process_time_hrs.toFixed(3)), labor_cost, raw_material_cost: rawMat, process_cost, total_job_cost, profit };
  }
};

const MATERIAL_OPTIONS = [
  'Carbon Steel',
  'Stainless Steel',
  'Stainless Steel (SS 304)',
  'Stainless Steel (SS 316)',
  'Alloy Steel',
  'Tool Steel',
  'Nickel Alloy',
  'Aluminum',
  'Titanium',
  'Copper',
  'Brass',
  'Bronze',
  'Inconel',
  'Cast Iron',
  'Mild Steel',
  'Duplex Steel',
  'Plastics',
  'Other',
];

const createEmptyPart = (isBlankModule = false): CustomPart => ({
  id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  parts_master_id: undefined,
  raw_material_id: '',
  job_description: '',
  material: '',
  drawing_given_by_client: 'No',
  raw_material_display_id: '',
  material_grade: '',
  quantity: '',
  drawing_part_no: '',
  raw_material_supplied_by: '',
  vendor_id: '',
  raw_material_spec_id: '',
  material_source: 'Client Supplied',
  job_cost_per_unit: '',
  raw_material_dimension: '',
  drawing_file_name: '',
  bulk_order_variable_price: false,
  pricing_tiers: [],
  weight_per_unit: '',
  weight_unit: 'kg',
  total_weight: '',
  is_blank_module: isBlankModule,
});

// --- Helpers -----------------------------------------------------------------

const padIndex = (n: number) => String(n).padStart(2, '0');

// --- Main Component -----------------------------------------------------------

const EstimationTab: React.FC<EstimationTabProps> = ({ project, onUpdate, onBack, onProceedToQuotation }) => {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  // Removed loading state
  const { showError, showSuccess } = useNotification();
  const [saving, setSaving] = useState(false);

  // Revision state
  const [allRevisions, setAllRevisions] = useState<Estimate[]>([]);
  const [activeRevision, setActiveRevision] = useState<number>(0);
  const [copyingRevision, setCopyingRevision] = useState(false);
  const [deletingRevision, setDeletingRevision] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Edit Mode � true = editable fields, false = read-only view
  const [isEditMode, setIsEditMode] = useState(true);

  // Custom parts
  const [customParts, setCustomParts] = useState<CustomPart[]>([]);
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [sectionCollapsed, setSectionCollapsed] = useState(false);

  // Overhead / margin
  const [overheadCost, setOverheadCost] = useState<number | string>(0);
  const [marginPercent, setMarginPercent] = useState<number | string>(0);

  // Track unsaved changes � Approve is only available after saving
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Process modules
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [newlyAddedModuleId, setNewlyAddedModuleId] = useState<string | null>(null);
  const [moduleError, _setModuleError] = useState(false);

  // Ref to track latest inputs from all ProcessModuleCards (keyed by item.id)
  // This allows handleSaveParts to access each card's live inputs without requiring
  // the user to click "Calculate & Save" inside each card individually.
  const moduleInputsRef = useRef<Map<string, Record<string, any>>>(new Map());

  // When true, we are creating the very first estimate (R0) - show the parts form inline
  const [creatingFirstEstimate, setCreatingFirstEstimate] = useState(false);

  // 3-dot menu for revision and part actions
  const [revMenuAnchor, setRevMenuAnchor] = useState<null | HTMLElement>(null);
  const [revMenuTarget, setRevMenuTarget] = useState<number | null>(null);
  const [partMenuAnchor, setPartMenuAnchor] = useState<null | HTMLElement>(null);
  const [partMenuTarget, setPartMenuTarget] = useState<string | null>(null);

  // Vendor materials for Raw Material Specification dropdown
  const [vendorMaterials, setVendorMaterials] = useState<any[]>([]);
  const [_vendors, setVendors] = useState<any[]>([]);

  // Parts Master parts filtered by project's client_id and vendor mapping
  const [filteredParts, setFilteredParts] = useState<PartData[]>([]);

  // Ensure only one revision is approved (the most recently approved wins)
  const sanitizeRevisions = (revs: Estimate[]): Estimate[] => {
    const approved = revs.filter((r) => r.is_approved);
    if (approved.length <= 1) return revs;
    // Keep the one approved most recently (by approved_at); fall back to highest revision
    const keep = approved.reduce((a, b) => {
      const aTime = a.approved_at ? new Date(a.approved_at).getTime() : 0;
      const bTime = b.approved_at ? new Date(b.approved_at).getTime() : 0;
      if (aTime !== bTime) return aTime > bTime ? a : b;
      return a.revision > b.revision ? a : b;
    });
    return revs.map((r) =>
      r.is_approved && r.id !== keep.id
        ? { ...r, is_approved: false, approved_by: null as any, approved_at: null as any }
        : r
    );
  };

  useEffect(() => {
    // Load all three in parallel — they are independent
    loadInitial();
    loadFilteredParts();
    loadVendorMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const loadFilteredParts = async () => {
    try {
      const parts = await partService.getAll({
        status: 'active',
      });
      setFilteredParts(parts);
      // Sync latest cost_per_unit AND drawing from Parts Master into any already-loaded custom parts.
      // Backend (_syncDrawingsToDocuments) creates Document records on next save / next read,
      // so the frontend only needs to refresh the displayed file name.
      if (parts.length > 0) {
        setCustomParts((prev) => {
          const updated = prev.map((cp) => {
            if (!cp.parts_master_id) return cp;
            const master = parts.find((p) => p.id === cp.parts_master_id);
            if (!master) return cp;

            const changes: Partial<typeof cp> = {};

            // Sync cost
            if (master.cost_per_unit != null) {
              const latestCost = String(master.cost_per_unit);
              if (cp.job_cost_per_unit !== latestCost) {
                changes.job_cost_per_unit = latestCost;
              }
            }

            // Sync drawing display: when Part Master drawing has been uploaded or updated
            if (master.drawing_url && master.drawing_url !== cp.parts_master_drawing_url) {
              const fileName = master.drawing_url.split('/').pop() || master.drawing_url;
              changes.drawing_file_name = fileName;
              changes.parts_master_drawing_url = master.drawing_url;
            }

            // Sync missing part attributes for auto-populating in Production Tab
            const attributesToSync = [
              'manufacturing_type', 'production_industry',
              'cut_method', 'cut_length',
              'lathe_ops_required', 'mill_ops_required',
              'deburr_required', 'heat_treat_required', 'marking_required'
            ] as const;

            attributesToSync.forEach(attr => {
              if (master[attr] != null && cp[attr] !== master[attr]) {
                (changes as any)[attr] = master[attr];
              }
            });

            return Object.keys(changes).length > 0 ? { ...cp, ...changes } : cp;
          });
          const changed = updated.some((p, i) => p !== prev[i]);
          if (changed) setHasUnsavedChanges(true);
          return changed ? updated : prev;
        });
      }
    } catch {
      // Non-critical: filtered parts may not be available
    }
  };

  const loadVendorMaterials = async () => {
    try {
      const mats = await vendorService.getAllMaterials();
      setVendorMaterials(mats);
      // Extract unique vendors from the materials
      const uniqueVendors = new Map<string, any>();
      mats.forEach((m: any) => {
        if (m.vendor && !uniqueVendors.has(m.vendor.id)) {
          uniqueVendors.set(m.vendor.id, m.vendor);
        }
      });
      setVendors(Array.from(uniqueVendors.values()));
    } catch {
      // Non-critical: vendor materials may not be available
    }
  };

  const loadInitial = async () => {
    try {
      const revisions = sanitizeRevisions(await estimateService.getAllByProjectId(project.id));
      setAllRevisions(revisions);
      const latestRev = revisions.length > 0 ? Math.max(...revisions.map(r => r.revision)) : 0;
      setActiveRevision(latestRev);
      await loadEstimate(latestRev);
    } catch (err) {
      showError('Error loading estimate');
    }
  };

  const loadEstimate = async (rev?: number) => {
    const revision = rev !== undefined ? rev : activeRevision;
    try {
      const data = await estimateService.getByProjectId(project.id, revision);
      setEstimate(data);
      const parts: CustomPart[] = data && Array.isArray(data.custom_parts) && data.custom_parts.length > 0
        ? data.custom_parts
        : [createEmptyPart()];
      setCustomParts(parts);
      setExpandedParts(new Set(parts.map((p) => p.id)));
      if (data) {
        setOverheadCost(Number(data.overhead_cost) || 0);
        setMarginPercent(Number(data.margin_percent) || 0);
        setIsEditMode(false);
      } else {
        setIsEditMode(true);
      }
      setHasUnsavedChanges(false);
    } catch (err) {
      setEstimate(null);
      setCustomParts([createEmptyPart()]);
      setIsEditMode(true);
      setHasUnsavedChanges(false);
    }
  };

  const handleSwitchRevision = async (rev: number) => {
    setSectionCollapsed(false);
    setActiveRevision(rev);
    try {
      // Persist selected revision to the project so QuotationTab & PDF always match
      await projectService.selectRevision(project.id, rev);
      onUpdate(); // Refresh project data with the new selected_revision
    } catch (err) {
      // Non-blocking - local state still switches even if persist fails
      console.warn('Could not persist selected revision:', err);
    }
    await loadEstimate(rev);
  };

  const handleCopyRevision = async () => {
    try {
      setCopyingRevision(true);
      const newEstimate = await estimateService.copyRevision(project.id, activeRevision);
      const revisions = sanitizeRevisions(await estimateService.getAllByProjectId(project.id));
      setAllRevisions(revisions);
      setActiveRevision(newEstimate.revision);
      await loadEstimate(newEstimate.revision);
      // Open newly copied revision in full editable mode (loadEstimate sets it to false)
      setIsEditMode(true);
      showSuccess(`Revision R${newEstimate.revision} created successfully!`);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error creating new revision');
    } finally {
      setCopyingRevision(false);
    }
  };

  const handleDeleteRevision = async () => {
    try {
      setDeletingRevision(true);
      setDeleteConfirmOpen(false);
      const deletedRev = activeRevision;
      await estimateService.deleteRevision(project.id, activeRevision);
      const revisions = sanitizeRevisions(await estimateService.getAllByProjectId(project.id));
      setAllRevisions(revisions);
      const latestRev = revisions.length > 0 ? Math.max(...revisions.map(r => r.revision)) : 0;
      setActiveRevision(latestRev);
      await loadEstimate(latestRev);
      showSuccess(`Revision R${deletedRev} deleted successfully`);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error deleting revision');
    } finally {
      setDeletingRevision(false);
    }
  };

  // -- Custom Parts --------------------------------------------------

  const handleAddPart = (isBlankModule = false) => {
    const newPart = createEmptyPart(isBlankModule);
    setCustomParts((prev) => [...prev, newPart]);
    setExpandedParts((prev) => new Set([...prev, newPart.id]));
    setHasUnsavedChanges(true);
  };

  const handleUpdatePart = (id: string, field: keyof CustomPart, value: any) => {
    setCustomParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
    setHasUnsavedChanges(true);
  };

  // Handler for selecting a part from Parts Master dropdown (Job Description)
  const handleSelectPartFromMaster = async (partId: string, customPartId: string) => {
    const selectedPart = filteredParts.find((p) => p.id === partId);
    if (!selectedPart) {
      // Clearing selection - reset all auto-filled fields
      setCustomParts((prev) =>
        prev.map((p) =>
          p.id === customPartId
            ? {
                ...p,
                parts_master_id: undefined,
                raw_material_id: '',
                job_description: '',
                material: '',
                material_grade: '',
                drawing_part_no: '',
                drawing_revision: '',
                heat_number: '',
                raw_material_supplied_by: '',
                raw_material_dimension: '',
                drawing_file_name: '',
                drawing_given_by_client: 'No' as const,
                raw_material_display_id: '',
                vendor_id: '',
                manufacturing_type: '',
                cut_method: '',
                cut_length: '',
                lathe_ops_required: '',
                mill_ops_required: '',
                deburr_required: '',
                heat_treat_required: '',
                marking_required: '',
              }
            : p
        )
      );
      setHasUnsavedChanges(true);
      return;
    }

    // Map material_category from Parts Master to the closest MATERIAL_OPTIONS value
    const materialCategory = selectedPart.material_category || '';
    // 1. Exact match
    let materialValue = MATERIAL_OPTIONS.find((m) => m === materialCategory) || '';
    if (!materialValue) {
      // 2. Forward: does any option contain the category string? e.g. "Stainless Steel" ⊆ "Stainless Steel (SS 304)"
      materialValue = MATERIAL_OPTIONS.find((m) => m.toLowerCase().includes(materialCategory.toLowerCase())) || '';
    }
    if (!materialValue) {
      // 3. Reverse: does the category contain any option? e.g. "Nickel Alloy Inconel" ⊇ "Nickel Alloy"
      materialValue = MATERIAL_OPTIONS.find((m) => materialCategory.toLowerCase().includes(m.toLowerCase())) || materialCategory;
    }

    // Build raw material specification string from rawMaterial data
    let rawMaterialSpec = '';
    if (selectedPart.rawMaterial) {
      const rm = selectedPart.rawMaterial;
      const specParts = [rm.material_category, rm.material_grade, rm.condition].filter(Boolean);
      rawMaterialSpec = specParts.join(' - ');
    }

    // Extract drawing filename synchronously for instant UI update
    let drawingFileName = '';
    if (selectedPart.drawing_url) {
      const urlParts = selectedPart.drawing_url.split('/');
      drawingFileName = urlParts[urlParts.length - 1] || selectedPart.drawing_url;
    }

    // Update UI immediately — don't wait for drawing upload
    setCustomParts((prev) =>
      prev.map((p) =>
        p.id === customPartId
          ? {
              ...p,
              parts_master_id: selectedPart.id,
              parts_master_drawing_url: selectedPart.drawing_url || '',
              raw_material_id: selectedPart.raw_material_id || '',
              job_description: selectedPart.part_name,
              material: materialValue,
              material_grade: selectedPart.material_grade || '',
              drawing_part_no: selectedPart.part_number || '',
              drawing_revision: selectedPart.revision || '',
              heat_number: selectedPart.heat_number || '',
              drawing_given_by_client: selectedPart.drawing_given_by_client ? 'Yes' : 'No',
              raw_material_display_id: selectedPart.rawMaterial?.material_id || '',
              raw_material_dimension: rawMaterialSpec,
              drawing_file_name: drawingFileName,
              vendor_id: selectedPart.vendor_id || '',
              job_cost_per_unit: selectedPart.cost_per_unit ? String(selectedPart.cost_per_unit) : '',
              production_industry: selectedPart.production_industry || '',
              manufacturing_type: selectedPart.manufacturing_type || '',
              cut_method: selectedPart.cut_method || '',
              cut_length: selectedPart.cut_length || '',
              lathe_ops_required: selectedPart.lathe_ops_required || '',
              mill_ops_required: selectedPart.mill_ops_required || '',
              deburr_required: selectedPart.deburr_required || '',
              heat_treat_required: selectedPart.heat_treat_required || '',
              marking_required: selectedPart.marking_required || '',
            }
          : p
      )
    );
    // UI-only: stamp drawing filename + parts_master_drawing_url so the field
    // shows the file. Backend (estimateService._syncDrawingsToDocuments) will
    // create a Document record pointing at the existing Part Master R2 key on
    // save — no blob download / re-upload needed from the client.
    setHasUnsavedChanges(true);
  };

  const handleDeletePart = (id: string) => {
    setCustomParts((prev) => prev.filter((p) => p.id !== id));
    setExpandedParts((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleCopyPart = (part: CustomPart) => {
    const copy: CustomPart = {
      ...part,
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    // Insert the copy right after the original part
    setCustomParts((prev) => {
      const idx = prev.findIndex((p) => p.id === part.id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setExpandedParts((prev) => new Set([...prev, copy.id]));
    setHasUnsavedChanges(true);
  };

  const toggleExpandPart = (id: string) => {
    setExpandedParts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveParts = async () => {
    setShowEstValidation(true);
    // Validation only applies if custom parts exist - allow saving with zero parts
    if (customParts.length > 0 && !allPartsValid) {
      showError('Please fill all required fields in the custom parts section.');
      return;
    }
    try {
      setSaving(true);
      // --- Save ALL process modules with their latest inputs (from live card state) ---
      if (estimate && Array.isArray(estimate.items) && estimate.items.length > 0) {
        for (const item of estimate.items) {
          // Use the live inputs from the ref (ProcessModuleCard keeps this updated)
          // Fall back to item.input_json from DB if card hasn't registered yet
          const liveInputs = moduleInputsRef.current.get(item.id) || item.input_json || {};
          // Calculate locally so calculated_json and total_cost are up-to-date
          const calc = calculateModuleLocally(item.module_type, liveInputs);
          const mergedInputs = { ...liveInputs, ...calc };
          try {
            await estimateService.updateItem(estimate.id, item.id, { input_json: mergedInputs });
          } catch (e) {
            console.warn(`Failed to save module ${item.id}:`, e);
          }
        }
      }
      // Now save the estimation as before
      await estimateService.createOrUpdate(project.id, {
        custom_parts: customParts as any,
        overhead_cost: parseFloat(String(overheadCost)) || 0,
        margin_percent: parseFloat(String(marginPercent)) || 0,
        revision: activeRevision,
      } as any);
      // Reload revisions list and current estimate
      const revisions = sanitizeRevisions(await estimateService.getAllByProjectId(project.id));
      setAllRevisions(revisions);
      await loadEstimate(activeRevision);
      setCreatingFirstEstimate(false);
      onUpdate();
      showSuccess('Estimation saved successfully!');
      setIsEditMode(false);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving estimate');
    } finally {
      setSaving(false);
    }
  };

  // -- Process Modules -------------------------------------------------------

  const handleAddItem = async (moduleType: ProcessModuleType) => {
    try {
      let est = estimate;
      if (!est) {
        await estimateService.createOrUpdate(project.id, {
          custom_parts: customParts as any,
          overhead_cost: parseFloat(String(overheadCost)) || 0,
          margin_percent: parseFloat(String(marginPercent)) || 0,
          revision: activeRevision,
        } as any);
        est = await estimateService.getByProjectId(project.id, activeRevision);
      }
      const existingIds = new Set((est?.items || []).map((i) => i.id));
      if (est) {
        await estimateService.addItem(est.id, { module_type: moduleType, input_json: {} });
      }
      const refreshed = await estimateService.getByProjectId(project.id, activeRevision);
      // Find the newly added item and auto-expand it
      const newItem = (refreshed?.items || []).find((i) => !existingIds.has(i.id));
      if (newItem) {
        setExpandedItems((prev) => new Set([...prev, newItem.id]));
        setNewlyAddedModuleId(newItem.id);
      }
      setEstimate(refreshed);
      if (refreshed) {
        setOverheadCost(Number(refreshed.overhead_cost) || 0);
        setMarginPercent(Number(refreshed.margin_percent) || 0);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error adding module');
    }
  };

  const handleUpdateItem = async (item: EstimateItem, inputJson: Record<string, any>) => {
    if (!estimate) return;
    try {
      await estimateService.updateItem(estimate.id, item.id, { input_json: inputJson });
      await loadEstimate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error updating module');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!estimate) return;
    try {
      await estimateService.deleteItem(estimate.id, itemId);
      await loadEstimate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error deleting module');
    }
  };

  const handleCopyItem = async (item: EstimateItem) => {
    if (!estimate) return;
    try {
      const existingIds = new Set((estimate.items || []).map((i) => i.id));
      await estimateService.addItem(estimate.id, {
        module_type: item.module_type,
        input_json: { ...item.input_json },
      });
      const refreshed = await estimateService.getByProjectId(project.id, activeRevision);
      const newItem = (refreshed?.items || []).find((i) => !existingIds.has(i.id));
      if (newItem) {
        setExpandedItems((prev) => new Set([...prev, newItem.id]));
        setNewlyAddedModuleId(newItem.id);
      }
      setEstimate(refreshed);
      if (refreshed) {
        setOverheadCost(Number(refreshed.overhead_cost) || 0);
        setMarginPercent(Number(refreshed.margin_percent) || 0);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error copying module');
    }
  };

  const handleApprove = async () => {
    if (!estimate) return;
    try {
      setSaving(true);
      await estimateService.approve(estimate.id);
      // Reload revisions (approval locks others)
      const revisions = sanitizeRevisions(await estimateService.getAllByProjectId(project.id));
      setAllRevisions(revisions);
      await loadEstimate(activeRevision);
      onUpdate();
      showSuccess('Estimate approved! You can now proceed to Quotation.');
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error approving estimate');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** True when form fields should be disabled (only when not in edit mode) */
  const fieldReadOnly = !isEditMode;

  // Live cost totals
  const getPartTotal = (p: CustomPart): number => {
    if (p.bulk_order_variable_price && p.pricing_tiers && p.pricing_tiers.length > 0) {
      // Use first tier as default cost for summary
      const tier = p.pricing_tiers[0];
      return (parseFloat(String(tier.quantity)) || 0) * (parseFloat(String(tier.unit_price)) || 0);
    }
    return (parseFloat(String(p.quantity)) || 0) * (parseFloat(String(p.job_cost_per_unit)) || 0);
  };
  const partsTotal = customParts.reduce((sum, p) => sum + getPartTotal(p), 0);
  const processCost = Number(estimate?.process_cost || 0);
  const overhead = parseFloat(String(overheadCost)) || 0;
  const margin = parseFloat(String(marginPercent)) || 0;
  const totalCost = partsTotal + processCost + overhead;
  const finalPrice = totalCost * (1 + margin / 100);

  // -- Mandatory-field validation --------------------------------------------
  const REQUIRED_PART_FIELDS: (keyof CustomPart)[] = [
    'job_description', 'material',
    'quantity', 'drawing_part_no', 'job_cost_per_unit',
  ];
  const [showEstValidation, setShowEstValidation] = useState(false);

  const isPartValid = (p: CustomPart) => {
    // When bulk pricing is on, quantity and job_cost_per_unit are not required
    // (pricing_tiers replaces them)
    const requiredFields = p.bulk_order_variable_price
      ? REQUIRED_PART_FIELDS.filter(k => k !== 'quantity' && k !== 'job_cost_per_unit')
      : REQUIRED_PART_FIELDS;
    const baseValid = requiredFields.every(k => String(p[k] ?? '').trim() !== '');
    if (p.bulk_order_variable_price) {
      // At least one tier with both quantity and unit_price filled
      const tiers = p.pricing_tiers || [];
      const tiersValid = tiers.length > 0 &&
        tiers.some(t =>
          String(t.quantity ?? '').trim() !== '' && String(t.unit_price ?? '').trim() !== ''
        );
      // No duplicate quantities allowed
      const qtyValues = tiers.map(t => String(t.quantity ?? '').trim()).filter(v => v !== '');
      const noDuplicates = qtyValues.length === new Set(qtyValues).size;
      return baseValid && tiersValid && noDuplicates;
    }
    return baseValid;
  };
  const allPartsValid = customParts.length > 0 && customParts.every(isPartValid);
  const partFieldError = (p: CustomPart, key: keyof CustomPart) => {
    if (p.bulk_order_variable_price && (key === 'quantity' || key === 'job_cost_per_unit')) return false;
    return showEstValidation && REQUIRED_PART_FIELDS.includes(key) && !String(p[key] ?? '').trim();
  };
  const partFieldHelperText = (p: CustomPart, key: keyof CustomPart): string => {
    if (!partFieldError(p, key)) return '';
    const labels: Record<string, string> = {
      job_description: 'Job Description is required',
      material: 'Material is required',
      drawing_part_no: 'Drawing / Part No. is required',
      quantity: 'Quantity is required',
      job_cost_per_unit: 'Unit Price is required',
    };
    return labels[key as string] || 'This field is required';
  };

  // Removed loading screen. Always render estimation content.


  return (
    <TabContainer>

      {/* Page Header */}
      <AnimatedSection>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '12px',
          backgroundColor: 'rgba(0,200,255,0.10)',
          border: '1px solid rgba(0,200,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Calculator size={22} color="#00c8ff" />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Estimation
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: '#6B7280' }}>
            {estimate ? `Revision R${estimate.revision ?? 0}` : 'Create your first estimation'}
          </Typography>
        </Box>
      </Box>
      </AnimatedSection>

      {/* Alerts */}
      {estimate?.is_approved && isEditMode && (
        <Alert severity="info" sx={{ mb: 2.5, borderRadius: 3, fontSize: 13 }}>
          You are editing an <strong>approved</strong> estimate. Saving changes will clear the approval and require re-approval.
        </Alert>
      )}

      {/* ===== MAIN CONTENT LAYOUT ===== */}
      <Grid container spacing={2} alignItems="flex-start">
        {/* LEFT COLUMN: Revision list + Estimation content */}
        <Grid item xs={12} md={9}>
          {!estimate && allRevisions.length === 0 && !creatingFirstEstimate && (
            <Box sx={{
              bgcolor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: 'none',
              p: 3,
              textAlign: 'center',
            }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', mb: 1 }}>
                No Estimations Yet
              </Typography>
              <Typography sx={{ fontSize: 14, color: '#6B7280', mb: 3 }}>
                Create your first estimation to get started
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => {
                  const newPart = createEmptyPart();
                  setCreatingFirstEstimate(true);
                  setIsEditMode(true);
                  setCustomParts([newPart]);
                  setExpandedParts(new Set([newPart.id]));
                }}
                sx={{
                  background: 'linear-gradient(135deg, #1F7A63 0%, #166354 100%)',
                  borderRadius: '12px', px: 4, py: 1.5,
                  textTransform: 'none', fontWeight: 600, fontSize: 15,
                  boxShadow: '0 4px 16px rgba(31,122,99,0.3)',
                  '&:hover': { background: 'linear-gradient(135deg, #166354 0%, #0D3D2F 100%)', boxShadow: '0 6px 24px rgba(31,122,99,0.4)', transform: 'translateY(-1px)' },
                  transition: 'all 0.2s',
                }}
              >
                Start New Estimation
              </Button>
            </Box>
          )}

          {/* ===== NEW ESTIMATION FORM (first-time creation) ===== */}
          {creatingFirstEstimate && allRevisions.length === 0 && (
            <Card sx={{
              mb: 2, borderRadius: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              border: '2px solid #1F7A63',
              overflow: 'hidden', backgroundColor: '#E8F7F2',
            }}>
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 2, py: 1.5,
                background: 'linear-gradient(135deg, #E8F7F2 0%, #E8F7F2 100%)',
              }}>
                <Typography sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15, letterSpacing: -0.2, flex: 1 }}>
                  New Estimation R0
                </Typography>
                <Chip label="New" size="small"
                  sx={{ height: 24, fontSize: 11, fontWeight: 600, backgroundColor: '#E8F7F2', color: '#1F7A63', border: '1px solid #d6efe5' }} />
                <FormControl size="small" sx={{
                  minWidth: 140,
                  '& .MuiOutlinedInput-root': { backgroundColor: '#FFFFFF', borderRadius: '10px', '& fieldset': { borderColor: 'var(--text-muted)' }, '&:hover fieldset': { borderColor: '#1F7A63' } },
                  '& .MuiInputLabel-root': { color: '#6B7280', fontSize: 13 },
                }}>
                  <InputLabel>Add Module</InputLabel>
                  <Select label="Add Module" value="" onChange={(e) => {
                    const val = e.target.value as string;
                    if (val === '_custom_module') {
                      handleAddPart(false);
                    } else if (val === 'blank_module') {
                      handleAddPart(true);
                    } else { handleAddItem(val as ProcessModuleType); }
                  }}>
                    <MenuItem value="_custom_module" sx={{ fontWeight: 600, color: '#1F7A63', borderBottom: '1px solid var(--border)' }}>Custom Module</MenuItem>
                    {Object.entries(moduleLabels).map(([key, label]) => (
                      <MenuItem key={key} value={key}>{label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <CardContent sx={{ p: { xs: 2.5, md: 4 }, borderTop: '1px solid var(--border)' }}>
                {customParts.map((part, index) => {
                  const partTotal = getPartTotal(part);
                  const isExpanded = expandedParts.has(part.id);
                  return (
                    <Card
                      key={part.id} data-part-id={part.id} variant="outlined"
                      sx={{
                        mb: 3,
                        border: showEstValidation && !isPartValid(part) ? '2px solid #ef4444' : '1px solid var(--border)',
                        borderRadius: '14px', overflow: 'hidden',
                        boxShadow: showEstValidation && !isPartValid(part)
                          ? '0 0 0 3px rgba(239,68,68,0.15)'
                          : isExpanded ? '0 2px 12px rgba(0,0,0,0.06)' : '0 1px 2px rgba(0,0,0,0.03)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {/* Part Header */}
                      <Box sx={{
                        display: 'flex', alignItems: 'center', px: 2.5, py: 1.5,
                        backgroundColor: isExpanded ? UI.bgSubtle : UI.bgSubtle,
                        borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                      }}>
                        <Box sx={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => toggleExpandPart(part.id)}>
                          {/* Use standardized description format: Part Name | Material | Grade | Condition | Dimensions */}
                          {(() => {
                            const { description, drawingDisplay } = buildDescription(part as any);
                            return (
                              <>
                                <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                                  {description}
                                </Typography>
                                <Typography noWrap sx={{ fontSize: 11, color: 'var(--text-muted)', mt: 0.25 }}>
                                  {drawingDisplay || 'No drawing'}
                                </Typography>
                              </>
                            );
                          })()}
                        </Box>
                        <Typography sx={{
                          color: '#1F7A63', backgroundColor: '#E8F7F2', border: '1px solid #d6efe5',
                          px: 1.5, py: 0.25, borderRadius: '8px', mr: 1.5, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                        }}>
                          $ {partTotal.toFixed(0)}
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mr: 0.5 }}>
                          <IconButton size="small"
                            onClick={(e) => { e.stopPropagation(); setPartMenuAnchor(e.currentTarget); setPartMenuTarget(part.id); }}
                            sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-secondary)', background: 'var(--border-subtle)' } }}>
                            <MoreVertIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Stack>
                        <IconButton size="small" onClick={() => toggleExpandPart(part.id)}
                          sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-secondary)' } }}>
                          {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </Box>

                      {/* Part Form Body */}
                      <Collapse in={isExpanded}>
                        <Box sx={{ p: 3, backgroundColor: '#FFFFFF' }}>
                          {/* SECTION: Work Information */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <Box sx={{ width: 3, height: 18, borderRadius: '2px', background: 'linear-gradient(180deg, #1F7A63, #2A9D7E)' }} />
                            <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                              Work Information
                            </Typography>
                          </Box>
                          <Grid container spacing={2} sx={{ mb: 2 }}>
                            <Grid item xs={12} sm={6} md={3}>
                              {part.is_blank_module ? (
                                <TextField
                                  fullWidth
                                  size="small"
                                  label="Job Description"
                                  required
                                  value={part.job_description || ''}
                                  onChange={(e) => handleUpdatePart(part.id, 'job_description', e.target.value)}
                                  error={!!partFieldError(part, 'job_description')}
                                  helperText={partFieldHelperText(part, 'job_description')}
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                />
                              ) : (
                                <FormControl
                                  fullWidth
                                  size="small"
                                  error={!!partFieldError(part, 'job_description')}
                                  required
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                >
                                  <InputLabel>Job Description</InputLabel>
                                  <Select
                                    label="Job Description"
                                    value={part.parts_master_id || ''}
                                    onChange={(e) => handleSelectPartFromMaster(e.target.value as string, part.id)}
                                    sx={{ borderRadius: '10px' }}
                                    renderValue={(selected) => {
                                      const fp = filteredParts.find((p) => p.id === selected);
                                      return fp ? fp.part_name : (part.job_description || '');
                                    }}
                                  >
                                    <MenuItem value=""><em>Select a Part</em></MenuItem>
                                    {filteredParts.length === 0 && (
                                      <MenuItem disabled><em>No parts available for selected client</em></MenuItem>
                                    )}
                                    {filteredParts.map((fp) => (
                                      <MenuItem key={fp.id} value={fp.id}>
                                        <Box>
                                          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{fp.part_name}</Typography>
                                          <Typography sx={{ fontSize: 11, color: '#64748B' }}>
                                            {fp.part_number || 'No Part #'} — {fp.material_category || ''} {fp.material_grade || ''}
                                          </Typography>
                                        </Box>
                                      </MenuItem>
                                    ))}
                                  </Select>
                                  {partFieldError(part, 'job_description') && (
                                    <Typography variant="caption" color="error" sx={{ mt: 0.3, ml: 1.5, fontSize: 11 }}>
                                      {partFieldHelperText(part, 'job_description')}
                                    </Typography>
                                  )}
                                </FormControl>
                              )}
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
                              <FormControl
                                fullWidth
                                size="small"
                                error={!!partFieldError(part, 'material')}
                                required
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                              >
                                <InputLabel>Material</InputLabel>
                                <Select
                                  label="Material" value={part.material}
                                  onChange={(e) => handleUpdatePart(part.id, 'material', e.target.value)}
                                  disabled={!!part.parts_master_id}
                                  sx={{ borderRadius: '10px' }}
                                >
                                  {MATERIAL_OPTIONS.map((m) => (
                                    <MenuItem key={m} value={m}>{m}</MenuItem>
                                  ))}
                                </Select>
                                {partFieldError(part, 'material') && (
                                  <Typography variant="caption" color="error" sx={{ mt: 0.3, ml: 1.5, fontSize: 11 }}>
                                    {partFieldHelperText(part, 'material')}
                                  </Typography>
                                )}
                              </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
                              <TextField
                                fullWidth
                                size="small" label="Drawing / Part No." required
                                value={part.drawing_part_no}
                                onChange={(e) => handleUpdatePart(part.id, 'drawing_part_no', e.target.value)}
                                disabled={!!part.parts_master_id}
                                error={!!partFieldError(part, 'drawing_part_no')}
                                helperText={partFieldHelperText(part, 'drawing_part_no')}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
                              {part.is_blank_module ? (
                                <TextField
                                  fullWidth
                                  size="small"
                                  label="Revision"
                                  value={part.drawing_revision || ''}
                                  onChange={(e) => handleUpdatePart(part.id, 'drawing_revision', e.target.value)}
                                  placeholder="e.g. R0, Rev1, A"
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                />
                              ) : (
                                <FormControl fullWidth size="small">
                                  <InputLabel>Revision</InputLabel>
                                  <Select
                                    label="Revision"
                                    value={part.drawing_revision || ''}
                                    onChange={(e) => handleUpdatePart(part.id, 'drawing_revision', e.target.value as string)}
                                    disabled={!!part.parts_master_id}
                                    sx={{ borderRadius: '10px' }}
                                  >
                                    <MenuItem value=""><em>None</em></MenuItem>
                                    {part.drawing_revision && !['R0','R1','R2','R3','R4','R5','R6','R7','R8','R9'].includes(part.drawing_revision) && (
                                      <MenuItem value={part.drawing_revision} sx={{ fontStyle: 'italic', color: '#1F7A63' }}>
                                        {part.drawing_revision} (from Part)
                                      </MenuItem>
                                    )}
                                    {['R0','R1','R2','R3','R4','R5','R6','R7','R8','R9'].map(r => (
                                      <MenuItem key={r} value={r}>{r}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              )}
                            </Grid>
                          </Grid>

                          {/* SECTION: Material & Drawing Details */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <Box sx={{ width: 3, height: 18, borderRadius: '2px', background: 'linear-gradient(180deg, #0369A1, #38BDF8)' }} />
                            <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                              Material &amp; Drawing Details
                            </Typography>
                          </Box>
                          <Grid container spacing={2} sx={{ mb: 2 }} alignItems="center">
                            {!part.is_blank_module && (
                              <>
                                <Grid item xs={12} sm={6} md={3}>
                                  <TextField
                                    fullWidth size="small"
                                    label="Material Grade"
                                    value={part.material_grade || ''}
                                    onChange={(e) => handleUpdatePart(part.id, 'material_grade', e.target.value)}
                                    disabled={!!part.parts_master_id}
                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                  />
                                </Grid>
                                <Grid item xs={12} sm={6} md={3}>
                                  <TextField
                                    fullWidth size="small"
                                    label="Raw Material Dimension"
                                    value={part.raw_material_dimension || ''}
                                    onChange={(e) => handleUpdatePart(part.id, 'raw_material_dimension', e.target.value)}
                                    disabled={!!part.parts_master_id}
                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                  />
                                </Grid>
                              </>
                            )}
                            <Grid item xs={12} sm={6} md={3}>
                              <FormControl fullWidth size="small">
                                <InputLabel>Material Source</InputLabel>
                                <Select
                                  label="Material Source"
                                  value={part.material_source || 'Client Supplied'}
                                  onChange={(e) => handleUpdatePart(part.id, 'material_source', e.target.value)}
                                  sx={{ borderRadius: '10px' }}
                                >
                                  <MenuItem value="Client Supplied">Client Supplied</MenuItem>
                                  <MenuItem value="In-House Stock">In-House Stock</MenuItem>
                                  <MenuItem value="Vendor Supplied">Vendor Supplied</MenuItem>
                                </Select>
                              </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <DrawingUploadField
                                partId={part.id}
                                fileName={part.drawing_file_name || ''}
                                readOnly={false}
                                onChange={(name) => handleUpdatePart(part.id, 'drawing_file_name', name)}
                                projectId={project.id}
                                projectNumber={project.project_number}
                              />
                            </Grid>
                          </Grid>

                          {/* SECTION: Pricing */}
                          <Box sx={{
                            border: '1px solid var(--border)', borderRadius: '14px',
                            overflow: 'hidden', backgroundColor: '#FFFFFF',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          }}>
                            <Box sx={{
                              display: 'flex', alignItems: 'center', gap: 1.5,
                              px: 2.5, height: 52,
                              background: 'linear-gradient(135deg, #FAFBFC, #F1F5F9)',
                              borderBottom: '1px solid var(--border)',
                            }}>
                              <Box sx={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', background: 'var(--border)', borderRadius: '50%', p: 0.7 }}>
                                <PaymentsIcon sx={{ fontSize: 17 }} />
                              </Box>
                              <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1F2937', letterSpacing: 0.2, flex: 1 }}>
                                Pricing
                              </Typography>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={!!part.bulk_order_variable_price}
                                    onChange={(e) => {
                                      handleUpdatePart(part.id, 'bulk_order_variable_price', e.target.checked);
                                      if (e.target.checked && (!part.pricing_tiers || part.pricing_tiers.length === 0)) {
                                        handleUpdatePart(part.id, 'pricing_tiers', [{ quantity: '', unit_price: '' }]);
                                      }
                                    }}
                                    size="small"
                                    sx={{
                                      '& .MuiSwitch-switchBase.Mui-checked': { color: '#1F7A63' },
                                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#1F7A63' },
                                    }}
                                  />
                                }
                                label={
                                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', color: part.bulk_order_variable_price ? '#1F7A63' : '#94a3b8', transition: 'color 0.2s' }}>
                                    Bulk Order Variable Price
                                  </Typography>
                                }
                                labelPlacement="start"
                                sx={{ m: 0, gap: 0.5 }}
                              />
                            </Box>
                            <Box sx={{ p: 0 }}>
                              {!part.bulk_order_variable_price ? (
                              <>
                              {/* Column headers */}
                              <Box sx={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                                gap: 0, px: 2.5, py: 1,
                                background: 'linear-gradient(135deg, #F1F5F9, #E8F5F0)',
                                borderBottom: '1.5px solid #E5E7EB',
                              }}>
                                <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>Quantity</Typography>
                                <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>USD / Unit</Typography>
                                <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>Total $</Typography>
                              </Box>
                              {/* Values row */}
                              <Box sx={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                                gap: 1.5, px: 2.5, py: 2, alignItems: 'center',
                              }}>
                                <TextField
                                  fullWidth size="small" type="number" required placeholder="Qty"
                                  value={part.quantity}
                                  onChange={(e) => {
                                    handleUpdatePart(part.id, 'quantity', e.target.value);
                                    const qty = parseFloat(e.target.value) || 0;
                                    const wpu = parseFloat(String(part.weight_per_unit)) || 0;
                                    if (wpu > 0) handleUpdatePart(part.id, 'total_weight', qty > 0 ? (qty * wpu).toFixed(2) : '');
                                  }}
                                  error={!!partFieldError(part, 'quantity')}
                                  helperText={partFieldHelperText(part, 'quantity')}
                                  sx={{
                                    '& .MuiOutlinedInput-root': { borderRadius: '10px', backgroundColor: 'var(--bg-input)' },
                                    '& input': { textAlign: 'center', fontSize: 13, py: '8px' },
                                  }}
                                  inputProps={{ min: 1 }}
                                />
                                <TextField
                                  fullWidth size="small" type="number" required placeholder="Price"
                                  value={part.job_cost_per_unit}
                                  onChange={(e) => handleUpdatePart(part.id, 'job_cost_per_unit', e.target.value)}
                                  error={!!partFieldError(part, 'job_cost_per_unit')}
                                  helperText={partFieldHelperText(part, 'job_cost_per_unit')}
                                  InputProps={{ startAdornment: <InputAdornment position="start" sx={{ '& p': { fontSize: 12, color: '#6B7280' } }}>$</InputAdornment> }}
                                  sx={{
                                    '& .MuiOutlinedInput-root': { borderRadius: '10px', backgroundColor: 'var(--bg-input)' },
                                    '& input': { textAlign: 'right', fontSize: 13, py: '8px' },
                                  }}
                                />
                                <Box sx={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  px: 1, py: '8px', borderRadius: '10px',
                                  backgroundColor: partTotal > 0 ? '#E8F7F2' : UI.bgSubtle,
                                  border: '1px solid', borderColor: partTotal > 0 ? '#A7F3D0' : 'var(--border)',
                                  minHeight: 38,
                                }}>
                                  <Typography sx={{ fontWeight: 600, color: partTotal > 0 ? '#065F46' : '#94a3b8', fontSize: 14 }}>
                                    $ {Math.round(partTotal).toLocaleString()}
                                  </Typography>
                                </Box>
                              </Box>
                              </>
                              ) : (
                              <Box>
                                <Box sx={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fafafa', m: 1 }}>
                                  <Box sx={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 36px',
                                    gap: 0, px: 2.5, py: 1.25,
                                    background: 'linear-gradient(135deg, #F1F5F9, #E8F5F0)',
                                    borderBottom: '1.5px solid #E5E7EB',
                                  }}>
                                    <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>Quantity</Typography>
                                    <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>USD / Unit</Typography>
                                    <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>Total $</Typography>
                                    <Box />
                                  </Box>
                                  {(part.pricing_tiers || []).map((tier: any, tIdx: number) => {
                                    const tierTotal = (parseFloat(String(tier.quantity)) || 0) * (parseFloat(String(tier.unit_price)) || 0);
                                    return (
                                      <Box key={tIdx} sx={{
                                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 36px',
                                        gap: 1.5, px: 2.5, py: 1.5, alignItems: 'center',
                                        borderBottom: tIdx < (part.pricing_tiers?.length || 0) - 1 ? '1px solid var(--border)' : 'none',
                                        backgroundColor: tIdx % 2 === 0 ? '#ffffff' : '#f8fafb',
                                        '&:hover': { backgroundColor: '#f0fdf9' },
                                        transition: 'background-color 0.15s',
                                      }}>
                                        <TextField size="small" type="number" placeholder="Qty" value={tier.quantity}
                                          onChange={(e) => { const tiers = [...(part.pricing_tiers || [])]; tiers[tIdx] = { ...tiers[tIdx], quantity: e.target.value }; handleUpdatePart(part.id, 'pricing_tiers', tiers); }}
                                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', backgroundColor: 'var(--bg-input)' }, '& input': { textAlign: 'center', fontSize: 13, py: '8px' } }}
                                          inputProps={{ min: 1 }}
                                        />
                                        <TextField size="small" type="number" placeholder="Price" value={tier.unit_price}
                                          onChange={(e) => { const tiers = [...(part.pricing_tiers || [])]; tiers[tIdx] = { ...tiers[tIdx], unit_price: e.target.value }; handleUpdatePart(part.id, 'pricing_tiers', tiers); }}
                                          InputProps={{ startAdornment: <InputAdornment position="start" sx={{ '& p': { fontSize: 12, color: '#6B7280' } }}>$</InputAdornment> }}
                                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', backgroundColor: 'var(--bg-input)' }, '& input': { textAlign: 'right', fontSize: 13, py: '8px' } }}
                                        />
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1, py: '8px', borderRadius: '10px', backgroundColor: tierTotal > 0 ? '#E8F7F2' : UI.bgSubtle, border: '1px solid', borderColor: tierTotal > 0 ? '#A7F3D0' : 'var(--border)', minHeight: 38 }}>
                                          <Typography sx={{ fontWeight: 600, color: tierTotal > 0 ? '#065F46' : '#94a3b8', fontSize: 13 }}>
                                            $ {tierTotal.toLocaleString()}
                                          </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                          <IconButton
                                            size="small"
                                            onClick={() => { const tiers = [...(part.pricing_tiers || [])]; tiers.splice(tIdx, 1); handleUpdatePart(part.id, 'pricing_tiers', tiers.length > 0 ? tiers : [{ quantity: '', unit_price: '' }]); }}
                                            sx={{ color: '#ef4444', p: 0.5, '&:hover': { background: '#fef2f2' } }}>
                                            <DeleteIcon sx={{ fontSize: 16 }} />
                                          </IconButton>
                                        </Box>
                                      </Box>
                                    );
                                  })}
                                  <Box sx={{ px: 2.5, py: 1.25, borderTop: '1px solid var(--border)', backgroundColor: '#fafffe' }}>
                                    <Button size="small" startIcon={<AddIcon sx={{ fontSize: 15 }} />}
                                      onClick={() => { const tiers = [...(part.pricing_tiers || []), { quantity: '', unit_price: '' }]; handleUpdatePart(part.id, 'pricing_tiers', tiers); }}
                                      sx={{ fontSize: 11.5, fontWeight: 600, textTransform: 'none', color: '#1F7A63', py: 0.5, px: 1.5, borderRadius: '8px', '&:hover': { background: '#E8F7F2' } }}>
                                      Add Price Tier ({(part.pricing_tiers || []).length})
                                    </Button>
                                  </Box>
                                </Box>
                              </Box>
                              )}
                            </Box>
                          </Box>

                        </Box>
                      </Collapse>
                    </Card>
                  );
                })}

                {/* Add New Part */}
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 2.5 }}>
                  <Button
                    size="small" variant="outlined" startIcon={<AddIcon />}
                    onClick={() => handleAddPart()}
                    sx={{
                      py: 0.75, px: 4, fontSize: 13, fontWeight: 600,
                      textTransform: 'none', borderColor: 'var(--text-muted)', color: '#6B7280',
                      borderRadius: '12px', borderStyle: 'dashed', borderWidth: 1.5,
                      '&:hover': { background: UI.bgSubtle, borderColor: '#1F7A63', color: '#1F7A63' },
                    }}
                  >
                    Add New Part
                  </Button>
                </Box>

                {/* Process Modules */}
                {(estimate?.items?.length ?? 0) > 0 && estimate?.items?.map((item) => (
                  <ProcessModuleCard
                    key={item.id} item={item}
                    expanded={expandedItems.has(item.id)}
                    onToggle={() => toggleExpand(item.id)}
                    onUpdate={(inputs) => handleUpdateItem(item, inputs)}
                    onDelete={() => handleDeleteItem(item.id)}
                    onCopy={() => handleCopyItem(item)}
                    readOnly={false}
                    isNew={item.id === newlyAddedModuleId}
                    moduleInputsRef={moduleInputsRef}
                  />
                ))}

                {/* Save / Cancel */}
                <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
                  <Button
                    variant="outlined" size="small"
                    onClick={() => setCreatingFirstEstimate(false)}
                    sx={{
                      borderColor: 'var(--text-muted)', color: '#6B7280', textTransform: 'none',
                      borderRadius: '10px', px: 3, py: 0.75, fontWeight: 600, fontSize: 13,
                      '&:hover': { borderColor: 'var(--text-muted)', background: UI.bgSubtle },
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained" size="small"
                    startIcon={<SaveIcon />}
                    onClick={handleSaveParts}
                    disabled={saving}
                    sx={{
                      background: '#1F7A63', textTransform: 'none', borderRadius: '10px',
                      px: 3, py: 0.75, fontWeight: 600, fontSize: 13,
                      boxShadow: '0 2px 4px rgba(31,122,99,0.2)',
                      '&:hover': { background: '#0D3D2F' },
                    }}
                  >
                    {saving ? 'Saving...' : 'Save Estimation'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* ===== REVISION LIST (all revisions as selectable rows) ===== */}
          {allRevisions.length > 0 && (
            <Box sx={{ mb: 2 }}>
              {allRevisions.map((rev) => {
                const isSelected = rev.revision === activeRevision;
                const revParts = Array.isArray(rev.custom_parts) ? rev.custom_parts : [];
                return (
                  <Card key={rev.revision} sx={{
                    mb: 1.5, borderRadius: '16px',
                    boxShadow: isSelected ? '0 2px 12px rgba(31,122,99,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                    border: isSelected ? '2px solid #1F7A63' : '1px solid var(--border)',
                    overflow: 'hidden', backgroundColor: isSelected ? '#FAFFFD' : '#FFFFFF',
                    transition: 'all 0.2s ease',
                    '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
                  }}>
                    <Box sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      px: 2.5, py: 1.5,
                      background: isSelected ? 'linear-gradient(135deg, #E8F7F2 0%, #E8F7F2 100%)' : 'linear-gradient(135deg, #FAFBFC 0%, #FAFBFC 100%)',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleSwitchRevision(rev.revision)}
                    >
                      <Radio
                        checked={isSelected}
                        onChange={() => handleSwitchRevision(rev.revision)}
                        size="small"
                        sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: '#1F7A63' }, p: 0.5 }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15, letterSpacing: -0.2 }}>
                          Estimation R{rev.revision}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: 'var(--text-muted)', mt: 0.25 }}>
                          {revParts.length} part{revParts.length !== 1 ? 's' : ''}
                          {rev.is_approved && ' _ Approved'}
                        </Typography>
                      </Box>
                      {rev.is_approved ? (
                        <Chip icon={<CheckIcon sx={{ fontSize: '13px !important' }} />} label="Approved" size="small"
                          sx={{ height: 24, fontSize: 11, fontWeight: 600, backgroundColor: '#E8F7F2', color: '#1F7A63', border: '1px solid #d6efe5', '& .MuiChip-icon': { color: '#16a34a' } }} />
                      ) : (
                        <Chip label="Draft" size="small"
                          sx={{ height: 24, fontSize: 11, fontWeight: 600, backgroundColor: '#FEF9C3', color: '#A16207', border: '1px solid #FDE68A' }} />
                      )}
                      {/* Primary action: Edit (only for selected revision) */}
                      {isSelected && !isEditMode && (
                        <Button size="small" variant="outlined" startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                          onClick={(e) => { e.stopPropagation(); setIsEditMode(true); }}
                          sx={{ py: 0.5, px: 1.5, fontSize: 12, fontWeight: 600, textTransform: 'none', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.40)', borderRadius: '10px', bgcolor: 'var(--bg-input)', '&:hover': { backgroundColor: 'rgba(0,200,255,0.10)', borderColor: '#00c8ff', color: '#00c8ff' }, transition: 'all 0.15s' }}>
                          Edit
                        </Button>
                      )}
                      {/* Add Module dropdown (only for selected revision) */}
                      {isSelected && (
                        <FormControl size="small" sx={{
                            minWidth: 140,
                            '& .MuiOutlinedInput-root': { backgroundColor: moduleError ? 'rgba(239,68,68,0.06)' : '#FFFFFF', borderRadius: '10px', '& fieldset': { borderColor: moduleError ? '#ef4444' : 'var(--text-muted)' }, '&:hover fieldset': { borderColor: moduleError ? '#EF4444' : '#1F7A63' } },
                            '& .MuiInputLabel-root': { color: moduleError ? '#ef4444' : '#6B7280', fontSize: 13 },
                          }}
                          onClick={(e) => e.stopPropagation()}
                          >
                            <InputLabel>{moduleError ? '\u26A0 Add Module!' : 'Add Module'}</InputLabel>
                            <Select label={moduleError ? '\u26A0 Add Module!' : 'Add Module'} value="" onChange={(e) => {
                              const val = e.target.value;
                              if (!isEditMode) setIsEditMode(true);
                              if (val === '_custom_module') { handleAddPart(false); }
                              else if (val === 'blank_module') { handleAddPart(true); }
                              else { handleAddItem(val as ProcessModuleType); }
                            }}>
                              <MenuItem value="_custom_module" sx={{ fontWeight: 600, color: '#1F7A63', borderBottom: '1px solid var(--border)' }}>Custom Module</MenuItem>
                              {Object.entries(moduleLabels).map(([key, label]) => (
                                <MenuItem key={key} value={key}>{label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                      )}
                      {/* 3-dot menu for secondary actions (Copy, Delete) */}
                      <IconButton size="small"
                        onClick={(e) => { e.stopPropagation(); setRevMenuAnchor(e.currentTarget); setRevMenuTarget(rev.revision); }}
                        sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-secondary)', background: 'var(--border-subtle)' } }}>
                        <MoreVertIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                      <IconButton size="small" sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-secondary)' } }}
                        onClick={(e) => { e.stopPropagation(); if (isSelected) setSectionCollapsed((v) => !v); else handleSwitchRevision(rev.revision); }}>
                        {isSelected && !sectionCollapsed ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>

                    {/* Accordion Content */}
                    <Collapse in={isSelected && !sectionCollapsed}>
                      {isSelected && estimate && (
                        <CardContent sx={{ p: { xs: 2.5, md: 3.5 }, borderTop: '1px solid var(--border)', backgroundColor: '#FFFFFF' }}>
                {customParts.map((part, index) => {
                  const partTotal = getPartTotal(part);
                  const isExpanded = expandedParts.has(part.id);
                  return (
                    <Card
                      key={part.id} data-part-id={part.id} variant="outlined"
                      sx={{
                        mb: 3,
                        border: showEstValidation && !isPartValid(part) ? '2px solid #ef4444' : '1px solid var(--border)',
                        borderRadius: '14px', overflow: 'hidden',
                        boxShadow: showEstValidation && !isPartValid(part)
                          ? '0 0 0 3px rgba(239,68,68,0.15)'
                          : isExpanded ? '0 2px 12px rgba(0,0,0,0.06)' : '0 1px 2px rgba(0,0,0,0.03)',
                        transition: 'all 0.2s ease',
                        '&:hover': { boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.08)' : '0 2px 8px rgba(0,0,0,0.06)' },
                      }}
                    >
                      {/* Part Header - Clean with 3-dot menu */}
                      <Box sx={{
                        display: 'flex', alignItems: 'center', px: 2.5, py: 1.5,
                        backgroundColor: isExpanded ? UI.bgSubtle : UI.bgSubtle,
                        borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                        transition: 'background-color 0.15s',
                      }}>
                        {/* Part number indicator */}
                        <Box sx={{
                          width: 28, height: 28, borderRadius: '8px', mr: 1.5,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isExpanded ? 'linear-gradient(135deg, #1F7A63, #166354)' : 'var(--border)',
                          color: isExpanded ? '#fff' : '#6B7280',
                          fontSize: 12, fontWeight: 700, flexShrink: 0,
                          transition: 'all 0.2s',
                        }}>
                          {padIndex(index + 1)}
                        </Box>
                        <Box sx={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => toggleExpandPart(part.id)}>
                          {/* Use standardized description format: Part Name | Material | Grade | Condition | Dimensions */}
                          {(() => {
                            const { description, drawingDisplay } = buildDescription(part as any);
                            return (
                              <>
                                <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                                  {description}
                                </Typography>
                                <Typography noWrap sx={{ fontSize: 11, color: 'var(--text-muted)', mt: 0.25 }}>
                                  {drawingDisplay || 'No drawing'}
                                </Typography>
                              </>
                            );
                          })()}
                        </Box>
                        <Typography sx={{
                          color: '#1F7A63', backgroundColor: '#E8F7F2', border: '1px solid #d6efe5',
                          px: 1.5, py: 0.25, borderRadius: '8px', mr: 1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                        }}>
                          $ {partTotal.toFixed(0)}
                        </Typography>
                        {/* Edit button (when collapsed) */}
                        {!isExpanded && !fieldReadOnly && (
                          <Tooltip title="Expand & Edit" arrow>
                            <IconButton size="small"
                              onClick={(e) => { e.stopPropagation(); toggleExpandPart(part.id); }}
                              sx={{ color: '#1F7A63', mr: 0.5, border: '1px solid #1F7A6340', borderRadius: '8px', '&:hover': { background: '#E8F7F2' } }}>
                              <EditIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* 3-dot menu for Copy/Delete */}
                        <IconButton size="small"
                          onClick={(e) => { e.stopPropagation(); setPartMenuAnchor(e.currentTarget); setPartMenuTarget(part.id); }}
                          sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-secondary)', background: 'var(--border-subtle)' }, mr: 0.25 }}>
                          <MoreVertIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => toggleExpandPart(part.id)}
                          sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-secondary)' } }}>
                          {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </Box>

                      {/* Part Form Body */}
                      <Collapse in={isExpanded}>
                        <Box sx={{ px: 3, py: 2.5, backgroundColor: '#FFFFFF' }}>
                          {/* SECTION: Work Information */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <Box sx={{ width: 3, height: 16, borderRadius: 1, background: 'linear-gradient(to bottom, #1F7A63, #10B981)' }} />
                            <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
                              Work Information
                            </Typography>
                          </Box>
                          <Grid container spacing={2} sx={{ mb: 2 }}>
                            <Grid item xs={12} sm={6} md={3}>
                              {part.is_blank_module ? (
                                <TextField
                                  fullWidth
                                  size="small"
                                  label="Job Description"
                                  required
                                  value={part.job_description || ''}
                                  onChange={(e) => handleUpdatePart(part.id, 'job_description', e.target.value)}
                                  disabled={fieldReadOnly}
                                  error={!!partFieldError(part, 'job_description')}
                                  helperText={partFieldHelperText(part, 'job_description')}
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                />
                              ) : (
                                <FormControl
                                  fullWidth
                                  size="small"
                                  error={!!partFieldError(part, 'job_description')}
                                  required
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                >
                                  <InputLabel>Job Description</InputLabel>
                                  <Select
                                    label="Job Description"
                                    value={part.parts_master_id || ''}
                                    onChange={(e) => handleSelectPartFromMaster(e.target.value as string, part.id)}
                                    disabled={fieldReadOnly}
                                    sx={{ borderRadius: '10px' }}
                                    renderValue={(selected) => {
                                      const fp = filteredParts.find((p) => p.id === selected);
                                      return fp ? fp.part_name : (part.job_description || '');
                                    }}
                                  >
                                    <MenuItem value=""><em>Select a Part</em></MenuItem>
                                    {filteredParts.length === 0 && (
                                      <MenuItem disabled><em>No parts available for selected client</em></MenuItem>
                                    )}
                                    {filteredParts.map((fp) => (
                                      <MenuItem key={fp.id} value={fp.id}>
                                        <Box>
                                          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{fp.part_name}</Typography>
                                          <Typography sx={{ fontSize: 11, color: '#64748B' }}>
                                            {fp.part_number || 'No Part #'} — {fp.material_category || ''} {fp.material_grade || ''}
                                          </Typography>
                                        </Box>
                                      </MenuItem>
                                    ))}
                                  </Select>
                                  {partFieldError(part, 'job_description') && (
                                    <Typography variant="caption" color="error" sx={{ mt: 0.3, ml: 1.5, fontSize: 11 }}>
                                      {partFieldHelperText(part, 'job_description')}
                                    </Typography>
                                  )}
                                </FormControl>
                              )}
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
                              {part.is_blank_module ? (
                                <TextField
                                  fullWidth
                                  size="small"
                                  label="Material"
                                  value={part.material || ''}
                                  onChange={(e) => handleUpdatePart(part.id, 'material', e.target.value)}
                                  disabled={fieldReadOnly}
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                />
                              ) : (
                                <FormControl
                                  fullWidth
                                  size="small"
                                  error={!!partFieldError(part, 'material')}
                                  required
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                >
                                  <InputLabel>Material</InputLabel>
                                  <Select
                                    label="Material" value={part.material}
                                    onChange={(e) => handleUpdatePart(part.id, 'material', e.target.value)}
                                    disabled={fieldReadOnly || !!part.parts_master_id}
                                    sx={{ borderRadius: '10px' }}
                                  >
                                    {MATERIAL_OPTIONS.map((m) => (
                                      <MenuItem key={m} value={m}>{m}</MenuItem>
                                    ))}
                                  </Select>
                                  {partFieldError(part, 'material') && (
                                    <Typography variant="caption" color="error" sx={{ mt: 0.3, ml: 1.5, fontSize: 11 }}>
                                      {partFieldHelperText(part, 'material')}
                                    </Typography>
                                  )}
                                </FormControl>
                              )}
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
                              <TextField
                                fullWidth
                                size="small" label="Drawing / Part No." required
                                value={part.drawing_part_no}
                                onChange={(e) => handleUpdatePart(part.id, 'drawing_part_no', e.target.value)}
                                disabled={fieldReadOnly || !!part.parts_master_id}
                                error={!!partFieldError(part, 'drawing_part_no')}
                                helperText={partFieldHelperText(part, 'drawing_part_no')}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Drawing Revision"
                                value={part.drawing_revision || ''}
                                onChange={(e) => handleUpdatePart(part.id, 'drawing_revision', e.target.value)}
                                disabled={fieldReadOnly || !!part.parts_master_id}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                placeholder="e.g. R0, Rev1, A"
                              />
                              {/* <FormControl fullWidth size="small">
                                <InputLabel>Revision</InputLabel>
                                <Select
                                  label="Drawing Revision"
                                  value={part.drawing_revision || ''}
                                  onChange={(e) => handleUpdatePart(part.id, 'drawing_revision', e.target.value as string)}
                                  disabled={fieldReadOnly || !!part.parts_master_id}
                                  sx={{ borderRadius: '10px' }}
                                >
                                  <MenuItem value=""><em>None</em></MenuItem>
                                  {['R0','R1','R2','R3','R4','R5','R6','R7','R8','R9'].map(r => (
                                    <MenuItem key={r} value={r}>{r}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl> */}
                            </Grid>
                          </Grid>

                          {/* SECTION: Material & Drawing Details */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <Box sx={{ width: 3, height: 16, borderRadius: 1, background: 'linear-gradient(to bottom, #0369A1, #38BDF8)' }} />
                            <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
                              Material &amp; Drawing Details
                            </Typography>
                          </Box>
                          <Grid container spacing={2} sx={{ mb: 2 }} alignItems="center">
                            {!part.is_blank_module && (
                            <Grid item xs={12} sm={6} md={3}>
                              <TextField
                                fullWidth size="small"
                                label="Raw Material ID"
                                value={part.raw_material_display_id || ''}
                                disabled
                                InputProps={{ readOnly: true }}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                              />
                            </Grid>
                            )}
                            {!part.is_blank_module && (
                            <Grid item xs={12} sm={6} md={3}>
                              {part.parts_master_id ? (
                                <TextField
                                  fullWidth size="small"
                                  label="Raw Material Specification"
                                  value={part.raw_material_dimension || ''}
                                  disabled
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                                />
                              ) : (
                              <FormControl fullWidth size="small">
                                <InputLabel>Raw Material Specification</InputLabel>
                                <Select
                                  label="Raw Material Specification"
                                  value={part.raw_material_supplied_by}
                                  onChange={(e) => {
                                    const val = e.target.value as string;
                                    handleUpdatePart(part.id, 'raw_material_supplied_by', val);
                                    const spec = vendorMaterials.find((m: any) => m.id === val);
                                    if (spec) {
                                      handleUpdatePart(part.id, 'material_grade', spec.material_grade || '');
                                      handleUpdatePart(part.id, 'raw_material_dimension', spec.dimension || '');
                                      handleUpdatePart(part.id, 'raw_material_spec_id', spec.id);
                                      if (spec.vendor) {
                                        handleUpdatePart(part.id, 'vendor_id', spec.vendor.id);
                                        handleUpdatePart(part.id, 'material_source', 'Vendor Supplied');
                                      }
                                    }
                                  }}
                                  disabled={fieldReadOnly}
                                  renderValue={(selected) => {
                                    const spec = vendorMaterials.find((m: any) => m.id === selected);
                                    if (!spec) return '';
                                    return `${spec.part_description} — ${spec.dimension || ''}`;
                                  }}
                                  sx={{ borderRadius: '10px', '& .MuiSelect-select': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                                >
                                  <MenuItem value=""><em>Select a raw material</em></MenuItem>
                                  {(() => {
                                    const grouped = new Map<string, any[]>();
                                    vendorMaterials.forEach((m: any) => {
                                      const vendorName = m.vendor?.vendor_name || 'Unknown';
                                      if (!grouped.has(vendorName)) grouped.set(vendorName, []);
                                      grouped.get(vendorName)!.push(m);
                                    });
                                    const items: React.ReactNode[] = [];
                                    grouped.forEach((mats, vendorName) => {
                                      if (grouped.size > 1) {
                                        items.push(<ListSubheader key={`hdr-${vendorName}`} sx={{ fontSize: 11, fontWeight: 700, color: '#1F7A63', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #E2E8F0', mt: 0.5, pb: 0.5 }}>{vendorName}</ListSubheader>);
                                      }
                                      mats.forEach((m: any) => {
                                        items.push(
                                          <MenuItem key={m.id} value={m.id}>
                                            <Box>
                                              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{m.part_description}</Typography>
                                              <Typography sx={{ fontSize: 11, color: '#64748B' }}>{m.material_grade} — {m.dimension}</Typography>
                                            </Box>
                                          </MenuItem>
                                        );
                                      });
                                    });
                                    return items;
                                  })()}
                                </Select>
                              </FormControl>
                              )}
                            </Grid>
                            )}
                            <Grid item xs={12} sm={6} md={3}>
                              <FormControl fullWidth size="small">
                                <InputLabel>Material Source</InputLabel>
                                <Select
                                  label="Material Source"
                                  value={part.material_source || 'Client Supplied'}
                                  onChange={(e) => handleUpdatePart(part.id, 'material_source', e.target.value)}
                                  disabled={fieldReadOnly}
                                  sx={{ borderRadius: '10px' }}
                                >
                                  <MenuItem value="Client Supplied">Client Supplied</MenuItem>
                                  <MenuItem value="In-House Stock">In-House Stock</MenuItem>
                                  <MenuItem value="Vendor Supplied">Vendor Supplied</MenuItem>
                                </Select>
                              </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <DrawingUploadField
                                partId={part.id}
                                fileName={part.drawing_file_name || ''}
                                readOnly={fieldReadOnly}
                                onChange={(name) => handleUpdatePart(part.id, 'drawing_file_name', name)}
                                projectId={project.id}
                                projectNumber={project.project_number}
                              />
                            </Grid>
                          </Grid>

                          {/* SECTION: Pricing */}
                          <Box sx={{
                            border: '1px solid var(--border)', borderRadius: '14px',
                            overflow: 'hidden', backgroundColor: '#FFFFFF',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          }}>
                            <Box sx={{
                              display: 'flex', alignItems: 'center', gap: 1.5,
                              px: 2.5, height: 52,
                              background: 'linear-gradient(135deg, #FAFBFC, #F1F5F9)',
                              borderBottom: '1px solid var(--border)',
                            }}>
                              <Box sx={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', background: 'var(--border)', borderRadius: '50%', p: 0.7 }}>
                                <PaymentsIcon sx={{ fontSize: 17 }} />
                              </Box>
                              <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1F2937', letterSpacing: 0.2, flex: 1 }}>
                                Pricing
                              </Typography>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={!!part.bulk_order_variable_price}
                                    onChange={(e) => {
                                      handleUpdatePart(part.id, 'bulk_order_variable_price', e.target.checked);
                                      if (e.target.checked && (!part.pricing_tiers || part.pricing_tiers.length === 0)) {
                                        handleUpdatePart(part.id, 'pricing_tiers', [{ quantity: '', unit_price: '' }]);
                                      }
                                    }}
                                    disabled={fieldReadOnly}
                                    size="small"
                                    sx={{
                                      '& .MuiSwitch-switchBase.Mui-checked': { color: '#1F7A63' },
                                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#1F7A63' },
                                    }}
                                  />
                                }
                                label={
                                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', color: part.bulk_order_variable_price ? '#1F7A63' : '#94a3b8', transition: 'color 0.2s' }}>
                                    Bulk Order Variable Price
                                  </Typography>
                                }
                                labelPlacement="start"
                                sx={{ m: 0, gap: 0.5 }}
                              />
                            </Box>

                            <Box sx={{ p: 0 }}>
                              {!part.bulk_order_variable_price ? (
                                <Box>
                                  {/* Column headers */}
                                  <Box sx={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                                    gap: 0, px: 2.5, py: 1,
                                    background: 'linear-gradient(135deg, #F1F5F9, #E8F5F0)',
                                    borderBottom: '1.5px solid #E5E7EB',
                                  }}>
                                    <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>Quantity</Typography>
                                    <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>USD / Unit</Typography>
                                    <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>Total $</Typography>
                                  </Box>
                                  {/* Values row */}
                                  <Box sx={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                                    gap: 1.5, px: 2.5, py: 2, alignItems: 'center',
                                  }}>
                                    <TextField
                                      fullWidth size="small" type="number" required placeholder="Qty"
                                      value={part.quantity}
                                      onChange={(e) => handleUpdatePart(part.id, 'quantity', e.target.value)}
                                      disabled={fieldReadOnly}
                                      error={!!partFieldError(part, 'quantity')}
                                      helperText={partFieldHelperText(part, 'quantity')}
                                      sx={{
                                        '& .MuiOutlinedInput-root': { borderRadius: '10px', backgroundColor: 'var(--bg-input)' },
                                        '& input': { textAlign: 'center', fontSize: 13, py: '8px' },
                                      }}
                                      inputProps={{ min: 1 }}
                                    />
                                    <TextField
                                      fullWidth size="small" type="number" required placeholder="Price"
                                      value={part.job_cost_per_unit}
                                      onChange={(e) => handleUpdatePart(part.id, 'job_cost_per_unit', e.target.value)}
                                      disabled={fieldReadOnly}
                                      error={!!partFieldError(part, 'job_cost_per_unit')}
                                      helperText={partFieldHelperText(part, 'job_cost_per_unit')}
                                      InputProps={{ startAdornment: <InputAdornment position="start" sx={{ '& p': { fontSize: 12, color: '#6B7280' } }}>$</InputAdornment> }}
                                      sx={{
                                        '& .MuiOutlinedInput-root': { borderRadius: '10px', backgroundColor: 'var(--bg-input)' },
                                        '& input': { textAlign: 'right', fontSize: 13, py: '8px' },
                                      }}
                                    />
                                    <Box sx={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      px: 1, py: '8px', borderRadius: '10px',
                                      backgroundColor: partTotal > 0 ? '#E8F7F2' : UI.bgSubtle,
                                      border: '1px solid', borderColor: partTotal > 0 ? '#A7F3D0' : 'var(--border)',
                                      minHeight: 38,
                                    }}>
                                      <Typography sx={{ fontWeight: 600, color: partTotal > 0 ? '#065F46' : '#94a3b8', fontSize: 14 }}>
                                        $ {Math.round(partTotal).toLocaleString()}
                                      </Typography>
                                    </Box>
                                  </Box>
                                </Box>
                              ) : (
                                <Box>
                                  <Box sx={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fafafa' }}>
                                    {/* Table header */}
                                    <Box sx={{
                                      display: 'grid',
                                      gridTemplateColumns: !fieldReadOnly ? '1fr 1fr 1fr 36px' : '1fr 1fr 1fr',
                                      gap: 0, px: 2.5, py: 1.25,
                                      background: 'linear-gradient(135deg, #F1F5F9, #E8F5F0)',
                                      borderBottom: '1.5px solid #E5E7EB',
                                    }}>
                                      <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>Quantity</Typography>
                                      <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>USD / Unit</Typography>
                                      <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>Total $</Typography>
                                      {!fieldReadOnly && <Box />}
                                    </Box>
                                    {(part.pricing_tiers || []).map((tier, tIdx) => {
                                      const tierTotal = (parseFloat(String(tier.quantity)) || 0) * (parseFloat(String(tier.unit_price)) || 0);
                                      const qtyVal = String(tier.quantity ?? '').trim();
                                      const isDuplicateQty = qtyVal !== '' && (part.pricing_tiers || []).some(
                                        (t, i) => i !== tIdx && String(t.quantity ?? '').trim() === qtyVal
                                      );
                                      return (
                                        <Box
                                          key={tIdx}
                                          sx={{
                                            display: 'grid',
                                            gridTemplateColumns: !fieldReadOnly ? '1fr 1fr 1fr 36px' : '1fr 1fr 1fr',
                                            gap: 1.5, px: 2.5, py: 1.5, alignItems: 'center',
                                            borderBottom: tIdx < (part.pricing_tiers?.length || 0) - 1 ? '1px solid var(--border)' : 'none',
                                            backgroundColor: tIdx % 2 === 0 ? '#ffffff' : '#f8fafb',
                                            '&:hover': { backgroundColor: '#f0fdf9' },
                                            transition: 'background-color 0.15s',
                                          }}
                                        >
                                          <TextField
                                            size="small" type="number" placeholder="Qty"
                                            value={tier.quantity}
                                            onChange={(e) => {
                                              const tiers = [...(part.pricing_tiers || [])];
                                              tiers[tIdx] = { ...tiers[tIdx], quantity: e.target.value };
                                              handleUpdatePart(part.id, 'pricing_tiers', tiers);
                                            }}
                                            disabled={fieldReadOnly}
                                            error={isDuplicateQty}
                                            helperText={isDuplicateQty ? 'Duplicate qty' : ''}
                                            sx={{
                                              '& .MuiOutlinedInput-root': { borderRadius: '10px', backgroundColor: 'var(--bg-input)' },
                                              '& input': { textAlign: 'center', fontSize: 13, py: '8px' },
                                              '& .MuiFormHelperText-root': { fontSize: 9, mx: 0, mt: 0.3 },
                                            }}
                                            inputProps={{ min: 1 }}
                                          />
                                          <TextField
                                            size="small" type="number" placeholder="Price"
                                            value={tier.unit_price}
                                            onChange={(e) => {
                                              const tiers = [...(part.pricing_tiers || [])];
                                              tiers[tIdx] = { ...tiers[tIdx], unit_price: e.target.value };
                                              handleUpdatePart(part.id, 'pricing_tiers', tiers);
                                            }}
                                            disabled={fieldReadOnly}
                                            InputProps={{ startAdornment: <InputAdornment position="start" sx={{ '& p': { fontSize: 12, color: '#6B7280' } }}>$</InputAdornment> }}
                                            sx={{
                                              '& .MuiOutlinedInput-root': { borderRadius: '10px', backgroundColor: 'var(--bg-input)' },
                                              '& input': { textAlign: 'right', fontSize: 13, py: '8px' },
                                            }}
                                          />
                                          <Box sx={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            px: 1, py: '8px', borderRadius: '10px',
                                            backgroundColor: tierTotal > 0 ? '#E8F7F2' : UI.bgSubtle,
                                            border: '1px solid', borderColor: tierTotal > 0 ? '#A7F3D0' : 'var(--border)',
                                            minHeight: 38,
                                          }}>
                                            <Typography sx={{ fontWeight: 600, color: tierTotal > 0 ? '#065F46' : '#94a3b8', fontSize: 13 }}>
                                              $ {tierTotal.toLocaleString()}
                                            </Typography>
                                          </Box>
                                          {!fieldReadOnly && (
                                            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                              <IconButton
                                                size="small"
                                                onClick={() => {
                                                  const tiers = [...(part.pricing_tiers || [])];
                                                  tiers.splice(tIdx, 1);
                                                  handleUpdatePart(part.id, 'pricing_tiers', tiers.length > 0 ? tiers : [{ quantity: '', unit_price: '' }]);
                                                }}
                                                sx={{ color: '#ef4444', p: 0.5, '&:hover': { background: '#fef2f2', color: '#EF4444' } }}
                                              >
                                                <DeleteIcon sx={{ fontSize: 16 }} />
                                              </IconButton>
                                            </Box>
                                          )}
                                        </Box>
                                      );
                                    })}
                                    {!fieldReadOnly && (
                                      <Box sx={{ px: 2.5, py: 1.25, borderTop: '1px solid var(--border)', backgroundColor: '#fafffe' }}>
                                        <Button
                                          size="small"
                                          startIcon={<AddIcon sx={{ fontSize: 15 }} />}
                                          onClick={() => {
                                            const tiers = [...(part.pricing_tiers || []), { quantity: '', unit_price: '' }];
                                            handleUpdatePart(part.id, 'pricing_tiers', tiers);
                                          }}
                                          sx={{ fontSize: 11.5, fontWeight: 600, textTransform: 'none', color: '#1F7A63', py: 0.5, px: 1.5, borderRadius: '8px', '&:hover': { background: '#E8F7F2' } }}
                                        >
                                          Add Price Tier ({(part.pricing_tiers || []).length})
                                        </Button>
                                      </Box>
                                    )}
                                  </Box>
                                </Box>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Collapse>
                    </Card>
                  );
                })}

                {/* Add New Part */}
                {!fieldReadOnly && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', my: 2.5 }}>
                    <Button
                      size="small" variant="outlined" startIcon={<AddIcon />}
                      onClick={() => handleAddPart()}
                      sx={{
                        py: 0.75, px: 4, fontSize: 13, fontWeight: 600,
                        textTransform: 'none', borderColor: 'var(--text-muted)', color: '#6B7280',
                        borderRadius: '12px', borderStyle: 'dashed', borderWidth: 1.5,
                        '&:hover': { background: UI.bgSubtle, borderColor: '#1F7A63', color: '#1F7A63' },
                        transition: 'all 0.2s',
                      }}
                    >
                      Add New Part
                    </Button>
                  </Box>
                )}

                {/* Process Modules */}
                {(estimate?.items?.length ?? 0) > 0 && (
                  <>
                    {estimate?.items?.map((item) => (
                      <ProcessModuleCard
                        key={item.id} item={item}
                        expanded={expandedItems.has(item.id)}
                        onToggle={() => toggleExpand(item.id)}
                        onUpdate={(inputs) => handleUpdateItem(item, inputs)}
                        onDelete={() => handleDeleteItem(item.id)}
                        onCopy={() => handleCopyItem(item)}
                        readOnly={!isEditMode}
                        isNew={item.id === newlyAddedModuleId}
                        moduleInputsRef={moduleInputsRef}
                      />
                    ))}
                  </>
                )}

                {/* Save / Cancel */}
                {isEditMode && (
                  <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
                    <Button
                      variant="outlined" size="small"
                      onClick={() => setIsEditMode(false)}
                      sx={{
                        borderColor: 'var(--text-muted)', color: '#6B7280', textTransform: 'none',
                        borderRadius: '10px', px: 3, py: 0.75, fontWeight: 600, fontSize: 13,
                        '&:hover': { borderColor: 'var(--text-muted)', background: UI.bgSubtle },
                        transition: 'all 0.15s',
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained" size="small"
                      startIcon={<SaveIcon />}
                      onClick={handleSaveParts}
                      disabled={saving}
                      sx={{
                        background: '#1F7A63', textTransform: 'none', borderRadius: '10px',
                        px: 3, py: 0.75, fontWeight: 600, fontSize: 13,
                        boxShadow: '0 2px 4px rgba(31,122,99,0.2)',
                        '&:hover': { background: '#0D3D2F', boxShadow: '0 4px 12px rgba(31,122,99,0.3)', transform: 'translateY(-1px)' },
                        transition: 'all 0.2s',
                      }}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </Box>
                )}
                        </CardContent>
                      )}
                    </Collapse>
                  </Card>
                );
              })}
            </Box>
          )}
        </Grid>

        {/* ===== COST SUMMARY SIDEBAR ===== */}
        {(estimate || creatingFirstEstimate) && (
        <Grid item xs={12} md={3}>
          <Card sx={{
            borderRadius: '16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
            border: '1px solid var(--border)', overflow: 'hidden',
            position: 'sticky', top: 16,
            backgroundColor: '#FFFFFF',
          }}>
            <Box sx={{ px: 3, py: 2, background: 'linear-gradient(135deg, #FAFBFC, #F1F5F9)', borderBottom: '1px solid var(--border)' }}>
              <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 16, letterSpacing: -0.2 }}>
                Cost Summary
              </Typography>
            </Box>
            <CardContent sx={{ p: 2.5 }}>
              {/* Cost line items */}
              <Box sx={{ mb: 2 }}>
                {/* Parts Cost */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10B981', flexShrink: 0 }} />
                    <Box>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Parts Cost</Typography>
                      <Typography sx={{ fontSize: 10, color: 'var(--text-muted)' }}>{customParts.length} part{customParts.length !== 1 ? 's' : ''}</Typography>
                    </Box>
                  </Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1F2937', whiteSpace: 'nowrap', ml: 1, fontFamily: '"JetBrains Mono", monospace' }}>$ {Math.round(partsTotal).toLocaleString()}</Typography>
                </Box>
                {/* Individual parts breakdown */}
                {customParts.length > 0 && (
                  <Box sx={{ pl: 3.5, mb: 0.5 }}>
                    {customParts.map((p, i) => (
                      <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                        <Typography sx={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                          {p.job_description || `Part ${i + 1}`}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: '"JetBrains Mono", monospace' }}>
                          $ {Math.round(getPartTotal(p)).toLocaleString()}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
                <Divider sx={{ my: 0.75 }} />
                {/* Process Cost */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#3B82F6', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Process Cost</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1F2937', whiteSpace: 'nowrap', ml: 1, fontFamily: '"JetBrains Mono", monospace' }}>$ {Math.round(processCost).toLocaleString()}</Typography>
                </Box>
                <Divider sx={{ my: 0.75 }} />
                {/* Overhead */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#F59E0B', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Overhead</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1F2937', whiteSpace: 'nowrap', ml: 1, fontFamily: '"JetBrains Mono", monospace' }}>$ {Math.round(overhead).toLocaleString()}</Typography>
                </Box>
              </Box>

              {/* Editable overhead field */}
              <Box sx={{ py: 1.5, borderTop: '1px solid var(--border-subtle)' }}>
                <TextField
                  fullWidth size="small" label="Overhead" type="number"
                  value={overheadCost}
                  onChange={(e) => { setOverheadCost(e.target.value); setHasUnsavedChanges(true); }}
                  onBlur={(e) => setOverheadCost(parseFloat(e.target.value) || 0)}
                  disabled={fieldReadOnly}
                  InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }}
                />
              </Box>

              {/* Total Cost */}
              <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                py: 1.5, px: 2, backgroundColor: UI.bgSubtle, borderRadius: '10px',
                border: '1px solid var(--border)', mb: 1.5, mt: 1,
              }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Total Cost</Typography>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#1F2937', whiteSpace: 'nowrap' }}>$ {Math.round(totalCost).toLocaleString()}</Typography>
              </Box>
              {/* Margin */}
              <Box sx={{ py: 1.5 }}>
                <TextField
                  fullWidth size="small" label="Margin" type="number"
                  value={marginPercent}
                  onChange={(e) => { setMarginPercent(e.target.value); setHasUnsavedChanges(true); }}
                  onBlur={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                  disabled={fieldReadOnly}
                  InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                />
              </Box>

              {/* FINAL PRICE - dominant element */}
              <Box sx={{
                mt: 2, p: 3, borderRadius: '16px',
                background: 'linear-gradient(135deg, #1F7A63 0%, #166354 50%, #0D3D2F 100%)',
                textAlign: 'center', cursor: 'default', userSelect: 'none',
                boxShadow: '0 8px 24px rgba(31,122,99,0.3)',
                position: 'relative', overflow: 'hidden',
              }}>
                <Box sx={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
                <Box sx={{ position: 'absolute', bottom: -15, left: -15, width: 60, height: 60, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.03)' }} />
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 10, fontWeight: 700, mb: 0.5 }}>
                  Final Price
                </Typography>
                <Typography sx={{
                  color: '#FFFFFF', fontWeight: 900,
                  fontSize: finalPrice >= 10000000 ? 22 : finalPrice >= 1000000 ? 28 : 36,
                  letterSpacing: -1, lineHeight: 1.1,
                  wordBreak: 'break-word', overflowWrap: 'break-word',
                }}>
                  $ {Math.round(finalPrice).toLocaleString()}
                </Typography>
                {margin > 0 && (
                  <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, mt: 0.5 }}>
                    incl. {margin}% margin ($ {Math.round(totalCost * margin / 100).toLocaleString()})
                  </Typography>
                )}
              </Box>

              {/* Unsaved changes */}
              {hasUnsavedChanges && isEditMode && (
                <Box sx={{ mt: 2.5, px: 2, py: 1.5, backgroundColor: '#FFFBEB', borderRadius: '12px', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#92400E' }}>Unsaved changes</Typography>
                  <Button
                    size="small" variant="contained"
                    startIcon={<SaveIcon sx={{ fontSize: 13 }} />}
                    onClick={handleSaveParts} disabled={saving}
                    sx={{ background: '#D97706', textTransform: 'none', borderRadius: '8px', px: 1.5, py: 0.3, fontSize: 11, fontWeight: 600, minWidth: 'auto', boxShadow: 'none', '&:hover': { background: '#B45309' } }}
                  >
                    Save
                  </Button>
                </Box>
              )}

              {/* Approve button - PRIMARY CTA */}
              {!estimate?.is_approved && !isEditMode && !hasUnsavedChanges && estimate && (
                <Box sx={{ mt: 2.5 }}>
                  <Button
                    fullWidth variant="contained"
                    startIcon={<ApproveIcon />}
                    onClick={handleApprove} disabled={saving}
                    sx={{
                      background: 'linear-gradient(135deg, #16A34A, #1F7A63)',
                      borderRadius: '12px', py: 1.25,
                      textTransform: 'none', fontWeight: 700, fontSize: 14, letterSpacing: 0.2,
                      boxShadow: '0 4px 16px rgba(22,163,74,0.35)',
                      '&:hover': { boxShadow: '0 6px 24px rgba(22,163,74,0.45)', transform: 'translateY(-1px)', background: 'linear-gradient(135deg, #1F7A63, #1F7A63)' },
                      transition: 'all 0.2s',
                    }}
                  >
                    {saving ? 'Approving...' : 'Approve Estimate'}
                  </Button>
                </Box>
              )}

              {estimate?.is_approved && !isEditMode && (
                <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 1, borderRadius: '10px', backgroundColor: '#E8F7F2', border: '1px solid #d6efe5' }}>
                  <ApproveIcon sx={{ color: '#16a34a', fontSize: 16 }} />
                  <Typography sx={{ color: '#1F7A63', fontWeight: 600, fontSize: 12 }}>Estimate Approved</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        )}
      </Grid>

      {/* ===== BOTTOM ACTION BAR ===== */}
      <EnhancedNavFooter onBack={onBack} onNext={onProceedToQuotation} backLabel="Back to Project Info" nextLabel="Proceed to Quotation" />

      {/* --- 3-DOT CONTEXT MENUS --- */}
      {/* Revision 3-dot menu */}
      <Menu
        anchorEl={revMenuAnchor}
        open={Boolean(revMenuAnchor)}
        onClose={() => { setRevMenuAnchor(null); setRevMenuTarget(null); }}
        PaperProps={{
          sx: {
            borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            border: '1px solid var(--border)', minWidth: 180,
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={() => {
          const rev = revMenuTarget;
          setRevMenuAnchor(null); setRevMenuTarget(null);
          if (rev !== null) { if (rev !== activeRevision) handleSwitchRevision(rev); setTimeout(() => handleCopyRevision(), rev !== activeRevision ? 300 : 0); }
        }} disabled={copyingRevision} sx={{ fontSize: 13, py: 1 }}>
          <ListItemIcon><CopyIcon sx={{ fontSize: 16, color: '#6B7280' }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>Copy Revision</ListItemText>
        </MenuItem>
        {revMenuTarget !== null && (
          <MenuItem onClick={() => {
            const rev = revMenuTarget;
            setRevMenuAnchor(null); setRevMenuTarget(null);
            if (rev !== null) { if (rev !== activeRevision) handleSwitchRevision(rev); setTimeout(() => setDeleteConfirmOpen(true), rev !== activeRevision ? 300 : 0); }
          }} disabled={deletingRevision} sx={{ fontSize: 13, py: 1, color: '#EF4444' }}>
            <ListItemIcon><DeleteIcon sx={{ fontSize: 16, color: '#EF4444' }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>Delete Revision</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Part 3-dot menu */}
      <Menu
        anchorEl={partMenuAnchor}
        open={Boolean(partMenuAnchor)}
        onClose={() => { setPartMenuAnchor(null); setPartMenuTarget(null); }}
        PaperProps={{
          sx: {
            borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            border: '1px solid var(--border)', minWidth: 170,
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={() => {
          const pId = partMenuTarget;
          setPartMenuAnchor(null); setPartMenuTarget(null);
          if (pId) { const p = customParts.find(pp => pp.id === pId); if (p) handleCopyPart(p); }
        }} sx={{ fontSize: 13, py: 1 }}>
          <ListItemIcon><CopyIcon sx={{ fontSize: 16, color: '#6B7280' }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>Duplicate Part</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          const pId = partMenuTarget;
          setPartMenuAnchor(null); setPartMenuTarget(null);
          if (pId) handleDeletePart(pId);
        }} sx={{ fontSize: 13, py: 1, color: '#EF4444' }}>
          <ListItemIcon><DeleteIcon sx={{ fontSize: 16, color: '#EF4444' }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>Delete Part</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete Revision Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle sx={{ fontWeight: 600, color: '#EF4444' }}>
          Delete Revision R{activeRevision}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete Revision R{activeRevision} and all its items. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ textTransform: 'none', fontWeight: 600, color: '#6B7280' }}>
            Cancel
          </Button>
          <Button onClick={handleDeleteRevision} variant="contained" disabled={deletingRevision}
            sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#EF4444', '&:hover': { bgcolor: '#b91c1c' } }}>
            {deletingRevision ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </TabContainer>
  );
};



// --- Drawing Upload Field -----------------------------------------------------

interface DrawingUploadFieldProps {
  partId: string;
  fileName: string;
  readOnly: boolean;
  onChange: (name: string) => void;
  projectId?: string;
  projectNumber?: string;
}

const DrawingUploadField: React.FC<DrawingUploadFieldProps> = ({ partId, fileName, readOnly, onChange, projectId, projectNumber }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Parse stored entries (format: "filename|docId" comma-separated, or legacy "filename" only)
  const parseEntries = (raw: string) => {
    return raw.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
      const parts = entry.split('|');
      return { name: parts[0], docId: parts[1] || null };
    });
  };
  const entries = parseEntries(fileName || '');

  const handleFiles = async (files: FileList) => {
    if (readOnly || !files.length) return;
    setUploading(true);
    const newEntries: { name: string; docId: string | null }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (projectId) {
        try {
          const renamedFile = buildProjectFileName(projectNumber, file, 'estimation');
          const formData = new FormData();
          formData.append('file', renamedFile);
          formData.append('type', 'drawing');
          formData.append('description', `Drawing: ${renamedFile.name}`);
          const res = await api.post(`/documents/project/${projectId}/upload`, formData);
          const doc = res.data?.data;
          newEntries.push({ name: renamedFile.name, docId: doc?.id || null });
        } catch (err) {
          console.error('Failed to upload drawing file:', err);
          newEntries.push({ name: file.name, docId: null });
        }
      } else {
        newEntries.push({ name: file.name, docId: null });
      }
    }

    // Merge with existing entries
    const all = [...entries, ...newEntries];
    const serialized = all.map(e => e.docId ? `${e.name}|${e.docId}` : e.name).join(', ');
    onChange(serialized);
    setUploading(false);
  };

  const handleDelete = async (idx: number) => {
    const entry = entries[idx];
    if (entry.docId) {
      try { await api.delete(`/documents/${entry.docId}`); } catch { /* ignore */ }
    }
    const updated = entries.filter((_, i) => i !== idx);
    onChange(updated.map(e => e.docId ? `${e.name}|${e.docId}` : e.name).join(', '));
  };

  const handleView = async (entry: { name: string; docId: string | null }) => {
    if (entry.docId) {
      try {
        await viewDocument(entry.docId);
      } catch (err) {
        console.error('Error viewing document:', err);
      }
    }
  };

  const hasFiles = entries.length > 0;
  const displayName = hasFiles
    ? entries.length === 1
      ? entries[0].name.length > 20 ? entries[0].name.slice(0, 17) + '...' : entries[0].name
      : `${entries.length} files`
    : '';

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        id={`drawing-upload-${partId}`}
        aria-label="Upload Drawing"
        title="Upload Drawing"
        accept=".pdf,.dwg,.dxf,.jpg,.png,.step,.stp"
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
      />
      
      {/* Main field - styled like a Select/TextField */}
      <FormControl fullWidth size="small">
        <InputLabel shrink sx={{ backgroundColor: 'var(--bg-canvas)', px: 0.5, color: 'var(--text-muted)' }}>Upload Drawing</InputLabel>
        <Box
          sx={{
            border: '1px solid',
            borderColor: expanded ? '#00c8ff' : 'var(--border)',
            borderRadius: '10px',
            minHeight: 40,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg-input)',
            transition: 'border-color 0.2s',
            '&:hover': { borderColor: readOnly ? 'var(--border)' : '#00c8ff' },
          }}
        >
          {/* Collapsed row - single line like a select field */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 1.25,
              py: 0.75,
              minHeight: 40,
              cursor: hasFiles && entries[0]?.docId ? 'pointer' : 'default',
              '&:hover': hasFiles && entries[0]?.docId ? { backgroundColor: 'var(--bg-surface-2)' } : {},
              transition: 'background-color 0.15s',
            }}
            onClick={(e) => { 
              // If single file with docId, open it directly
              if (entries.length === 1 && entries[0].docId) {
                e.stopPropagation();
                handleView(entries[0]);
              } else if (entries.length > 1) {
                setExpanded(!expanded);
              }
            }}
          >
            {uploading ? (
              <CircularProgress size={16} sx={{ color: '#1F7A63' }} />
            ) : hasFiles ? (
              <>
                <AttachFileIcon sx={{ fontSize: 16, color: '#1F7A63', mr: 0.75, flexShrink: 0 }} />
                <Typography
                  component="span"
                  sx={{
                    fontSize: 13,
                    color: entries[0]?.docId ? '#1F7A63' : '#334155',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                    textDecoration: 'none',
                    cursor: entries[0]?.docId ? 'pointer' : 'default',
                    '&:hover': entries[0]?.docId ? { textDecoration: 'underline' } : {},
                  }}
                >
                  {displayName}
                </Typography>
              </>
            ) : (
              <Typography
                onClick={(e) => { e.stopPropagation(); if (!readOnly) inputRef.current?.click(); }}
                sx={{
                  fontSize: 13,
                  color: '#9CA3AF',
                  flex: 1,
                  cursor: readOnly ? 'default' : 'pointer',
                }}
              >
                Click to upload
              </Typography>
            )}
            
            {/* Right side icons */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 'auto' }}>
              {/* View icon for single file */}
              {hasFiles && entries.length === 1 && entries[0].docId && (
                <Tooltip title="View file">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); handleView(entries[0]); }}
                    sx={{ p: 0.25, color: '#64748B', '&:hover': { color: '#1F7A63' } }}
                  >
                    <VisibilityIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              {/* Expand/collapse for multiple files */}
              {hasFiles && entries.length > 1 && (
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                  sx={{ p: 0.25, color: '#64748B' }}
                >
                  {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              )}
              {/* Delete for single file */}
              {hasFiles && entries.length === 1 && !readOnly && (
                <Tooltip title="Remove file">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); handleDelete(0); }}
                    sx={{ p: 0.25, color: 'var(--text-muted)', '&:hover': { color: '#EF4444' } }}
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              {/* Upload more */}
              {!readOnly && (
                <Tooltip title="Upload file">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                    sx={{ p: 0.25, color: '#64748B', '&:hover': { color: '#1F7A63' } }}
                  >
                    <AttachFileIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>

          {/* Expanded file list */}
          {expanded && hasFiles && (
            <Box
              sx={{
                borderTop: '1px solid var(--border)',
                maxHeight: 120,
                overflowY: 'auto',
                '&::-webkit-scrollbar': { width: 3 },
                '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--text-muted)', borderRadius: 2 },
              }}
            >
              {entries.map((entry, idx) => {
                return (
                  <Box
                    key={`${entry.name}-${idx}`}
                    onClick={() => entry.docId && handleView(entry)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1.25,
                      py: 0.5,
                      borderBottom: idx < entries.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      '&:hover': { backgroundColor: 'var(--bg-surface-2)' },
                      cursor: entry.docId ? 'pointer' : 'default',
                    }}
                  >
                    <AttachFileIcon sx={{ fontSize: 14, color: '#1F7A63', flexShrink: 0 }} />
                    <Typography
                      component="span"
                      sx={{
                        fontSize: 12,
                        color: entry.docId ? '#1F7A63' : '#334155',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 500,
                        textDecoration: 'none',
                        '&:hover': entry.docId ? { textDecoration: 'underline' } : {},
                      }}
                    >
                      {entry.name.length > 28 ? entry.name.slice(0, 25) + '...' : entry.name}
                    </Typography>
                    {!readOnly && (
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleDelete(idx); }}
                        sx={{ p: 0.2, color: 'var(--text-muted)', '&:hover': { color: '#EF4444' } }}
                      >
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </FormControl>
    </Box>
  );
};

// Process Module Card Component
interface ProcessModuleCardProps {
  item: EstimateItem;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (inputs: Record<string, any>) => Promise<void> | void;
  onDelete: () => void;
  onCopy: () => void;
  readOnly: boolean;
  isNew?: boolean;
  /** Ref map for the parent to read latest live inputs from all module cards */
  moduleInputsRef?: React.MutableRefObject<Map<string, Record<string, any>>>;
}

const ProcessModuleCard: React.FC<ProcessModuleCardProps> = ({
  item,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  onCopy,
  readOnly,
  isNew,
  moduleInputsRef,
}) => {
  const hasExistingData = Object.keys(item.input_json || {}).length > 0;
  const [isEditing, setIsEditing] = useState(!hasExistingData || !!isNew);
  const [inputs, setInputs] = useState<Record<string, any>>(item.input_json || {});
  const [saving, setSaving] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // Sync inputs from prop when parent re-fetches estimate data after an external save
  const prevItemJsonRef = useRef<string>(JSON.stringify(item.input_json || {}));
  useEffect(() => {
    const incoming = JSON.stringify(item.input_json || {});
    if (incoming !== prevItemJsonRef.current) {
      prevItemJsonRef.current = incoming;
      // Only sync if the card is NOT currently being edited (avoid overwriting user edits)
      if (!isEditing) {
        setInputs(item.input_json || {});
      }
    }
  }, [item.input_json, isEditing]);

  // Register live inputs into parent ref so handleSaveParts can access them
  useEffect(() => {
    if (!moduleInputsRef) return;
    const currentMap = moduleInputsRef.current;
    currentMap.set(item.id, inputs);
    return () => {
      currentMap.delete(item.id);
    };
  }, [inputs, item.id, moduleInputsRef]);

  const fieldDef = moduleFieldDefs[item.module_type];
  const inputFields = fieldDef?.inputs || [];
  const autoFields = fieldDef?.auto || [];

  const liveCalc = useMemo(
    () => calculateModuleLocally(item.module_type, inputs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(inputs), item.module_type]
  );

  const handleInputChange = (key: string, value: any) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({ ...inputs, ...liveCalc });
    setSaving(false);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setInputs(item.input_json || {});
    setIsEditing(false);
  };

  const fieldDisabled = readOnly || !isEditing;

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 2,
        border: `1.5px solid ${isEditing ? '#1F7A63' : 'var(--border)'}`,
        borderRadius: '14px',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        boxShadow: isEditing ? '0 2px 12px rgba(31,122,99,0.08)' : '0 1px 3px rgba(0,0,0,0.03)',
        '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
      }}
    >
      {/* -- Header -- */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2.5,
          py: 1.25,
          cursor: 'pointer',
          backgroundColor: expanded ? UI.bgSubtle : UI.bgSubtle,
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          transition: 'background-color 0.15s',
        }}
        onClick={onToggle}
      >
        {/* Module type badge */}
        <Box sx={{
          px: 1.25, py: 0.5, borderRadius: '8px', mr: 1.5,
          background: isEditing ? 'linear-gradient(135deg, #1F7A63, #166354)' : 'var(--border-subtle)',
          display: 'flex', alignItems: 'center', flexShrink: 0,
        }}>
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: isEditing ? '#fff' : '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {moduleLabels[item.module_type]?.split(' ')[0] || 'Module'}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }} noWrap>
            {moduleLabels[item.module_type]}
            {inputs.job_name && (
              <Typography component="span" sx={{ ml: 0.75, fontWeight: 400, color: 'var(--text-muted)', fontSize: 13 }}>
                _ {inputs.job_name}
              </Typography>
            )}
          </Typography>
        </Box>
        <Typography sx={{
          mr: 1.5, color: '#1F7A63', backgroundColor: '#E8F7F2', border: '1px solid #d6efe5',
          px: 1.5, py: 0.25, borderRadius: '8px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          $ {Number(liveCalc.total_job_cost ?? item.total_cost ?? 0).toFixed(0)}
        </Typography>
        {!readOnly && !isEditing && (
          <Tooltip title="Edit" arrow>
            <IconButton size="small"
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              sx={{ color: '#1F7A63', mr: 0.5, border: '1px solid #1F7A6340', borderRadius: '8px', '&:hover': { background: '#E8F7F2' } }}>
              <EditIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
        {/* 3-dot menu for module actions */}
        <IconButton size="small"
          onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
          sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-secondary)', background: 'var(--border-subtle)' }, mr: 0.25 }}>
          <MoreVertIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onToggle(); }}
          sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-secondary)' } }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
        </IconButton>
        {/* Module context menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          onClick={(e) => e.stopPropagation()}
          PaperProps={{
            sx: { borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid var(--border)', minWidth: 170 },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem onClick={() => { setMenuAnchor(null); onCopy(); }} sx={{ fontSize: 13, py: 1 }}>
            <ListItemIcon><CopyIcon sx={{ fontSize: 16, color: '#6B7280' }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}>Duplicate</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setMenuAnchor(null); onDelete(); }} sx={{ fontSize: 13, py: 1, color: '#EF4444' }}>
            <ListItemIcon><DeleteIcon sx={{ fontSize: 16, color: '#EF4444' }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>Delete</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 3, py: 2.5, backgroundColor: '#FFFFFF' }}>
          {/* Section: Input Parameters */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Box sx={{ width: 3, height: 16, borderRadius: "2px", background: "linear-gradient(180deg, #1F7A63, #10B981)" }} />
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>
              Input Parameters
            </Typography>
          </Box>
          <Grid container spacing={1.5}>
            {inputFields.map((field) => (
              <Grid item xs={12} sm={4} key={field.key}>
                {field.type === 'select' ? (
                  <FormControl fullWidth size="small" disabled={fieldDisabled}>
                    <InputLabel>{field.label}</InputLabel>
                    <Select
                      label={field.label}
                      value={inputs[field.key] ?? ''}
                      onChange={(e) => handleInputChange(field.key, e.target.value)}
                      sx={{ borderRadius: '10px' }}
                    >
                      {field.options?.map((o) => (
                        <MenuItem key={o} value={o}>{o}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <TextField
                    fullWidth
                    size="small"
                    label={field.label}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={inputs[field.key] ?? ''}
                    placeholder={field.placeholder}
                    onChange={(e) =>
                      handleInputChange(
                        field.key,
                        field.type === 'number'
                          ? (e.target.value === '' ? '' : parseFloat(e.target.value))
                          : e.target.value
                      )
                    }
                    disabled={fieldDisabled}
                    InputProps={field.placeholder ? {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, whiteSpace: 'nowrap' }}>
                            {field.placeholder}
                          </Typography>
                        </InputAdornment>
                      ),
                    } : undefined}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                  />
                )}
              </Grid>
            ))}
          </Grid>

          {/* Section: Auto-Estimated Values */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Box sx={{ width: 3, height: 16, borderRadius: "2px", background: "linear-gradient(180deg, #0369A1, #38BDF8)" }} />
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>
              Auto-Estimated Values
            </Typography>
          </Box>
          <Box sx={{ p: 2.5, backgroundColor: UI.bgSubtle, borderRadius: '14px', border: '1px solid var(--border)', mb: 3 }}>

            <Grid container spacing={1.5}>
              {autoFields.map((field) => (
                <Grid item xs={12} sm={4} key={field.key}>
                  {field.isManualOk ? (
                    <TextField
                      fullWidth size="small"
                      label={field.label}
                      type="number"
                      value={inputs[field.key] ?? ''}
                      onChange={(e) => handleInputChange(field.key, e.target.value === '' ? '' : parseFloat(e.target.value))}
                      disabled={fieldDisabled}
                      placeholder="Enter Value"
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Or Auto</Typography>
                          </InputAdornment>
                        ),
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { backgroundColor: inputs[field.key] ? 'white' : 'var(--border-subtle)', borderRadius: '10px' } }}
                    />
                  ) : (
                    <TextField
                      fullWidth size="small"
                      label={field.label}
                      value={
                        liveCalc[field.key] !== undefined
                          ? liveCalc[field.key]
                          : (item.calculated_json?.[field.key] ?? '')
                      }
                      disabled
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Typography variant="caption" color="#1F7A63" sx={{ fontSize: 9, whiteSpace: 'nowrap' }}>
                              Auto-estimated
                            </Typography>
                          </InputAdornment>
                        ),
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { backgroundColor: 'var(--border-subtle)', borderRadius: '10px' } }}
                    />
                  )}
                </Grid>
              ))}
            </Grid>
          </Box>

          {/* Action buttons */}
          {!readOnly && isEditing && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<CalculateIcon />}
                onClick={handleSave}
                disabled={saving}
                sx={{
                  background: '#1F7A63',
                  textTransform: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  px: 2.5,
                  boxShadow: '0 2px 4px rgba(31,122,99,0.2)',
                  '&:hover': { background: '#0D3D2F', boxShadow: '0 4px 12px rgba(31,122,99,0.3)', transform: 'translateY(-1px)' },
                }}
              >
                {saving ? 'Saving...' : 'Calculate & Save'}
              </Button>
              {hasExistingData && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleCancel}
                  sx={{ textTransform: 'none', borderRadius: '10px', fontWeight: 600, borderColor: 'var(--text-muted)', color: '#6B7280', px: 2.5, '&:hover': { borderColor: 'var(--text-muted)', background: UI.bgSubtle } }}
                >
                  Cancel
                </Button>
              )}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Card>
  );
};

export default EstimationTab;

