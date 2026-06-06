// User types
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  is_co_admin?: boolean;
  is_owner?: boolean;
  phone?: string;
  position?: string;
  modules?: string[];
  module_permissions?: Record<string, ModulePermission>;
  company_id?: string;
  company_name?: string;
  company?: { id: string; name: string };
  created_by?: string;
  creator?: { id: string; name: string; role?: string };
  created_at: string;
  last_login?: string;
  department?: string;
  tags?: string[];
  last_login_ip?: string;
  last_login_device?: string;
  failed_login_attempts?: number;
  locked_until?: string;
  two_factor_enabled?: boolean;
  force_password_reset?: boolean;
  invited_at?: string;
  invite_status?: 'pending' | 'accepted' | 'expired';
  avatar?: string;
  gender?: 'male' | 'female' | 'other' | null;
  user_id?: string;
  subscription_status?: string | null;
}

export interface ModulePermission {
  read: boolean;
  write: boolean;
  admin: boolean;
}

export type UserRole = 'platform_admin' | 'main_admin' | 'admin' | 'user' | 'sales_engineer';

export type CompanyPlan = 'free' | 'starter' | 'professional' | 'enterprise';

// Company types
export interface Company {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  user_limit?: number;
  plan?: CompanyPlan;
  suspended_at?: string;
  suspension_reason?: string;
  risk_flags?: string[];
  settings?: Record<string, any>;
  ip_whitelist?: string[];
  storage_used_mb?: number;
  last_activity_at?: string;
  created_by?: string;
  created_at: string;
  user_count?: number;
  admin_count?: number;
  active_user_count?: number;
  admin?: { id: string; name: string };
  users?: User[];
}

// Permission Template types
export interface PermissionTemplate {
  id: string;
  name: string;
  description?: string;
  permissions: Record<string, ModulePermission>;
  company_id?: string;
  created_by?: string;
  creator?: { id: string; name: string };
  is_global: boolean;
  created_at: string;
}

// Login History types
export interface LoginHistoryEntry {
  id: string;
  user_id: string;
  ip_address?: string;
  user_agent?: string;
  device?: string;
  location?: string;
  status: 'success' | 'failed';
  failure_reason?: string;
  created_at: string;
}

// Super Admin Stats
export interface SuperAdminStats {
  role: 'main_admin';
  summary: {
    totalCompanies: number;
    activeCompanies: number;
    suspendedCompanies: number;
    totalAdmins: number;
    totalActiveUsers: number;
    totalInactiveUsers: number;
    totalUsers: number;
    totalCapacity: number;
    pendingInvitations: number;
    suspendedAccounts: number;
    recentLogins: number;
    failedLogins: number;
    inactiveCompanies: number;
  };
  companies: Company[];
}

// Admin Stats
export interface AdminStats {
  role: 'admin';
  company: { id: string; name: string; user_limit: number; plan: string } | null;
  summary: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    userLimit: number;
    remainingSlots: number;
    createdToday: number;
    pendingInvites: number;
    weeklyLogins: number;
    dailyActive: number;
    roleDistribution: Record<string, number>;
    deptDistribution: Record<string, number>;
  };
  users: User[];
}

// User Stats
export interface UserStats {
  role: 'user';
  user: User;
  loginHistory: LoginHistoryEntry[];
}

// Permission types
export interface PermissionItem {
  key: string;
  label: string;
  category: string;
  enabled: boolean;
  id?: string;
}

export interface Permissions {
  admin: PermissionItem[];
  user: PermissionItem[];
}

// Client types
export interface Client {
  id: string;
  client_name: string;
  address?: string;
  poc_name?: string;
  poc_email?: string;
  poc_phone?: string;
  position?: string;
  company_id?: string;
  company?: { id: string; name: string };
  created_by?: string;
  creator?: { id: string; name: string };
  is_active?: boolean;
  created_at: string;
  // Additional fields used by UI
  company_name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  tax_id?: string;
  payment_terms?: string;
  notes?: string;
}

// Vendor types
export interface Vendor {
  id: string;
  vendor_name: string;
  address?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  company_id?: string;
  company?: { id: string; name: string };
  created_by?: string;
  creator?: { id: string; name: string };
  is_active?: boolean;
  created_at: string;
  // Additional fields used by UI
  company_name?: string;
  email?: string;
  phone?: string;
  specialty?: string;
  rating?: number;
  notes?: string;
  tax_id?: string;
  service_categories?: string[];
  reviews_count?: number;
  assigned_projects?: { id: string; name: string; role?: string }[];
  rating_breakdown?: Record<string, number>;
  activity?: { id: string; text: string; at: string }[];
  status?: string;
}

// Project types
export type ProjectStatus = 
  | 'draft' 
  | 'estimated' 
  | 'quoted' 
  | 'order_confirmed' 
  | 'in_production' 
  | 'inspected' 
  | 'shipped' 
  | 'closed'
  | 'issue';

export type MaterialSupplier = 'client' | 'vendor' | 'manufacturer';

export interface Project {
  id: string;
  project_name: string;
  project_number?: string;
  client_id: string;
  client?: Client;
  prepared_by: string;
  preparedBy?: User;
  revision: number;
  status: ProjectStatus;
  quotation_number?: string;
  quote_info?: {
    client_name?: string;
    billing_address?: string;
    client_poc?: string;
    client_poc_phone?: string;
    seller_prepared_by?: string;
    seller_poc?: string;
    seller_poc_phone?: string;
    seller_designation?: string;
    seller_email?: string;
    ship_to_address?: string;
    country_zip?: string;
  };
  ship_to_address?: string;
  material_type?: string;
  material_grade?: string;
  heat_number?: string;
  material_supplied_by?: MaterialSupplier;
  quantity?: number;
  created_at: string;
  updated_at: string;
  estimate?: Estimate;
  estimates?: Estimate[];
  salesOrder?: SalesOrder;
  workOrder?: WorkOrder;
  qualityRecord?: QualityRecord;
  documents?: Document[];
  selected_revision?: number | null;
  production_traveler_type?: 'machining_industry' | 'anodizing_industry';
}

// Estimate types
export type ProcessModuleType =
  | 'cnc_turning'
  | 'cnc_milling'
  | 'laser_cutting'
  | 'fabrication_welding'
  | 'welding'
  | 'heat_treatment'
  | 'grinding'
  | 'drilling'
  | 'boring'
  | 'threading'
  | 'surface_treatment'
  | 'assembly'
  | 'testing'
  | 'blank_module'
  | 'other';

export interface PricingTier {
  quantity: number | string;
  unit_price: number | string;
}

export interface CustomPart {
  id: string;
  parts_master_id?: string;
  parts_master_drawing_url?: string;  // tracks the last-synced drawing R2 key from Part Master
  raw_material_id?: string;
  job_description: string;
  material: string;
  heat_number?: string;
  drawing_given_by_client: 'Yes' | 'No';
  raw_material_display_id?: string;
  material_grade: string;
  quantity: number | string;
  drawing_part_no: string;
  drawing_revision?: string;
  raw_material_supplied_by: string;
  vendor_id?: string;
  raw_material_spec_id?: string;
  material_source?: 'Client Supplied' | 'In-House Stock' | 'Vendor Supplied';
  job_cost_per_unit: number | string;
  raw_material_dimension: string;
  drawing_file_name?: string;
  total_cost?: number;
  bulk_order_variable_price?: boolean;
  pricing_tiers?: PricingTier[];
  weight_per_unit?: number | string;
  weight_unit?: 'kg' | 'lb' | 'g';
  total_weight?: number | string;
  is_blank_module?: boolean;
  production_industry?: string | null;
  manufacturing_type?: string | null;
  cut_method?: string | null;
  cut_length?: string | null;
  lathe_ops_required?: string | null;
  mill_ops_required?: string | null;
  deburr_required?: string | null;
  heat_treat_required?: string | null;
  marking_required?: string | null;
}

export interface EstimateItem {
  id: string;
  estimate_id: string;
  module_type: ProcessModuleType;
  input_json: Record<string, any>;
  calculated_json: Record<string, any>;
  total_cost: number;
  sequence_order: number;
}

export interface Estimate {
  id: string;
  project_id: string;
  revision: number;
  is_locked: boolean;
  raw_material_cost: number;
  process_cost: number;
  overhead_cost: number;
  total_cost: number;
  margin_percent: number;
  final_price: number;
  is_approved: boolean;
  approved_by?: string;
  approved_at?: string;
  items: EstimateItem[];
  custom_parts?: CustomPart[];
  all_items?: CustomPart[];
  quotation?: {
    validity_days: number;
    delivery_terms: string;
    payment_terms: string;
    notes?: string;
    terms_conditions?: string;
    include_terms?: boolean;
    sent_at?: string;
    sent_to_client?: boolean;
    line_items?: Array<{ description: string; unit_price: number; quantity: number }>;
    schedule_items?: Array<{ description: string; date: string }>;
    bom_items?: Array<{ section: string; parameter: string; quantity: number }>;
  };
}

// Sales Order types
export interface SalesOrder {
  id: string;
  project_id: string;
  sales_order_number: string;
  customer_po_number?: string;
  customer_po_file?: string;
  accepted_date?: string;
  delivery_date?: string;
  notes?: string;
}

// Work Order types
export interface WorkOrderOperation {
  id: number;
  module_type: ProcessModuleType;
  description: string;
  inputs: Record<string, any>;
  is_completed: boolean;
  completed_at?: string;
  operator_initials: string;
  notes: string;
}

export interface WorkOrder {
  id: string;
  project_id: string;
  work_order_number: string;
  release_date?: string;
  operations: WorkOrderOperation[];
  status: 'pending' | 'in_progress' | 'completed';
  notes?: string;
  actual_completion_date?: string;
  // Additional fields used by UI
  wo_number?: string;
  start_date?: string;
  target_date?: string;
}

// Quality types
export interface QualityRecord {
  id: string;
  project_id: string;
  dimensional_verification: boolean;
  visual_inspection: boolean;
  hardness_testing: boolean;
  ndt_testing: boolean;
  pressure_testing: boolean;
  mtr_verification: boolean;
  inspection_data_json: Record<string, any>;
  report_files: Array<{ path: string; name: string; uploaded_at: string }>;
  coc_generated: boolean;
  inspection_date?: string;
  inspector_name?: string;
  notes?: string;
  is_finalized?: boolean;
  overall_result?: 'pass' | 'fail' | 'pending';
  job_quality_forms?: Array<Record<string, any>>;
  reports?: Array<{ path: string; name: string }>;
}

// Document types
export type DocumentType = 
  | 'quotation'
  | 'proposal'
  | 'work_order'
  | 'production_traveller'
  | 'coc'
  | 'packing_list'
  | 'delivery_note'
  | 'drawing'
  | 'inspection_report'
  | 'material_cert'
  | 'invoice'
  | 'rfq_quotation'
  | 'vendor_po_quotation'
  | 'sales_order'
  | 'purchase_order'
  | 'tracking_slip'
  | 'other';

export interface Document {
  id: string;
  project_id: string;
  document_type: DocumentType;
  version: number;
  file_path: string;
  file_name: string;
  status: 'draft' | 'final';
  generated_by?: string;
  generatedBy?: User;
  generated_at: string;
  // Additional fields used by UI
  url?: string;
  type?: string;
  description?: string;
  size?: number;
  createdAt?: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Auth types
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

// ─── Session Types ───────────────────────────────────────────────────────────

export interface SessionRecord {
  id: string;
  user_id: string;
  ip_address?: string;
  user_agent?: string;
  device?: string;
  location?: string;
  is_active: boolean;
  last_activity_at: string;
  created_at: string;
  expires_at: string;
  user?: { id: string; name: string; email: string; role: string; company_name?: string };
}

// ─── Custom Role Types ───────────────────────────────────────────────────────

export interface PermissionAction {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  export: boolean;
  approve: boolean;
}

export interface RoleCondition {
  field?: string;
  operator?: 'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte';
  value?: string | number;
  action?: string;
  scope?: 'own_records' | 'department' | 'all';
  description?: string;
}

export interface CustomRole {
  id: string;
  name: string;
  description?: string;
  company_id?: string;
  company?: { id: string; name: string };
  is_system: boolean;
  base_role: string;
  permissions: Record<string, PermissionAction>;
  conditions: RoleCondition[];
  color: string;
  icon?: string;
  priority: number;
  created_by?: string;
  creator?: { id: string; name: string };
  created_at: string;
}

export interface PermissionSchema {
  modules: string[];
  actions: string[];
}

// ─── Approval Workflow Types ─────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ApprovalChainStep {
  level: number;
  approver_id: string;
  approver_name?: string;
  status: 'pending' | 'approved' | 'rejected';
  decided_at?: string;
  comment?: string;
}

export interface ApprovalWorkflow {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: ApprovalStatus;
  priority: ApprovalPriority;
  entity_type?: string;
  entity_id?: string;
  company_id?: string;
  company?: { id: string; name: string };
  requested_by: string;
  requester?: { id: string; name: string; email: string; role: string };
  request_data: Record<string, any>;
  approval_chain: ApprovalChainStep[];
  current_level: number;
  decided_by?: string;
  decider?: { id: string; name: string; email: string; role: string };
  decided_at?: string;
  decision_comment?: string;
  expires_at?: string;
  created_at: string;
}

// ─── Risk Score Types ────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  factor: string;
  weight: number;
  detail: string;
}

export interface RiskScore {
  id: string;
  entity_type: 'company' | 'user';
  entity_id: string;
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  last_calculated_at: string;
}

// ─── Analytics Types ─────────────────────────────────────────────────────────

export interface LoginTrend {
  date: string;
  total: number;
  success: number;
  failed: number;
}

export interface PlatformAnalytics {
  summary: {
    totalCompanies: number;
    activeCompanies: number;
    totalUsers: number;
    activeUsers: number;
    activeSessions: number;
    recentLogins: number;
    failedLogins24h: number;
    pendingApprovals: number;
    highRiskCount: number;
    churnRate: number;
  };
  loginTrends: LoginTrend[];
  activeUsersTrend: { date: string; unique_users: number }[];
  companyGrowth: { month: string; count: number }[];
  roleDistribution: Record<string, number>;
  planDistribution: Record<string, number>;
}

export interface CompanyAnalytics {
  summary: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    userLimit: number;
    plan: string;
    storageUsed: number;
  };
  loginTrends: LoginTrend[];
  roleDistribution: Record<string, number>;
  deptDistribution: Record<string, number>;
}

// ─── Activity Timeline Types ─────────────────────────────────────────────────

export interface ActivityTimelineEntry {
  id: string;
  company_id?: string;
  user_id?: string;
  action: string;
  description?: string;
  metadata: Record<string, any>;
  icon?: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  created_at: string;
  user?: { id: string; name: string; email: string; role: string };
  company?: { id: string; name: string };
}

// ─── Material Master Types ──────────────────────────────────────────────────

export type MaterialCategory = 'raw_material' | 'consumable' | 'safety_equipment' | 'tools';

export interface MaterialVendorMapping {
  id: string;
  material_id: string;
  vendor_id: string;
  price_per_unit: number;
  lead_time: number | null;
  is_default: boolean;
  vendor?: { id: string; vendor_name: string };
  created_at?: string;
  updated_at?: string;
}

export interface Material {
  id: string;
  material_name: string;
  category: MaterialCategory;
  grade?: string;
  form?: string;
  shape?: string;
  unit: string;
  density?: number;
  default_cost?: number;
  description?: string;
  company_id?: string;
  created_by?: string;
  creator?: { id: string; name: string };
  is_active: boolean;
  vendorMappings?: MaterialVendorMapping[];
  created_at: string;
  updated_at: string;
}

// ─── Parts Master Types ─────────────────────────────────────────────────────

export interface Part {
  id: string;
  part_id_seq?: string;
  part_name: string;
  part_number?: string;
  description?: string;
  material_category?: string;
  material_grade?: string;
  form?: string;
  shape?: string;
  density?: number;
  dimensions?: Record<string, string>;
  cost_per_unit?: number;
  volume?: number;
  weight_per_piece?: number;
  total_weight?: number;
  weight_unit?: string;
  quantity?: number;
  cost_type?: string;
  cost_rate?: number;
  cost_per_piece?: number;
  total_cost?: number;
  vendor_id?: string;
  client_id?: string;
  notes?: string;
  is_active: boolean;
  company_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  vendor?: { id: string; vendor_name: string };
  client?: { id: string; client_name: string };
  creator?: { id: string; name: string };
}

export interface PartDimension {
  id: string;
  part_id: string;
  key: string;
  label?: string;
  value?: number;
  unit?: string;
  company_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PartTemplate {
  id: string;
  template_name: string;
  form?: string;
  shape?: string;
  default_dimensions?: Record<string, any>;
  notes?: string;
  is_active: boolean;
  company_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ─── Stock (Warehouse Inventory) Types ──────────────────────────────────────

export interface StockItem {
  id: string;
  stock_id?: string;
  part_description: string;
  material_grade: string;
  condition?: string;
  shape?: string;
  dimension: string;
  quantity: number;
  heat_number?: string;
  company_id?: string;
  created_by?: string;
  creator?: { id: string; name: string };
  created_at: string;
  updated_at: string;
}

// ─── Vendor Procurement Types ───────────────────────────────────────────────

export interface VendorMaterial {
  id: string;
  vendor_id: string;
  material_id: string;
}

export type RFQStatus = 'pending' | 'quoted' | 'accepted' | 'rejected';

export interface VendorRFQ {
  id: string;
  project_id: string;
  material_id: string;
  vendor_id: string;
  required_quantity?: number;
  unit?: string;
  quoted_price?: number;
  lead_time?: string;
  quotation_file?: string;
  is_selected: boolean;
  status: RFQStatus;
  company_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  project?: { id: string; project_name: string; status?: string };
  material?: { id: string; material_name: string; unit: string };
  vendor?: { id: string; vendor_name: string };
  creator?: { id: string; name: string };
}

// ─── RFQ Bundle Types (Multi-Part RFQ System) ───────────────────────────────

export type RFQBundleStatus = 'draft' | 'sent' | 'quoted' | 'accepted' | 'rejected';

export interface RFQBundleItem {
  id: string;
  rfq_bundle_id: string;
  part_id: string;
  part_description: string;
  material?: string;
  material_grade?: string;
  quantity: number;
  unit?: string;
  quoted_price?: number;
  notes?: string;
}

export interface RFQBundle {
  id: string;
  rfq_number: string;
  project_id: string;
  vendor_id: string;
  total_quantity?: number;
  date: string;
  need_materials_before?: string;
  status: RFQBundleStatus;
  notes?: string;
  instructions?: string[];
  company_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  project?: { id: string; project_name: string; status?: string };
  vendor?: { id: string; vendor_name: string; contact_email?: string; contact_phone?: string };
  items?: RFQBundleItem[];
  creator?: { id: string; name: string };
}

export interface VendorSuppliedPart {
  id: string;
  job_description: string;
  material: string;
  material_grade: string;
  quantity: number | string;
  raw_material_dimension?: string;
  drawing_part_no?: string;
  form?: string;
  shape?: string;
  condition?: string;
}

export type VendorPOStatus = 'draft' | 'sent' | 'acknowledged' | 'delivered' | 'cancelled';

export interface VendorPO {
  id: string;
  po_number: string;
  project_id: string;
  vendor_id: string;
  material_id: string;
  rfq_id?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  delivery_date?: string;
  payment_terms?: string;
  notes?: string;
  status: VendorPOStatus;
  company_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  project?: { id: string; project_name: string };
  vendor?: { id: string; vendor_name: string; contact_email?: string; contact_phone?: string; address?: string };
  material?: { id: string; material_name: string; unit: string };
  rfq?: VendorRFQ;
}

// ─── Vendor Purchase Order (from approved RFQ bundle) ────────────────────────

export type VendorPurchaseOrderStatus = 'draft' | 'sent' | 'acknowledged' | 'delivered' | 'cancelled';

export interface VendorPOItemType {
  id?: string;
  vendor_po_id?: string;
  part_id?: string;
  part_description: string;
  quantity: number | string;
  unit_cost: number | string;
  weight?: number | string;
  weight_unit?: string;
  cost_per_weight?: number | string;
  line_total: number | string;
  selected: boolean;
  notes?: string;
}

export interface VendorPurchaseOrder {
  id: string;
  po_number: string;
  project_id: string;
  rfq_bundle_id?: string;
  vendor_id: string;
  po_date: string;
  tax_type: string;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  quotation_file?: string;
  notes?: string;
  terms_conditions?: string;
  cost_mode?: string;
  status: VendorPurchaseOrderStatus;
  company_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  ratings?: { price: number; delivery: number; quality: number } | null;
  project?: { id: string; project_name: string; status?: string };
  vendor?: { id: string; vendor_name: string; contact_email?: string; contact_phone?: string; address?: string };
  rfqBundle?: RFQBundle;
  items?: VendorPOItemType[];
  creator?: { id: string; name: string };
}

// ─── Business Analytics Types ───────────────────────────────────────────────

export interface AnalyticsKPIs {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number;
  rawMaterialCost: number;
  processCost: number;
  overheadCost: number;
  totalProjects: number;
  activeProjects: number;
  completedOrders: number;
  pendingOrders: number;
  inProduction: number;
  deliveredOrders: number;
  pendingWorkOrders: number;
}

export interface RevenueTrendPoint {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
}

export interface ProfitVsCostPoint {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
  rawMaterial: number;
  process: number;
  overhead: number;
}

export interface OrderPipelinePoint {
  status: string;
  count: number;
}

export interface TopCustomerPoint {
  customer: string;
  revenue: number;
  profit: number;
  orderCount: number;
}

export interface RecentOrder {
  id: string;
  project_name: string;
  customer: string;
  revenue: number;
  mfg_cost: number | null;
  profit: number | null;
  cost_data_pending: boolean;
  status: string;
  updated_at: string;
}

export interface WorkflowStage {
  key: string;
  label: string;
  count: number;
}

export interface WorkflowAnalytics {
  stages: WorkflowStage[];
  bottlenecks: string[];
  totalProjects: number;
}

export interface PartAnalytics {
  name: string;
  totalQty: number;
  revenue: number;
  profit: number;
  orderCount: number;
}

export interface MaterialAnalytics {
  material: string;
  count: number;
  totalQty: number;
}

export interface ProductAnalytics {
  mostProduced: PartAnalytics[];
  mostProfitable: PartAnalytics[];
  topMaterials: MaterialAnalytics[];
}

export interface OperationalAnalytics {
  avgProductionDays: number;
  avgDeliveryDays: number;
  pendingWorkOrders: number;
  inProgressWorkOrders: number;
  completedWorkOrders: number;
  overdueOrders: number;
}

export interface BusinessAnalyticsDashboard {
  kpis: AnalyticsKPIs;
  revenueTrend: RevenueTrendPoint[];
  profitVsCost: ProfitVsCostPoint[];
  orderPipeline: OrderPipelinePoint[];
  topCustomers: TopCustomerPoint[];
  recentOrders: RecentOrder[];
  workflowAnalytics: WorkflowAnalytics;
  productAnalytics: ProductAnalytics;
  operationalAnalytics: OperationalAnalytics;
}
