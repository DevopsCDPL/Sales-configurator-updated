/**
 * AI Assistant Controller --- v3 "Full Copilot + Document Intelligence"
 * ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 * A context-aware AI copilot that:
 *  --- Understands every module, workflow stage, and data entity
 *  --- Executes operational actions via predefined tools (NEVER directly)
 *  --- Asks follow-up questions when data is missing
 *  --- Shows confirmation cards before executing actions
 *  --- Enforces workflow dependencies
 *  --- Classifies and extracts data from uploaded documents
 *  --- Answers analytics / business questions with real data
 *  --- Supports voice input (speech-to-text handled on frontend)
 *  --- Logs all AI actions for audit
 */

const { Project, Client, Vendor, User, Estimate, AuditLog } = require('../models');
const { Op } = require('sequelize');
const { TOOL_DEFINITIONS, executeTool, resolveEntity } = require('../services/aiToolsService');
const aiPrefs = require('../services/aiPreferencesService');
const { classifyDocument, extractDataFromText, formatExtractedData } = require('../services/aiDocumentService');

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  1. SYSTEM KNOWLEDGE BASE
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const KB = {
  platform: {
    name: 'Forge i-DAS',
    tagline: 'Industrial Project Management & ERP',
    description:
      'Enterprise platform for fabrication companies --- manages the full project lifecycle from quotation to delivery, including estimation, production tracking, quality control, and logistics.',
  },

  modules: {
    dashboard: {
      name: 'Dashboard',
      path: '/',
      emoji: '----',
      short: 'Your command center --- KPIs, project overview, and quick actions.',
      features: [
        'KPI cards: Total Revenue, Active Projects, Completed This Month, Total Clients',
        'Project Overview table with search & filtering',
        'Time-range filters (Today, This Week, This Month, All)',
        'Production Risk Overview with risk scores',
        'Quick "+ New Project" button',
      ],
      tips: [
        'Use time-range filters to focus on recent activity',
        'Click any project row to jump into its details',
        'Keep an eye on the Risk Overview to catch delays early',
      ],
    },

    projects: {
      name: 'Projects',
      path: '/projects',
      emoji: '----',
      short: 'Manage all fabrication projects end-to-end.',
      features: [
        'Create, edit, and track projects through every stage',
        'Status pipeline: Pending --- Estimated --- Quoted --- Order Confirmed --- In Production --- Inspected --- Shipped --- Completed',
        '9 workflow tabs per project (Project Info, Quotation, Estimation, Sales Order, Work Order, Production, Quality, Logistics, Documents)',
        'Bulk select, delete, export',
        'Status filter chips & search',
        'Revenue tracking per project',
        'Deadline management',
      ],
      tips: [
        'Use "+ New Project" on Dashboard or Projects page',
        'Each tab tracks a different part of the workflow',
        'The Estimation tab supports revision tracking (R0, R1, R2 ---)',
        'Upload supporting docs in the Documents tab',
      ],
    },

    clients: {
      name: 'Clients',
      path: '/clients',
      emoji: '----',
      short: 'Manage client profiles, contacts, and project links.',
      features: [
        'Add, edit, and manage client profiles',
        'See all projects associated with a client',
        'Contact info management',
        'Client activity history',
      ],
      tips: [
        'Navigate via sidebar --- Management --- Clients',
        'Admin or Main Admin access required',
      ],
    },

    vendors: {
      name: 'Vendors',
      path: '/vendors',
      emoji: '----',
      short: 'Track suppliers, performance, and risk.',
      features: [
        'Add and manage vendor profiles',
        'Vendor performance tracking',
        'Risk assessment & scoring',
        'Contact & business details',
        'Vendor categories & classification',
      ],
      tips: [
        'Use "+ Add Vendor" or navigate to /vendors/add',
        'Monitor vendor risk in the Risk Dashboard',
        'Admin access required',
      ],
    },

    messages: {
      name: 'Messages',
      path: '/messages',
      emoji: '----',
      short: 'Internal team messaging.',
      features: [
        'Real-time messaging between team members',
        'Conversation threads',
        'Unread message badge in sidebar',
      ],
      tips: [
        'Unread count shows in the sidebar',
        'Click a conversation to view history',
      ],
    },

    analytics: {
      name: 'Analytics',
      path: '/analytics',
      emoji: '----',
      short: 'Business intelligence, trends, and performance data.',
      features: [
        'Revenue analytics & trends',
        'Project completion rates',
        'Resource utilization metrics',
        'Performance benchmarks',
        'Charts & data visualization',
      ],
      tips: [
        'Sidebar --- Analytics section',
        'Admin access required',
        'Use date filters to drill down',
      ],
    },

    reports: {
      name: 'Reports',
      path: '/reports',
      emoji: '----',
      short: 'Generate and export business reports.',
      features: [
        'Project reports',
        'Revenue & financial reports',
        'Production status reports',
        'Custom report generation',
      ],
      tips: ['Admin access required', 'Export reports in PDF or Excel'],
    },

    accessControl: {
      name: 'Access Control',
      path: '/access-control',
      emoji: '----',
      short: 'Users, roles, permissions, audit logs, and security.',
      features: [
        'User management --- add, edit, deactivate',
        'Admin management',
        'Company / tenant management (multi-tenant)',
        'Role-based access control (RBAC)',
        'Permission templates',
        'Audit logs --- track every action',
        'Security settings',
      ],
      sections: {
        Users: '/access-control/users',
        Admins: '/access-control/admins',
        Companies: '/access-control/companies',
        Roles: '/access-control/roles',
        Templates: '/access-control/templates',
        'Audit Logs': '/access-control/audit-logs',
        Security: '/access-control/security',
      },
      tips: [
        'Only Main Admin / Admin can access',
        'Audit Logs show who did what and when',
        'Use permission templates for consistent role setup',
      ],
    },

    settings: {
      name: 'Settings',
      path: '/settings',
      emoji: '------',
      short: 'Profile, company info, and system preferences.',
      features: [
        'Profile settings (name, email, password)',
        'Company information',
        'System preferences',
        'Module configurations',
      ],
      tips: [
        'All users can edit their profile',
        'Company-wide settings need admin access',
      ],
    },

    riskDashboard: {
      name: 'Risk Dashboard',
      path: '/risk-dashboard',
      emoji: '------',
      short: 'Monitor production, vendor, and supply-chain risks.',
      features: [
        'Overall risk score',
        'Supply chain risk assessment',
        'Delay probability tracking',
        'Resource utilization risk',
        'Vendor risk analysis',
      ],
    },

    approvals: {
      name: 'Approvals',
      path: '/approvals',
      emoji: '---',
      short: 'Manage approval workflows for estimates and changes.',
      features: [
        'Approval request management',
        'Multi-level approval chains',
        'Status tracking (pending, approved, rejected)',
      ],
    },
  },

  projectTabs: {
    'Project Info': 'Basic details --- name, client, dates, status, description.',
    Quotation: 'Quotation number, pricing, and client quotation management.',
    Estimation:
      'Cost estimation with materials, labor, overhead, and profit. Supports revision tracking (R0, R1, R2 ---).',
    'Sales Order': 'Purchase order / sales order generation after client confirmation. Links to PO docs.',
    'Work Order': 'Manufacturing work order creation & tracking.',
    Production: 'Production schedule, progress tracking, module assignment.',
    Quality: 'Quality inspection reports, checklists, and NCR management.',
    Logistics: 'Shipping, delivery scheduling, and tracking.',
    Documents: 'File uploads and document management for the project.',
  },

  statuses: {
    Pending: 'Project created --- awaiting estimation.',
    Draft: 'Still being drafted, not yet submitted.',
    Estimated: 'Cost estimation completed.',
    Quoted: 'Quotation sent to the client.',
    'Order Confirmed': 'Client confirmed --- ready for production.',
    'In Production': 'Currently being manufactured.',
    Inspected: 'Quality inspection done.',
    Shipped: 'Dispatched to the client.',
    Completed: 'Delivered and closed.',
    'On Hold': 'Temporarily paused.',
    Cancelled: 'Project cancelled.',
  },

  roles: {
    main_admin: 'Full system access --- everything.',
    admin: 'Administrative access --- projects, clients, vendors, users, most settings.',
    user: 'Standard --- view and work on assigned projects & messages.',
  },

  workflowSteps: [
    '1------  **Create Project** --- Assign client, set deadline, add description.',
    '2------  **Estimation** --- Add materials, labor, overhead, profit --- project becomes "Estimated".',
    '3------  **Quotation** --- Generate & send quotation to the client.',
    '4------  **Sales Order** --- Client confirms --- create SO / link PO.',
    '5------  **Work Order** --- Create manufacturing work order.',
    '6------  **Production** --- Track progress, assign modules.',
    '7------  **Quality** --- Run inspections, manage NCRs.',
    '8------  **Logistics** --- Schedule shipping & delivery.',
    '9------  **Documents** --- Attach any supporting files.',
  ],
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  2. QUICK ACTIONS
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const QUICK_ACTIONS = [
  { label: '---- Create Project',       action: 'create_project',      path: '/projects' },
  { label: '---- Create Estimation',    action: 'create_estimation',   path: '/projects' },
  { label: '---- Generate Quotation',   action: 'generate_quotation',  path: '/projects' },
  { label: '---- Send RFQ',             action: 'send_rfq',           path: '/projects' },
  { label: '---- Create Vendor PO',     action: 'create_vendor_po',    path: '/projects' },
  { label: '---- Generate Invoice',     action: 'generate_invoice',    path: '/projects' },
  { label: '---- Upload Document',      action: 'upload_document',     path: '/projects' },
  { label: '---- Show Analytics',       action: 'get_daily_summary',   path: '/analytics' },
];

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  3. INTENT DETECTION
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// ------ Expert Entity Extractor ---------------------------------------------------------------------------------
// Pulls structured data out of free-form user input.  Used by every create_* intent
// so the AI grasps as much as possible in one shot and only asks for what is
// genuinely missing.
//
// Supported entities:
//   * material_name / material_category / material_grade  (e.g. "aluminium", "SS304", "AL6061")
//   * client_name      (after "client:", "client", "for client", "linked to client")
//   * vendor_name      (after "vendor:", "supplier:", "from vendor", "to vendor")
//   * project_name     (after "project:", "for project")
//   * heat_number      ("heat number 555", "heat: 555", "heat# 555")
//   * batch_number     ("batch 22A", "batch: 22A")
//   * quantity + unit  ("quantity 50", "qty 50", "50 kg", "50 nos")
// ============================================================
//  Adaptive helpers --- learning suggestions + answer parsing
// ============================================================

// Maps a missing param name → the kind of value tracked in aiPrefs
const PARAM_KIND_MAP = {
  vendor_name: 'vendor', vendor_id: 'vendor',
  client_name: 'client', client_id: 'client', company_name: 'client',
  project_name: 'project', project_id: 'project',
  material_name: 'material', material_category: 'material', item_name: 'material',
  item_description: 'material', material_id: 'material',
  material_grade: 'grade',
  part_name: 'part',
};

function buildLearnedSuggestions(userId, paramName) {
  const kind = PARAM_KIND_MAP[paramName];
  if (!kind) return [];
  try {
    return aiPrefs.getRecent(userId, kind, 3);
  } catch (_) { return []; }
}

function pickLearnedDefault(userId, paramName) {
  const kind = PARAM_KIND_MAP[paramName];
  if (!kind) return null;
  try { return aiPrefs.getDefault(userId, kind); } catch (_) { return null; }
}

/**
 * Cleans a user's follow-up answer:
 *   • strips "vendor is X", "the vendor name is X", "name X" prefixes
 *   • expands "same" / "same as last" to the learned default
 *   • applies any saved corrections ("aluminium 6000" → "aluminium 7000")
 */
function normaliseAnswer(userId, paramName, raw) {
  if (!raw) return raw;
  let s = String(raw).trim();

  // Expand "same" / "same as last time" / "use last" to learned default
  if (/^(?:same|same\s+as\s+(?:last|before)|use\s+(?:the\s+)?last|previous|last\s+one)\s*[.!]?$/i.test(s)) {
    const def = pickLearnedDefault(userId, paramName);
    if (def) return def;
  }

  // Strip leading conversational prefixes like:
  //   "vendor is ABC", "the vendor name is ABC", "client: ABC", "name --- ABC", "it's ABC"
  s = s.replace(/^(?:the\s+)?(?:vendor|client|customer|company|material|item|part|project|grade|category)\s*(?:name)?\s*(?:is|=|:|---|to\s+be)\s*/i, '');
  s = s.replace(/^(?:it'?s|its|this\s+is|set\s+(?:it\s+)?to|use|use\s+the|make\s+it)\s+/i, '');
  s = s.replace(/^(?:name|value)\s*[:=-]\s*/i, '');

  // Apply correction map
  try { s = aiPrefs.applyCorrection(userId, s); } catch (_) { /* noop */ }

  return s.trim();
}

/**
 * Detects a correction phrase like:
 *   "use aluminium 7000, not 6000"
 *   "actually 7000, not 6000"
 *   "no, use aluminium 7000 instead of aluminium 6000"
 * Returns { wrong, right } if found.
 */
function detectCorrection(message) {
  const m = String(message || '').trim();
  // pattern: "USE X, NOT Y"  or  "USE X INSTEAD OF Y"  or  "X NOT Y"
  let mm = m.match(/(?:use|set|make\s+it|change\s+to|actually)\s+(.+?)\s*(?:,\s*)?(?:not|instead\s+of)\s+(.+?)\s*[.!?]?$/i);
  if (mm) return { right: mm[1].trim(), wrong: mm[2].trim() };
  mm = m.match(/^(.+?)\s+not\s+(.+?)\s*[.!?]?$/i);
  if (mm) return { right: mm[1].trim(), wrong: mm[2].trim() };
  return null;
}

//   * unit_cost        ("$ 12.50/kg", "rate 12.50", "cost 12.50")
//   * required_date    ("by 2026-05-30", "due may 30")
//   * notes            (after "notes:", "remarks:")
// ============================================================
//  Fuzzy normaliser --- handles typos, short forms, informal input
// ============================================================
//
//  "creat rfq"            -> "create rfq"
//  "vendr add"            -> "vendor add"
//  "invtry add item"      -> "inventory add item"
//  "raw mat almunium"     -> "raw material aluminium"
//  "clint tier power"     -> "client tier power"
//  "purchse ordr"         -> "purchase order"
//
//  Strategy:
//   1. Hard alias map (cheap, high-precision) for common short forms
//      and known typos. Wins immediately if it matches.
//   2. Levenshtein distance against a domain dictionary for unknown
//      short tokens (length >= 3, distance <= 2).  Confidence-gated:
//      we only swap a token if there's a single best match well below
//      threshold --- otherwise we leave it alone for the user.
//
//  The original message is kept; the normalised version is what
//  detectIntent / extractEntities operate on.

const FUZZY_ALIASES = {
  // ---- Verbs ----
  creat: 'create', creats: 'create', creaet: 'create', creatd: 'create',
  cret: 'create', cretae: 'create', crete: 'create', creater: 'create',
  ad: 'add', adde: 'add', addd: 'add',
  registr: 'register', regsiter: 'register',
  updte: 'update', updt: 'update', updat: 'update',
  delet: 'delete', delte: 'delete', deleet: 'delete',
  rais: 'raise', raze: 'raise',
  generat: 'generate', genrate: 'generate', gnerate: 'generate',
  shw: 'show', shoow: 'show',
  lst: 'list', lsit: 'list',
  // ---- Nouns / entities ----
  vendr: 'vendor', vendar: 'vendor', vender: 'vendor', vandor: 'vendor', vndr: 'vendor',
  suplier: 'supplier', suppler: 'supplier', supplyer: 'supplier',
  clint: 'client', cleint: 'client', clien: 'client', custmer: 'customer', custumer: 'customer',
  projct: 'project', projet: 'project', proect: 'project', prjct: 'project',
  matrial: 'material', mat: 'material', mtrial: 'material', materal: 'material', mateial: 'material',
  matrials: 'materials', mats: 'materials',
  invtry: 'inventory', invntry: 'inventory', inventery: 'inventory', invntory: 'inventory',
  inv: 'inventory', stck: 'stock',
  prchase: 'purchase', purchse: 'purchase', purcase: 'purchase', purcahse: 'purchase',
  ordr: 'order', odrer: 'order', ordder: 'order',
  rfq: 'rfq', rfqs: 'rfq',                                  // already canonical, keep
  po: 'purchase_order',                                      // expand short-form PO
  pos: 'purchase_order',
  qty: 'quantity', quanity: 'quantity', quanity: 'quantity', quntty: 'quantity',
  prce: 'price', pric: 'price',
  cst: 'cost',
  ht: 'heat', heatno: 'heat number', heatnumber: 'heat number',
  // ---- Material categories (very common typos) ----
  almunium: 'aluminium', aluminim: 'aluminium', alumnium: 'aluminium',
  aluminm: 'aluminium', aluminuim: 'aluminium', aluminum: 'aluminium',
  alumini: 'aluminium', alumun: 'aluminium', alumin: 'aluminium',
  stainles: 'stainless', stainlss: 'stainless', stnless: 'stainless',
  steal: 'steel', stel: 'steel',
  coper: 'copper', cppr: 'copper',
  bras: 'brass', brss: 'brass',
  brnze: 'bronze', bronz: 'bronze',
  titanim: 'titanium', titan: 'titanium', titnium: 'titanium',
  inconl: 'inconel', incnel: 'inconel',
  // ---- Action / module names ----
  estimat: 'estimate', estmate: 'estimate', estimte: 'estimate',
  qutation: 'quotation', quoation: 'quotation', quotaion: 'quotation', quot: 'quote',
  workordr: 'work order', wrkorder: 'work order', wo: 'work_order',
  produciton: 'production', prodution: 'production', prodcution: 'production',
  // ---- Greetings / chit-chat ----
  hai: 'hi', helo: 'hello', helllo: 'hello', hellow: 'hello',
  thanx: 'thanks', thnks: 'thanks', tnx: 'thanks',
  pls: 'please', plz: 'please', plse: 'please',
};

// Domain dictionary used for distance-based fallback (single-token).
// Order matters only insofar as ties are broken by first-listed.
const DOMAIN_DICT = [
  'create', 'add', 'update', 'delete', 'register', 'raise', 'generate',
  'show', 'list', 'fetch', 'send',
  'vendor', 'supplier', 'client', 'customer', 'project', 'part', 'job',
  'material', 'materials', 'inventory', 'stock', 'item', 'items',
  'purchase', 'order', 'rfq', 'quote', 'quotation', 'estimate', 'estimation',
  'production', 'work', 'invoice', 'payment', 'document',
  'aluminium', 'stainless', 'steel', 'mild', 'copper', 'brass', 'bronze',
  'titanium', 'inconel', 'monel', 'nickel', 'plastic', 'nylon',
  'quantity', 'price', 'cost', 'rate', 'unit', 'grade', 'category',
  'heat', 'batch', 'number', 'date', 'amount', 'description', 'notes',
  'name', 'email', 'phone', 'address', 'company', 'contact',
];

/** Quick Levenshtein --- iterative DP, capped early-exit at maxDist. */
function _lev(a, b, maxDist = 3) {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > maxDist) return maxDist + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

/** Find the single best dictionary match for a token, or null if ambiguous. */
function _bestDictMatch(token) {
  const t = token.toLowerCase();
  if (t.length < 3) return null;
  let best = null, bestDist = Infinity, second = Infinity;
  // distance budget: 1 for short words, 2 for >=6 chars
  const budget = t.length >= 6 ? 2 : 1;
  for (const w of DOMAIN_DICT) {
    if (Math.abs(w.length - t.length) > budget) continue;
    const d = _lev(t, w, budget);
    if (d < bestDist) { second = bestDist; bestDist = d; best = w; }
    else if (d < second) { second = d; }
  }
  // Confidence: best must be strictly better than the next-best
  if (best && bestDist <= budget && bestDist < second) return best;
  return null;
}

/**
 * Normalises a free-text message: applies the alias map, then a
 * distance-based fallback for any remaining unknown tokens.
 * Returns { text, replacements } so callers can show "Understood..."
 * without lecturing the user about typos.
 */
function fuzzyNormalise(message, userPrefs = null, userId = null) {
  if (!message) return { text: '', replacements: [] };
  const replacements = [];
  // Tokenise but preserve punctuation positions
  const out = String(message).replace(/([A-Za-z]+)/g, (raw) => {
    const lower = raw.toLowerCase();

    // 1) User-learned correction (per-user typo memory)
    if (userPrefs && userId) {
      try {
        const fixed = userPrefs.applyCorrection(userId, lower);
        if (fixed && fixed.toLowerCase() !== lower) {
          replacements.push([lower, fixed]);
          return _matchCase(raw, fixed);
        }
      } catch (_) { /* noop */ }
    }

    // 2) Static alias map
    if (Object.prototype.hasOwnProperty.call(FUZZY_ALIASES, lower)) {
      const fixed = FUZZY_ALIASES[lower];
      replacements.push([lower, fixed]);
      return _matchCase(raw, fixed);
    }

    // 3) Distance-based fallback against domain dictionary
    if (lower.length >= 4 && !DOMAIN_DICT.includes(lower)) {
      const guess = _bestDictMatch(lower);
      if (guess && guess !== lower) {
        replacements.push([lower, guess]);
        // Auto-learn this typo for the user (so next time it's instant)
        if (userPrefs && userId) {
          try { userPrefs.recordCorrection(userId, lower, guess); } catch (_) {}
        }
        return _matchCase(raw, guess);
      }
    }

    return raw;
  });
  return { text: out, replacements };
}

/** Re-applies the original token's casing onto the corrected token. */
function _matchCase(original, corrected) {
  if (!original) return corrected;
  if (original === original.toUpperCase()) return corrected.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return corrected[0].toUpperCase() + corrected.slice(1);
  }
  return corrected;
}

// ============================================================
//  Strict label-based field extractor
// ============================================================
//
//  Parses structured input like:
//    Vendor Name: ABC Industries
//    Contact Person: John
//    Phone: 9876543210
//    Email: john@abc.com
//    Email CC: ops@abc.com, admin@abc.com
//    GST: 33ABCDE1234F1Z5
//    Address: 123 MG Road, Chennai
//    Items:
//      - AL6061, 50 kg, Heat HT-12345
//      - SS304, 20 kg
//
//  Returns: {
//    fields:   { vendor_name, contact_person, phone, email, gst, address, ... },
//    email_cc: [ 'ops@abc.com', 'admin@abc.com' ],
//    items:    [ { material_name, quantity, unit, heat_number, ... }, ... ],
//  }
//
//  Strict --- only fills a field if it sees its label. No cross-section
//  bleed (e.g. an email under "Email CC" never lands in `email`; a
//  quantity inside an Items row never lands in the top-level qty).
const LABEL_MAP = {
  // Names
  'name':              ['_name'],          // resolved later by context
  'vendor name':       ['vendor_name'],
  'vendor':            ['vendor_name'],
  'supplier name':     ['vendor_name'],
  'supplier':          ['vendor_name'],
  'client name':       ['client_name'],
  'client':            ['client_name'],
  'customer name':     ['client_name'],
  'customer':          ['client_name'],
  'company name':      ['_company_name'], // resolved later
  'company':           ['_company_name'],
  'project name':      ['project_name'],
  'project':           ['project_name'],
  'part name':         ['part_name'],
  'part':              ['part_name'],
  'job name':          ['part_name'],
  'item name':         ['item_name'],
  'item':              ['item_name'],
  'material name':     ['material_name'],
  'material':          ['material_name'],
  // Material attributes
  'material category': ['material_category'],
  'category':          ['material_category'],
  'material grade':    ['material_grade'],
  'grade':             ['material_grade'],
  'part number':      ['part_number'],
  'part no':           ['part_number'],
  'part #':            ['part_number'],
  'revision':          ['revision'],
  'rev':               ['revision'],
  // Contact
  'contact person':    ['contact_person'],
  'contact name':      ['contact_person'],
  'contact':           ['contact_person'],
  'attn':              ['contact_person'],
  'attention':         ['contact_person'],
  'phone':             ['phone'],
  'mobile':            ['phone'],
  'mobile no':         ['phone'],
  'phone no':          ['phone'],
  'tel':               ['phone'],
  'cell':              ['phone'],
  'email':             ['email'],
  'e-mail':            ['email'],
  'mail':              ['email'],
  'email cc':          ['email_cc'],
  'cc':                ['email_cc'],
  'email bcc':         ['email_bcc'],
  'bcc':               ['email_bcc'],
  // Tax / address
  'gst':               ['gst'],
  'gstin':             ['gst'],
  'gst no':            ['gst'],
  'tax id':            ['gst'],
  'pan':               ['pan'],
  'address':           ['address'],
  'addr':              ['address'],
  'location':          ['address'],
  'payment terms':     ['payment_terms'],
  'terms':             ['payment_terms'],
  // Quantities / costs
  'quantity':          ['quantity'],
  'qty':               ['quantity'],
  'unit':              ['unit'],
  'uom':               ['unit'],
  'rate':              ['unit_cost'],
  'price':             ['unit_cost'],
  'cost':              ['unit_cost'],
  'unit cost':         ['unit_cost'],
  'unit price':        ['unit_cost'],
  'unit rate':         ['unit_cost'],
  'amount':            ['amount'],
  'tax type':          ['tax_type'],
  // Trace
  'heat':              ['heat_number'],
  'heat no':           ['heat_number'],
  'heat number':       ['heat_number'],
  'heat #':            ['heat_number'],
  'batch':             ['batch_number'],
  'batch no':          ['batch_number'],
  'batch number':      ['batch_number'],
  // Misc
  'required date':     ['required_date'],
  'due date':          ['required_date'],
  'deadline':          ['required_date'],
  'delivery date':     ['required_date'],
  'date':              ['required_date'],
  'notes':             ['notes'],
  'note':              ['notes'],
  'remarks':           ['notes'],
  'comments':          ['notes'],
  'description':       ['description'],
  'desc':              ['description'],
};

// Section headers that begin a list-style block (table rows follow until blank/next header)
const SECTION_HEADERS = new Set(['items', 'item list', 'materials', 'material list', 'parts', 'rows', 'lines']);

function _splitMulti(value) {
  // Split on comma / semicolon / newline for multi-value fields like Email CC
  return String(value || '')
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function _parseTableRow(line) {
  // Comma-separated fields inside an items table.
  // Examples:
  //   "AL6061, 50 kg, Heat HT-12345"
  //   "SS304 50 kg"
  //   "1. AL6061 - 50 kg - HT-12345"
  const cleaned = line.replace(/^[-*\u2022\d.)\s]+/, '').trim();
  if (!cleaned) return null;
  const row = {};
  // First chunk = material/item name (before first comma/dash)
  const parts = cleaned.split(/\s*[,|]\s*|\s+--?\s+/);
  if (parts[0]) row.material_name = parts[0].trim();
  for (const p of parts.slice(1)) {
    // qty + unit
    const qm = p.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)?$/);
    if (qm) {
      row.quantity = qm[1];
      if (qm[2]) row.unit = qm[2];
      continue;
    }
    // heat number
    const hm = p.match(/(?:heat\s*(?:no\.?|#)?\s*)?([A-Z]{1,3}[-]?\d{3,})/i);
    if (hm && /heat|ht/i.test(p)) { row.heat_number = hm[1]; continue; }
    // rate / price
    const rm = p.match(/^(?:rate|price|cost|@)\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (rm) { row.unit_cost = rm[1]; continue; }
  }
  return row;
}

function extractLabeledFields(message) {
  const text = String(message || '');
  if (!text) return { fields: {}, email_cc: [], email_bcc: [], items: [] };
  const fields = {};
  const email_cc = [];
  const email_bcc = [];
  const items = [];

  const lines = text.split(/\r?\n/);
  let inSection = null; // 'items' when reading a table block

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { inSection = null; continue; }

    // Detect "Label: value" --- label may contain spaces/dashes
    const m = line.match(/^([A-Za-z][A-Za-z0-9 _\-#/]{0,30}?)\s*[:=]\s*(.*)$/);
    if (m) {
      const labelKey = m[1].toLowerCase().trim();
      const value = m[2].trim();

      // Section header (label with empty/colon-only value)
      if (SECTION_HEADERS.has(labelKey) && !value) {
        inSection = 'items';
        continue;
      }

      const targets = LABEL_MAP[labelKey];
      if (!targets) {
        // Unknown label --- ignore (do not bleed into other fields)
        inSection = null;
        continue;
      }

      const target = targets[0];

      // Multi-value fields
      if (target === 'email_cc') {
        email_cc.push(..._splitMulti(value));
        inSection = null;
        continue;
      }
      if (target === 'email_bcc') {
        email_bcc.push(..._splitMulti(value));
        inSection = null;
        continue;
      }

      // Section header with inline value? (e.g. "Items: AL6061 50 kg")
      if (SECTION_HEADERS.has(labelKey) && value) {
        const row = _parseTableRow(value);
        if (row) items.push(row);
        inSection = 'items';
        continue;
      }

      // Single-value field --- store only if not yet set (first label wins)
      if (value && !fields[target]) {
        fields[target] = value;
      }
      inSection = null;
      continue;
    }

    // Inside an items section --- parse as a table row
    if (inSection === 'items') {
      const row = _parseTableRow(line);
      if (row && (row.material_name || row.quantity)) items.push(row);
    }
  }

  return { fields, email_cc, email_bcc, items };
}

function extractEntities(message) {
  const text = String(message || '');
  const entities = {};

  // ---- Material category / grade lookup table ----
  const MATERIAL_KB = [
    { rx: /\b(aluminium|aluminum|alu|alum)\b/i,        category: 'Aluminium', defaultGrade: 'AL6061' },
    { rx: /\b(stainless\s*steel|s\.?s\.?|ss[- ]?\d{3})\b/i, category: 'Stainless Steel', defaultGrade: 'SS304' },
    { rx: /\b(mild\s*steel|m\.?s\.?|carbon\s*steel|cs)\b/i, category: 'Mild Steel', defaultGrade: 'MS' },
    { rx: /\b(steel|alloy\s*steel)\b/i,                category: 'Steel', defaultGrade: '' },
    { rx: /\b(copper|cu)\b/i,                          category: 'Copper', defaultGrade: '' },
    { rx: /\b(brass)\b/i,                              category: 'Brass', defaultGrade: '' },
    { rx: /\b(bronze)\b/i,                             category: 'Bronze', defaultGrade: '' },
    { rx: /\b(titanium|ti)\b/i,                        category: 'Titanium', defaultGrade: '' },
    { rx: /\b(inconel)\b/i,                            category: 'Inconel', defaultGrade: '' },
    { rx: /\b(monel)\b/i,                              category: 'Monel', defaultGrade: '' },
    { rx: /\b(nickel|ni)\b/i,                          category: 'Nickel', defaultGrade: '' },
    { rx: /\b(plastic|nylon|delrin|peek|teflon|ptfe|hdpe|pvc|abs)\b/i, category: 'Plastic', defaultGrade: '' },
  ];
  for (const m of MATERIAL_KB) {
    if (m.rx.test(text)) {
      entities.material_category = entities.material_category || m.category;
      entities.material_name = entities.material_name || m.category;
      // Capture explicit grade like AL6061, SS304, EN8, EN24
      const gradeMatch = text.match(/\b(al\s?\d{3,4}|ss\s?\d{3}|en\s?\d{1,3}[a-z]?|\d{4}\s*series|6061|7075|2024|304|316l?|410|420|d2|h13|p20|4140|4340|1018|1045)\b/i);
      if (gradeMatch) entities.material_grade = gradeMatch[1].replace(/\s+/g, '').toUpperCase();
      else if (m.defaultGrade) entities.material_grade = entities.material_grade || m.defaultGrade;
      break;
    }
  }

  // ---- Client name: "client: tier power", "client tier power", "for client X", "linked to client X" ----
  let clientMatch =
       text.match(/(?:linked\s+to\s+client|for\s+client|to\s+client)\s+["']?([^"',\n;]+?)["']?(?:\s*(?:,|and|with|;|$|\.|heat|qty|quantity|notes?))/i)
    || text.match(/\bclient\s*[:=]\s*["']?([^"',\n;]+?)["']?(?:\s*(?:,|and|with|;|$|\.|heat|qty|quantity|notes?))/i)
    || text.match(/\bclient\s+["']?([A-Za-z0-9][A-Za-z0-9 &.\-]{1,60}?)["']?(?:\s*(?:,|and|with|;|$|\.|heat|qty|quantity|notes?))/i);
  if (clientMatch) entities.client_name = clientMatch[1].trim();

  // ---- Vendor name ----
  let vendorMatch =
       text.match(/(?:from\s+vendor|to\s+vendor|with\s+vendor|for\s+vendor)\s+["']?([^"',\n;]+?)["']?(?:\s*(?:,|and|with|;|$|\.|qty|quantity|notes?))/i)
    || text.match(/\b(?:vendor|supplier)\s*[:=]\s*["']?([^"',\n;]+?)["']?(?:\s*(?:,|and|with|;|$|\.|qty|quantity|notes?))/i);
  if (vendorMatch) entities.vendor_name = vendorMatch[1].trim();

  // ---- Project name ----
  let projectMatch =
       text.match(/(?:for\s+project|on\s+project|to\s+project)\s+["']?([^"',\n;]+?)["']?(?:\s*(?:,|and|with|;|$|\.))/i)
    || text.match(/\bproject\s*[:=]\s*["']?([^"',\n;]+?)["']?(?:\s*(?:,|and|with|;|$|\.))/i);
  if (projectMatch) entities.project_name = projectMatch[1].trim();

  // ---- Heat number / batch number ----
  const heatMatch = text.match(/\bheat\s*(?:number|no\.?|#)?\s*[:=]?\s*([A-Za-z0-9\-]+)/i);
  if (heatMatch) entities.heat_number = heatMatch[1].trim();
  const batchMatch = text.match(/\bbatch\s*(?:number|no\.?|#)?\s*[:=]?\s*([A-Za-z0-9\-]+)/i);
  if (batchMatch) entities.batch_number = batchMatch[1].trim();

  // ---- Quantity + unit ----
  // Pattern A: "quantity 50", "qty 50", "qty: 50"
  const qtyA = text.match(/\b(?:quantity|qty)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)?/i);
  if (qtyA) {
    entities.quantity = qtyA[1];
    if (qtyA[2] && /^(kg|g|lb|lbs|nos|no|pcs|pieces?|mt|ton|tons?|litre|liter|l|ml|m|mm|cm|inch|in|ft)$/i.test(qtyA[2])) {
      entities.unit = qtyA[2].toLowerCase();
    }
  }
  // Pattern B: "50 kg", "100 nos", "5 mt" — only if quantity not already set
  if (!entities.quantity) {
    const qtyB = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(kg|grams?|lbs?|nos|no|pcs|pieces?|mt|tons?|litres?|liters?)\b/i);
    if (qtyB) {
      entities.quantity = qtyB[1];
      entities.unit = qtyB[2].toLowerCase();
    }
  }
  if (entities.unit) {
    const unitMap = { kg: 'Kg', g: 'g', lb: 'lb', lbs: 'lb', nos: 'Nos', no: 'Nos', pcs: 'Pcs', piece: 'Pcs', pieces: 'Pcs', mt: 'MT', ton: 'MT', tons: 'MT', litre: 'Litre', liter: 'Litre', l: 'Litre', ml: 'ml' };
    entities.unit = unitMap[entities.unit] || entities.unit;
  }

  // ---- Unit cost / rate ----
  const costMatch = text.match(/(?:rate|cost|price|@)\s*[:=]?\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (costMatch) entities.unit_cost = costMatch[1];

  // ---- Required date (very loose) ----
  const dateMatch = text.match(/\b(?:by|due|required\s*(?:by|on)|deadline)\s*[:=]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (dateMatch) entities.required_date = dateMatch[1];

  // ---- Notes / remarks ----
  const notesMatch = text.match(/\b(?:notes?|remarks?|comments?)\s*[:=]\s*([^,;.\n]+)/i);
  if (notesMatch) entities.notes = notesMatch[1].trim();

  // ---- Contact info: phone, email, GST, contact person ----
  // Phone: 10+ consecutive digits, optionally with +country code, spaces, dashes
  const phoneMatch = text.match(/(?:phone|mobile|contact\s*(?:no|number|#)?|tel|cell|ph)\s*[:=#]?\s*(\+?[0-9][0-9\s\-]{8,15}[0-9])/i)
    || text.match(/\b(\+?\d{1,3}[\s\-]?\d{10}|\d{10})\b/);
  if (phoneMatch) entities.phone = phoneMatch[1].replace(/[\s\-]/g, '').trim();

  // Email
  const emailMatch = text.match(/\b([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/);
  if (emailMatch) entities.email = emailMatch[1].trim();

  // GST (India: 15-char alphanumeric)
  const gstMatch = text.match(/\b(?:gst(?:in)?|gst\s*no\.?|tax\s*id)\s*[:=#]?\s*([0-9A-Z]{10,15})\b/i)
    || text.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d])\b/i);
  if (gstMatch) entities.gst = gstMatch[1].toUpperCase().trim();

  // Contact person: "contact person: John", "contact: John Smith"
  const contactMatch = text.match(/\b(?:contact\s*person|contact\s+name|attn|attention)\s*[:=]\s*([A-Za-z][A-Za-z .'\-]{1,40})/i)
    || text.match(/\bcontact\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b(?!\s*(?:no|number|#|:|=))/);
  if (contactMatch) entities.contact_person = contactMatch[1].trim();

  // Address: "address: ..." until end-of-line / semicolon
  const addressMatch = text.match(/\b(?:address|addr|location)\s*[:=]\s*([^;\n]+?)(?:\s*(?:;|$|,\s*(?:phone|email|gst|contact)))/i);
  if (addressMatch) entities.address = addressMatch[1].trim();

  // ---- Strict label-based pass --- overrides heuristics for any field
  // the user explicitly labeled. Also captures email_cc list and item rows.
  const { fields: labeled, email_cc, email_bcc, items } = extractLabeledFields(text);

  // Resolve context-sensitive placeholders (`Name:` / `Company:` alone)
  if (labeled._name && !labeled.vendor_name && !labeled.client_name && !labeled.project_name) {
    const lower = text.toLowerCase();
    if (/\b(vendor|supplier)\b/.test(lower))      labeled.vendor_name = labeled._name;
    else if (/\b(client|customer|buyer)\b/.test(lower)) labeled.client_name = labeled._name;
    else if (/\bproject\b/.test(lower))           labeled.project_name = labeled._name;
  }
  delete labeled._name;
  if (labeled._company_name) {
    const lower = text.toLowerCase();
    if (/\b(vendor|supplier)\b/.test(lower) && !labeled.vendor_name) labeled.vendor_name = labeled._company_name;
    else if (!labeled.client_name && /\b(client|customer)\b/.test(lower)) labeled.client_name = labeled._company_name;
    delete labeled._company_name;
  }

  // Labeled values WIN --- guarantees no wrong mapping from unrelated text
  for (const [k, v] of Object.entries(labeled)) {
    if (v !== undefined && v !== null && v !== '') entities[k] = v;
  }
  // If user used "Email CC", make sure top-level email is NOT a CC value
  if (email_cc.length) {
    entities.email_cc = email_cc;
    if (entities.email && email_cc.includes(entities.email)) {
      // Heuristic email matched a CC line --- clear it; require explicit Email: label
      if (!labeled.email) delete entities.email;
    }
  }
  if (email_bcc.length) entities.email_bcc = email_bcc;
  if (items.length) entities.items = items;

  return entities;
}

function detectIntent(message) {
  const m = message.toLowerCase().trim();
  // Run universal entity extractor once per message
  const E = extractEntities(message);

  if (/^(hi+|hello+|hey+|yo+|sup|what'?s?\s*up|good\s*(morning|afternoon|evening|night)|howdy|greetings|namaste|namaskar|hola)\b/i.test(m))
    return { type: 'greeting' };

  if (/\b(thanks|thank\s*you|thx|ty|cheers|appreciate)\b/i.test(m))
    return { type: 'thanks' };

  // ------ Small-talk / personal questions about the AI ------
  // "what is your name", "who are you", "who made you", "are you a bot", etc.
  if (/(?:what(?:'s| is)?\s+your\s+name|who\s+are\s+you|your\s+name\s*\??|tell\s+me\s+(?:your|about\s+your(?:self)?)|introduce\s+yourself|are\s+you\s+(?:a\s+)?(?:bot|ai|robot|human|real)|who\s+(?:made|built|created|developed)\s+you)/i.test(m))
    return { type: 'smalltalk', sub: 'identity' };

  // "how are you", "how's it going", "are you ok", "how do you feel"
  if (/(?:how\s+(?:are|r)\s+(?:you|u)|how(?:'s|\s+is)\s+it\s+going|how(?:'s|\s+is)\s+(?:your\s+day|things)|you\s+(?:doing\s+)?(?:ok|okay|fine|good|alright)|hru)/i.test(m))
    return { type: 'smalltalk', sub: 'how_are_you' };

  // "what can you do" / "what do you do" -- already handled by 'capabilities' below, leave

  // "what time / date is it"
  if (/^(?:what(?:'s| is)?\s+the\s+(?:time|date|day)|current\s+(?:time|date)|today'?s?\s+date)/i.test(m))
    return { type: 'smalltalk', sub: 'time' };

  // Affirmative-only or negative-only short replies (when no pending action)
  if (/^(?:ok+(?:ay)?|okk+|got\s*it|cool|nice|great|awesome|fine|alright|sure|hmm+|hmmk|👍|👌)\s*[.!]?$/i.test(m))
    return { type: 'smalltalk', sub: 'ack' };

  // "already given" / "i already told you" / "check above"
  if (/^(?:already\s+(?:given|told|provided|said)|i\s+(?:already\s+)?(?:told|gave|provided)\s+(?:you|that)|check\s+(?:above|the\s+message|previous)|see\s+(?:above|previous)|read\s+(?:above|my\s+(?:message|input)))/i.test(m))
    return { type: 'smalltalk', sub: 'already_given' };

  if (/what\s+(can\s+you\s+do|are\s+your\s+(capabilit|feature|skill))|help\s*$|how\s+can\s+you\s+help|what\s+do\s+you\s+know/i.test(m))
    return { type: 'capabilities' };

  if (/^(bye|goodbye|see\s*ya|later|ciao|peace\s*out)\b/i.test(m))
    return { type: 'farewell' };

  if (/quick\s*action|shortcut|button/i.test(m))
    return { type: 'quickActions' };

  // ------ List / show master-data libraries (mid-conversation lookup) ------
  if (/^(?:list|show|display|fetch|give\s+me|let\s+me\s+see)\s+(?:me\s+|the\s+|all\s+)?(?:material(?:s)?(?:\s+library)?|inventory|stock)\b/i.test(m)
      || /\bmaterial\s+library\b/i.test(m)) {
    return { type: 'tool_call', tool: 'list_materials', params: { limit: 20 } };
  }
  if (/^(?:list|show|display|fetch|give\s+me|let\s+me\s+see)\s+(?:me\s+|the\s+|all\s+)?(?:vendor|supplier)s?\b/i.test(m)) {
    return { type: 'tool_call', tool: 'list_vendors', params: { limit: 20 } };
  }
  if (/^(?:list|show|display|fetch|give\s+me|let\s+me\s+see)\s+(?:me\s+|the\s+|all\s+)?clients?\b/i.test(m)) {
    return { type: 'tool_call', tool: 'list_clients', params: { limit: 20 } };
  }
  if (/^(?:list|show|display|fetch|give\s+me|let\s+me\s+see)\s+(?:me\s+|the\s+|all\s+)?projects?\b/i.test(m)) {
    return { type: 'tool_call', tool: 'list_projects', params: { limit: 20 } };
  }

  // ------ Analytics / Business Questions (BEFORE navigation) ------
  if (/(?:daily\s+summary|today'?s?\s+summary|morning\s+brief|business\s+summary|overview\s+today)/i.test(m))
    return { type: 'tool_call', tool: 'get_daily_summary', params: {} };

  if (/(?:how\s+(?:is|are)\s+(?:the\s+)?(?:company|business|we)\s+(?:doing|performing)|company\s+performance|business\s+performance|revenue\s+report)/i.test(m))
    return { type: 'tool_call', tool: 'get_revenue_report', params: {} };

  if (/(?:profit|margin|cost\s+analysis|profit\s+report|how\s+much\s+(?:profit|money))/i.test(m))
    return { type: 'tool_call', tool: 'get_profit_report', params: {} };

  if (/(?:active\s+order|order(?:s)?\s+in\s+production|pending\s+order|current\s+order)/i.test(m))
    return { type: 'tool_call', tool: 'get_active_orders', params: {} };

  if (/(?:material\s+usage|material\s+consumption|how\s+much\s+.*(?:used|consumed|left|remaining|stock|inventory))/i.test(m)) {
    const matMatch = m.match(/(?:how\s+much\s+)(.+?)(?:\s+(?:do\s+we|have|is|are|left|remaining|used|consumed|in\s+stock))/i);
    const mat = matMatch ? matMatch[1].replace(/\b(the|our|any|some)\b/g, '').trim() : '';
    if (mat && !mat.match(/^(material|stock|inventory)$/))
      return { type: 'tool_call', tool: 'view_stock', params: { material_name: mat } };
    return { type: 'tool_call', tool: 'get_material_usage', params: {} };
  }

  if (/(?:how\s+did|performance\s+of|how\s+(?:is|was))\s+(?:this\s+)?project/i.test(m))
    return { type: 'tool_call', tool: 'get_project_performance', params: {}, needs: ['project_id'] };

  // ------ Operational Commands ------
  // Create project
  if (/(?:create|add|new|make|start)\s+(?:a\s+)?(?:new\s+)?project/i.test(m)) {
    const params = {};
    // Try to extract project name from quotes or after "called/named"
    const nameMatch = m.match(/(?:called|named|for|:)\s+["']?([^"'\n,]+)["']?/i) || m.match(/"([^"]+)"/);
    if (nameMatch) params.project_name = nameMatch[1].trim();
    // Try to extract client
    const clientMatch = m.match(/(?:client|customer|for)\s+(?:is\s+)?["']?([A-Za-z0-9\s&]+?)["']?(?:\s*,|\s*$|\s+with|\s+and|\s+project)/i);
    if (clientMatch && !params.project_name) params.client_name = clientMatch[1].trim();
    else if (clientMatch) params.client_name = clientMatch[1].trim();
    return { type: 'action', tool: 'create_project', params, needs: params.project_name ? [] : ['project_name', 'client_id'] };
  }

  // Create estimation
  if (/(?:create|add|new|make|start)\s+(?:a\s+)?(?:new\s+)?estimat/i.test(m)) {
    const params = {};
    const projMatch = m.match(/(?:for|project)\s+["']?([^"'\n,]+?)["']?(?:\s*,|\s*$)/i);
    if (projMatch) params.project_name = projMatch[1].trim();
    return { type: 'action', tool: 'create_estimation', params, needs: params.project_name ? [] : ['project_id'] };
  }

  // Generate quotation / quote
  if (/(?:generat|create|make|send|prepare)\s+(?:a\s+)?(?:new\s+)?quot(?:ation|e)/i.test(m)) {
    const params = {};
    const projMatch = m.match(/(?:for|project)\s+["']?([^"'\n,]+?)["']?(?:\s*,|\s*$)/i);
    if (projMatch) params.project_name = projMatch[1].trim();
    const clientMatch = m.match(/(?:client|customer)\s+(?:is\s+)?["']?([A-Za-z0-9\s&]+?)["']?(?:\s*,|\s*$)/i);
    if (clientMatch) params.client_name = clientMatch[1].trim();
    // Handle misspellings: "qoute", "qutation"
    return { type: 'action', tool: 'generate_quotation', params, needs: params.project_name ? [] : ['project_id'] };
  }

  // Send RFQ
  if (/(?:send|create|prepare|make)\s+(?:a\s+)?(?:new\s+)?rfq/i.test(m)) {
    const params = {};
    return { type: 'action', tool: 'create_rfq', params, needs: ['project_id', 'vendor_id'] };
  }

  // Create vendor PO
  if (/(?:create|make|generate|prepare)\s+(?:a\s+)?(?:new\s+)?vendor\s+(?:po|purchase\s+order)/i.test(m)) {
    const params = {};
    return { type: 'action', tool: 'create_vendor_po', params, needs: ['project_id', 'vendor_id'] };
  }

  // Generate invoice
  if (/(?:generat|create|make|prepare)\s+(?:a\s+)?(?:new\s+)?invoice/i.test(m)) {
    const params = {};
    const projMatch = m.match(/(?:for|project)\s+["']?([^"'\n,]+?)["']?(?:\s*,|\s*$)/i);
    if (projMatch) params.project_name = projMatch[1].trim();
    return { type: 'action', tool: 'generate_invoice', params, needs: params.project_name ? [] : ['project_id'] };
  }

  // Create work order
  if (/(?:create|make|generate)\s+(?:a\s+)?(?:new\s+)?work\s*order/i.test(m)) {
    const params = {};
    return { type: 'action', tool: 'create_work_order', params, needs: ['project_id'] };
  }

  // Upload document
  if (/(?:upload|attach|add)\s+(?:a\s+)?document/i.test(m)) {
    return { type: 'action', tool: 'upload_document', params: {}, needs: ['project_id'] };
  }

  // Download document
  if (/(?:download|get|fetch)\s+(?:a\s+)?(?:the\s+)?document/i.test(m)) {
    return { type: 'action', tool: 'download_document', params: {}, needs: ['document_id'] };
  }

  // Download quotation PDF
  if (/(?:download|get|export)\s+(?:a\s+)?(?:the\s+)?quot(?:ation|e)\s*(?:pdf)?/i.test(m)) {
    const params = {};
    const projMatch = m.match(/(?:for|project)\s+["']?([^"'\n,]+?)["']?(?:\s*,|\s*$)/i);
    if (projMatch) params.project_name = projMatch[1].trim();
    return { type: 'action', tool: 'generate_quotation_pdf', params, needs: params.project_name ? [] : ['project_id'] };
  }

  // Send vendor PO
  if (/(?:send)\s+(?:a\s+)?(?:the\s+)?vendor\s+(?:po|purchase\s+order)/i.test(m)) {
    return { type: 'action', tool: 'send_vendor_po', params: {}, needs: ['vendor_po_id'] };
  }

  // Upload vendor quote
  if (/(?:upload|attach|add)\s+(?:a\s+)?vendor\s+quot(?:e|ation)/i.test(m)) {
    return { type: 'action', tool: 'upload_vendor_quote', params: {}, needs: ['vendor_id'] };
  }

  // Send invoice
  if (/(?:send|email)\s+(?:a\s+)?(?:the\s+)?invoice/i.test(m)) {
    return { type: 'action', tool: 'send_invoice', params: {}, needs: ['invoice_id'] };
  }

  // Update / edit estimation
  if (/(?:update|edit|modify|change)\s+(?:a\s+)?(?:the\s+)?estimat/i.test(m)) {
    const params = {};
    const projMatch = m.match(/(?:for|project)\s+["']?([^"'\n,]+?)["']?(?:\s*,|\s*$)/i);
    if (projMatch) params.project_name = projMatch[1].trim();
    return { type: 'action', tool: 'update_estimation', params, needs: params.project_name ? [] : ['project_id'] };
  }

  // Add material to estimation
  if (/(?:add)\s+(?:a\s+)?(?:new\s+)?material\s+(?:to\s+)?estimat/i.test(m)) {
    return { type: 'action', tool: 'add_estimation_material', params: {}, needs: ['project_id', 'material_id', 'quantity'] };
  }

  // Update / edit stock
  if (/(?:update|edit|change|modify)\s+(?:a\s+)?(?:the\s+)?stock/i.test(m)) {
    return { type: 'action', tool: 'update_stock', params: {}, needs: ['material_id', 'quantity'] };
  }

  // Edit project
  if (/(?:edit|modify|change|update)\s+(?:a\s+)?(?:the\s+)?project(?!\s+status)/i.test(m)) {
    const params = {};
    const nameMatch = m.match(/(?:called|named|for|:)\s+["']?([^"'\n,]+)["']?/i) || m.match(/"([^"]+)"/);
    if (nameMatch) params.project_name = nameMatch[1].trim();
    return { type: 'action', tool: 'edit_project', params, needs: params.project_name ? [] : ['project_id'] };
  }

  // Approve project / advance stage
  if (/(?:approve|advance|promote|move\s+forward)\s+(?:a\s+)?(?:the\s+)?project/i.test(m)) {
    const params = {};
    const nameMatch = m.match(/(?:called|named|for|:)\s+["']?([^"'\n,]+)["']?/i) || m.match(/"([^"]+)"/);
    if (nameMatch) params.project_name = nameMatch[1].trim();
    return { type: 'action', tool: 'approve_project', params, needs: params.project_name ? [] : ['project_id'] };
  }

  // Edit client
  if (/(?:edit|modify|change|update)\s+(?:a\s+)?(?:the\s+)?client/i.test(m)) {
    const params = {};
    const nameMatch = m.match(/(?:called|named)\s+["']?([^"'\n,]+)["']?/i);
    if (nameMatch) params.client_name = nameMatch[1].trim();
    return { type: 'action', tool: 'edit_client', params, needs: params.client_name ? [] : ['client_id'] };
  }

  // Edit vendor
  if (/(?:edit|modify|change|update)\s+(?:a\s+)?(?:the\s+)?vendor/i.test(m)) {
    const params = {};
    const nameMatch = m.match(/(?:called|named)\s+["']?([^"'\n,]+)["']?/i);
    if (nameMatch) params.company_name = nameMatch[1].trim();
    return { type: 'action', tool: 'edit_vendor', params, needs: params.company_name ? [] : ['vendor_id'] };
  }

  // Create client
  if (/(?:create|add|new|register)\s+(?:a\s+)?(?:new\s+)?client/i.test(m)) {
    const params = {};
    const nameMatch = m.match(/(?:called|named|for)\s+["']?([^"'\n,]+?)["']?(?:\s*$|\s+with|\s+,|\s+and)/i);
    if (nameMatch) params.client_name = nameMatch[1].trim();
    else if (E.client_name) params.client_name = E.client_name;
    if (E.contact_person) params.contact_person = E.contact_person;
    if (E.phone) params.phone = E.phone;
    if (E.email) params.email = E.email;
    if (E.gst) params.tax_id = E.gst;
    if (E.address) params.address = E.address;
    if (E.payment_terms) params.payment_terms = E.payment_terms;
    if (E.email_cc) params.email_cc = E.email_cc;
    return { type: 'action', tool: 'create_client', params, needs: params.client_name ? [] : ['client_name'] };
  }

  // Create vendor
  if (/(?:create|add|new|register)\s+(?:a\s+)?(?:new\s+)?(?:vendor|supplier)/i.test(m)) {
    const params = {};
    const nameMatch = m.match(/(?:called|named|for)\s+["']?([^"'\n,]+?)["']?(?:\s*$|\s+with|\s+,|\s+and)/i);
    if (nameMatch) params.vendor_name = nameMatch[1].trim();
    else if (E.vendor_name) params.vendor_name = E.vendor_name;
    if (E.contact_person) params.contact_person = E.contact_person;
    if (E.phone) params.phone = E.phone;
    if (E.email) params.email = E.email;
    if (E.gst) params.tax_id = E.gst;
    if (E.address) params.address = E.address;
    if (E.payment_terms) params.payment_terms = E.payment_terms;
    if (E.email_cc) params.email_cc = E.email_cc;
    return { type: 'action', tool: 'create_vendor', params, needs: params.vendor_name ? [] : ['vendor_name'] };
  }

  // Create raw material / material master --- expert mode: extract everything possible
  // If the user mentions inventory/stock/quantity/heat number, treat it as a combined
  // create-material-and-stock-it operation routed through create_inventory_item which
  // creates the Material AND the MaterialStock entry.
  const isMaterialIntent = /(?:create|add|new|register)\s+(?:a\s+)?(?:new\s+)?(?:raw\s+)?material/i.test(m);
  const wantsInventory   = /(?:inventory|stock|qty|quantity|heat\s*(?:no|number|#)?)/i.test(m);

  // Short-form replies to the "raw material vs finished part" clarification
  const isShortRawMaterial = /^\s*(?:raw\s+material|raw|material)\s*[.!?]?\s*$/i.test(m);
  const isShortFinishedPart = /^\s*(?:finished\s+part|finished|part(?:\s+master)?|component)\s*[.!?]?\s*$/i.test(m);
  if (isShortFinishedPart) {
    return { type: 'action', tool: 'create_part', params: {}, needs: ['part_name'] };
  }
  if (isShortRawMaterial && !isMaterialIntent) {
    return { type: 'action', tool: 'create_material', params: {}, needs: ['material_category', 'material_grade'] };
  }

  // Disambiguation --- bare "create material" with no qualifier and no extracted hint
  // Spec: ask raw material vs finished part
  const isBareMaterial = /^\s*(?:please\s+)?(?:create|add|new|register)\s+(?:a\s+)?(?:new\s+)?material\s*[.!?]?\s*$/i.test(m);
  if (isBareMaterial && !E.material_category && !E.material_grade && !wantsInventory) {
    return {
      type: 'clarify',
      message: `Sure --- I can help with that. Do you want to:\n\n  1. **Create a raw material** (e.g. Aluminium AL6061, Stainless Steel SS304) for your inventory / material library, or\n  2. **Create a finished part / job master** (a manufactured component)?\n\nReply with **raw material** or **finished part**.`,
      suggestions: ['raw material', 'finished part', 'cancel'],
    };
  }

  if (isMaterialIntent) {
    const params = {};
    if (E.material_category) params.material_category = E.material_category;
    if (E.material_grade) params.material_grade = E.material_grade;
    if (E.client_name) params.client_name = E.client_name;
    if (E.vendor_name) params.vendor_name = E.vendor_name;
    if (E.heat_number) params.heat_number = E.heat_number;
    if (E.batch_number) params.batch_number = E.batch_number;
    if (E.notes) params.notes = E.notes;

    // If user specified quantity/inventory intent --- route through inventory tool
    if (wantsInventory && (E.quantity || E.heat_number || /inventory|stock/i.test(m))) {
      const itemName = [E.material_category, E.material_grade].filter(Boolean).join(' ').trim()
        || E.material_name || '';
      if (itemName) params.item_name = itemName;
      params.category = 'raw_material';
      if (E.unit) params.unit = E.unit; else params.unit = 'Kg';
      if (E.quantity) params.quantity = E.quantity;
      // Stash heat number / client info into description for traceability
      const traceParts = [];
      if (E.heat_number) traceParts.push(`Heat #${E.heat_number}`);
      if (E.batch_number) traceParts.push(`Batch ${E.batch_number}`);
      if (E.client_name) traceParts.push(`Client: ${E.client_name}`);
      if (E.vendor_name) traceParts.push(`Vendor: ${E.vendor_name}`);
      if (E.notes) traceParts.push(E.notes);
      if (traceParts.length) params.description = traceParts.join(' | ');
      const needs = ['item_name', 'category', 'unit', 'quantity'].filter(p => !params[p]);
      return { type: 'action', tool: 'create_inventory_item', params, needs };
    }

    // Plain master entry (no quantity / no inventory hint)
    const needs = ['material_category', 'material_grade'].filter(p => !params[p]);
    return { type: 'action', tool: 'create_material', params, needs };
  }

  // Create part / job master
  if (/(?:create|add|new|register)\s+(?:a\s+)?(?:new\s+)?(?:part|job)(?:\s+master)?\b/i.test(m)) {
    const params = {};
    const nameMatch = m.match(/(?:called|named|for)\s+["']?([^"'\n,]+?)["']?(?:\s*$|\s+with|\s+,)/i);
    if (nameMatch) params.part_name = nameMatch[1].trim();
    if (E.material_grade) params.material_grade = E.material_grade;
    return { type: 'action', tool: 'create_part', params, needs: params.part_name ? [] : ['part_name'] };
  }

  // Create RFQ (Procurement → RFQ)
  if (/(?:create|add|new|raise|generate|send)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:rfq|request\s+for\s+(?:quote|quotation))/i.test(m)) {
    const params = {};
    if (E.vendor_name) params.vendor_name = E.vendor_name;
    if (E.material_name || E.material_category) params.material_name = E.material_name || E.material_category;
    if (E.quantity) params.required_quantity = E.quantity;
    if (E.project_name) params.project_name = E.project_name;
    if (E.required_date) params.required_date = E.required_date;
    if (E.notes) params.notes = E.notes;
    return { type: 'action', tool: 'create_rfq', params, needs: ['vendor_name', 'material_name', 'required_quantity'].filter(p => !params[p]) };
  }

  // Create Purchase Order (Procurement → PO)
  if (/(?:create|add|new|raise|generate|issue|send)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:po|purchase\s+order)/i.test(m)) {
    const params = {};
    if (E.vendor_name) params.vendor_name = E.vendor_name;
    if (E.project_name) params.project_name = E.project_name;
    if (E.material_category || E.material_grade) {
      params.item_description = [E.material_category, E.material_grade].filter(Boolean).join(' ').trim();
    }
    if (E.quantity) params.quantity = E.quantity;
    if (E.unit_cost) params.unit_cost = E.unit_cost;
    if (E.notes) params.notes = E.notes;
    return { type: 'action', tool: 'create_purchase_order', params, needs: ['vendor_name', 'project_name', 'item_description', 'quantity', 'unit_cost'].filter(p => !params[p]) };
  }

  // Add Inventory Item (Inventory → Material)
  if (/(?:create|add|new|register)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:inventory|stock)(?:\s+item)?\b/i.test(m)
      || /(?:add|create)\s+(?:a\s+|an\s+)?(?:new\s+)?item\s+(?:to|in)\s+(?:the\s+)?(?:inventory|stock)/i.test(m)) {
    const params = {};
    const nameMatch = m.match(/(?:called|named)\s+["']?([^"'\n,]+?)["']?(?:\s*$|\s+with|\s+,)/i);
    if (nameMatch) params.item_name = nameMatch[1].trim();
    else if (E.material_category) params.item_name = [E.material_category, E.material_grade].filter(Boolean).join(' ').trim();
    if (E.material_category) params.category = 'raw_material';
    if (E.unit) params.unit = E.unit;
    if (E.quantity) params.quantity = E.quantity;
    const traceParts = [];
    if (E.heat_number) traceParts.push(`Heat #${E.heat_number}`);
    if (E.batch_number) traceParts.push(`Batch ${E.batch_number}`);
    if (E.client_name) traceParts.push(`Client: ${E.client_name}`);
    if (E.vendor_name) traceParts.push(`Vendor: ${E.vendor_name}`);
    if (E.notes) traceParts.push(E.notes);
    if (traceParts.length) params.description = traceParts.join(' | ');
    return { type: 'action', tool: 'create_inventory_item', params, needs: ['item_name', 'category', 'unit', 'quantity'].filter(p => !params[p]) };
  }

  // ------ Approve / confirm pending action ------
  if (/^(yes|approve|confirm|go\s+ahead|proceed|do\s+it|execute|ok|okay|sure|let'?s?\s+go)\s*[.!]*$/i.test(m))
    return { type: 'approve' };

  if (/^(no|cancel|nevermind|never\s*mind|abort|stop|nah|nope|don'?t)\s*[.!]*$/i.test(m))
    return { type: 'cancel' };

  if (/^(edit|change|modify|update)\s*/i.test(m))
    return { type: 'edit_pending', detail: m };

  // ------ Existing intents (navigation, query, etc.) ------
  if (/(?:how\s+(?:do\s+i|to|can\s+i)\s+(?:go\s+to|navigate\s+to|find|open|access|get\s+to|reach)|where\s+(?:is|can\s+i\s+find)|take\s+me\s+to|show\s+me\s+the|open|go\s+to|navigate\s+to)\s+(.+)/i.test(m)) {
    const target = RegExp.$1.replace(/[?.!]+$/, '').trim();
    return { type: 'navigation', target };
  }

  if (/how\s+many\s+(.+)/i.test(m)) {
    const entity = RegExp.$1.replace(/[?.!]+$/, '').trim();
    return { type: 'count', entity };
  }

  if (/(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:status|state|progress|stage)\s+of|status\s+of|how\s+(?:is|are)\s+(?:the\s+)?)\s*(.+)/i.test(m)) {
    const entity = RegExp.$1.replace(/[?.!]+$/, '').trim();
    return { type: 'status', entity };
  }

  if (/(?:show|list|view|find|display|get|see|check)\s+(?:all\s+|my\s+|the\s+|recent\s+|latest\s+)?(.+)/i.test(m)) {
    const entity = RegExp.$1.replace(/[?.!]+$/, '').trim();

    // Map common list queries to tool calls
    if (/project/i.test(entity)) {
      const statusMatch = entity.match(/(pending|estimated|quoted|confirmed|production|inspected|shipped|completed|active|draft)/i);
      return { type: 'tool_call', tool: 'list_projects', params: statusMatch ? { status: statusMatch[1] } : {} };
    }
    if (/client|customer/i.test(entity))
      return { type: 'tool_call', tool: 'list_clients', params: {} };
    if (/vendor|supplier/i.test(entity))
      return { type: 'tool_call', tool: 'list_vendors', params: {} };
    if (/stock|inventory/i.test(entity))
      return { type: 'tool_call', tool: 'view_stock', params: {} };
    if (/analytic|revenue|dashboard/i.test(entity))
      return { type: 'tool_call', tool: 'get_daily_summary', params: {} };
    if (/document/i.test(entity)) {
      return { type: 'action', tool: 'list_documents', params: {}, needs: ['project_id'] };
    }

    return { type: 'query', entity };
  }

  if (/(?:what\s+(?:is|are)|tell\s+me\s+about|explain|describe|how\s+does)\s+(.+)/i.test(m)) {
    const entity = RegExp.$1.replace(/[?.!]+$/, '').trim();
    return { type: 'explain', entity };
  }

  if (/workflow|process|steps|procedure|lifecycle|next\s+step|what'?s?\s+next/i.test(m))
    return { type: 'workflow' };

  if (/error|problem|issue|can'?t|cannot|doesn'?t|not\s+working|stuck|trouble|bug|fail|broken|wrong|help\s+me\s+with/i.test(m))
    return { type: 'troubleshoot', detail: m };

  if (/suggest|recommendation|what\s+(?:should|can)\s+i\s+do|tip|advice|idea/i.test(m))
    return { type: 'suggest' };

  // -------------------------------------------------------------------------
  // STRUCTURED-DATA INFERENCE  (last resort before 'general')
  // -------------------------------------------------------------------------
  // If the user pasted data WITHOUT an explicit verb (e.g. "vendor ABC,
  // contact John, phone 9876543210, gst 33ABCDE1234F1Z5"), treat it as a
  // CREATE request rather than falling through to module info / help.
  // We require at least 2 distinct data signals to avoid false positives.
  const firstItem = (E.items && E.items[0]) || null;
  const dataSignals = [
    E.vendor_name, E.client_name, E.project_name,
    E.material_category, E.material_grade, E.material_name,
    E.quantity, E.unit_cost, E.heat_number, E.batch_number,
    E.required_date, E.phone, E.email, E.gst, E.pan,
    E.contact_person, E.address, E.payment_terms,
    E.part_name, E.part_number, E.item_name,
    firstItem ? 'items' : null,
    (E.email_cc && E.email_cc.length) ? 'cc' : null,
  ].filter(Boolean).length;

  // Strong contact indicators are themselves enough (phone OR email OR gst)
  const hasContactInfo = !!(E.phone || E.email || E.gst);

  if (dataSignals >= 2 || hasContactInfo) {
    // Decide which entity to create based on context keywords + extracted data
    const mentionsVendor   = /\b(vendor|supplier)\b/i.test(m);
    const mentionsClient   = /\b(client|customer|buyer)\b/i.test(m);
    const mentionsMaterial = /\b(material|raw\s+material|inventory|stock)\b/i.test(m)
                              || E.material_category || E.material_grade;
    const mentionsRfq      = /\brfq\b/i.test(m);
    const mentionsPo       = /\b(purchase\s+order|\bpo\b)\b/i.test(m);
    const mentionsProject  = /\bproject\b/i.test(m);
    const mentionsPart     = /\b(part|job)\s*(?:master|number|#|name)?/i.test(m) || E.part_name || E.part_number;

    // 1) RFQ --- vendor + material + qty (or items table)
    if (mentionsRfq || (E.vendor_name && (E.material_category || E.material_name || firstItem) && (E.quantity || firstItem?.quantity))) {
      const params = {};
      if (E.vendor_name) params.vendor_name = E.vendor_name;
      const matName = E.material_name || E.material_category || firstItem?.material_name;
      if (matName) params.material_name = matName;
      const reqQty = E.quantity || firstItem?.quantity;
      if (reqQty) params.required_quantity = reqQty;
      const u = E.unit || firstItem?.unit;
      if (u) params.unit = u;
      if (E.project_name) params.project_name = E.project_name;
      if (E.required_date) params.required_date = E.required_date;
      if (E.notes) params.notes = E.notes;
      if (E.email_cc) params.email_cc = E.email_cc;
      if (E.items && E.items.length > 1) params.items = E.items;
      return { type: 'action', tool: 'create_rfq', params, needs: ['vendor_name', 'material_name', 'required_quantity'].filter(p => !params[p]) };
    }

    // 2) Purchase Order --- vendor + project + item + cost
    if (mentionsPo || (E.vendor_name && (E.unit_cost || firstItem?.unit_cost) && (E.quantity || firstItem?.quantity))) {
      const params = {};
      if (E.vendor_name) params.vendor_name = E.vendor_name;
      if (E.project_name) params.project_name = E.project_name;
      const itemDesc = [E.material_category, E.material_grade].filter(Boolean).join(' ').trim()
        || E.material_name || E.item_name || firstItem?.material_name;
      if (itemDesc) params.item_description = itemDesc;
      const qty = E.quantity || firstItem?.quantity;
      if (qty) params.quantity = qty;
      const cost = E.unit_cost || firstItem?.unit_cost;
      if (cost) params.unit_cost = cost;
      if (E.notes) params.notes = E.notes;
      if (E.tax_type) params.tax_type = E.tax_type;
      if (E.email_cc) params.email_cc = E.email_cc;
      if (E.items && E.items.length > 1) params.items = E.items;
      return { type: 'action', tool: 'create_purchase_order', params, needs: ['vendor_name', 'project_name', 'item_description', 'quantity', 'unit_cost'].filter(p => !params[p]) };
    }

    // 3) Inventory --- material + qty (+ optional heat/batch/vendor)
    if (mentionsMaterial && (E.quantity || firstItem?.quantity)) {
      const params = {};
      const itemName = E.item_name
        || [E.material_category, E.material_grade].filter(Boolean).join(' ').trim()
        || E.material_name
        || firstItem?.material_name
        || '';
      if (itemName) params.item_name = itemName;
      params.category = 'raw_material';
      params.unit = E.unit || firstItem?.unit || 'Kg';
      const qty = E.quantity || firstItem?.quantity;
      if (qty) params.quantity = qty;
      if (E.material_grade) params.grade = E.material_grade;
      if (E.unit_cost) params.default_cost = E.unit_cost;
      const traceParts = [];
      const heat = E.heat_number || firstItem?.heat_number;
      if (heat) traceParts.push(`Heat #${heat}`);
      if (E.batch_number) traceParts.push(`Batch ${E.batch_number}`);
      if (E.client_name) traceParts.push(`Client: ${E.client_name}`);
      if (E.vendor_name) traceParts.push(`Vendor: ${E.vendor_name}`);
      if (E.notes) traceParts.push(E.notes);
      if (E.description) traceParts.push(E.description);
      if (traceParts.length) params.description = traceParts.join(' | ');
      if (E.items && E.items.length > 1) params.items = E.items;
      return { type: 'action', tool: 'create_inventory_item', params, needs: ['item_name', 'category', 'unit', 'quantity'].filter(p => !params[p]) };
    }

    // 4) Raw material master --- category + grade
    if (mentionsMaterial && (E.material_category || E.material_grade)) {
      const params = {};
      if (E.material_category) params.material_category = E.material_category;
      if (E.material_grade) params.material_grade = E.material_grade;
      if (E.unit_cost) params.cost_per_unit = E.unit_cost;
      if (E.notes) params.notes = E.notes;
      return { type: 'action', tool: 'create_material', params, needs: ['material_category', 'material_grade'].filter(p => !params[p]) };
    }

    // 5) Part / Job master --- has part name OR explicit part mention + a number/revision
    if (mentionsPart && (E.part_name || E.part_number)) {
      const params = {};
      if (E.part_name) params.part_name = E.part_name;
      if (E.part_number) params.part_number = E.part_number;
      if (E.revision) params.revision = E.revision;
      if (E.material_grade) params.material_grade = E.material_grade;
      if (E.description) params.description = E.description;
      return { type: 'action', tool: 'create_part', params, needs: params.part_name ? [] : ['part_name'] };
    }

    // 6) Vendor --- explicit vendor mention OR (contact info + no client mention)
    if (mentionsVendor || (hasContactInfo && !mentionsClient && !mentionsProject && !mentionsMaterial)) {
      const params = {};
      if (E.vendor_name) params.vendor_name = E.vendor_name;
      if (E.contact_person) params.contact_person = E.contact_person;
      if (E.phone) params.phone = E.phone;
      if (E.email) params.email = E.email;
      if (E.gst) params.tax_id = E.gst;
      if (E.address) params.address = E.address;
      if (E.payment_terms) params.payment_terms = E.payment_terms;
      if (E.email_cc) params.email_cc = E.email_cc;
      return { type: 'action', tool: 'create_vendor', params, needs: params.vendor_name ? [] : ['vendor_name'] };
    }

    // 7) Client --- explicit client mention + any data
    if (mentionsClient) {
      const params = {};
      if (E.client_name) params.client_name = E.client_name;
      if (E.contact_person) params.contact_person = E.contact_person;
      if (E.phone) params.phone = E.phone;
      if (E.email) params.email = E.email;
      if (E.gst) params.tax_id = E.gst;
      if (E.address) params.address = E.address;
      if (E.payment_terms) params.payment_terms = E.payment_terms;
      if (E.email_cc) params.email_cc = E.email_cc;
      return { type: 'action', tool: 'create_client', params, needs: params.client_name ? [] : ['client_name'] };
    }

    // 8) Project --- has project name + (client or date or notes)
    if (E.project_name && (E.client_name || E.required_date || E.notes)) {
      const params = { project_name: E.project_name };
      if (E.client_name) params.client_name = E.client_name;
      if (E.required_date) params.deadline = E.required_date;
      if (E.notes) params.notes = E.notes;
      return { type: 'action', tool: 'create_project', params, needs: [] };
    }
  }

  return { type: 'general', message: m };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  4. MODULE MATCHING
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function findModule(text) {
  const t = (text || '').toLowerCase();
  const map = {
    dashboard: 'dashboard', home: 'dashboard', overview: 'dashboard',
    project: 'projects', projects: 'projects',
    client: 'clients', clients: 'clients', customer: 'clients', customers: 'clients',
    vendor: 'vendors', vendors: 'vendors', supplier: 'vendors', suppliers: 'vendors',
    message: 'messages', messages: 'messages', chat: 'messages', inbox: 'messages',
    analytic: 'analytics', analytics: 'analytics',
    report: 'reports', reports: 'reports',
    'access control': 'accessControl', 'access-control': 'accessControl',
    user: 'accessControl', users: 'accessControl',
    permission: 'accessControl', permissions: 'accessControl',
    role: 'accessControl', roles: 'accessControl',
    'audit log': 'accessControl', 'audit logs': 'accessControl',
    security: 'accessControl',
    setting: 'settings', settings: 'settings', config: 'settings',
    risk: 'riskDashboard', 'risk dashboard': 'riskDashboard',
    approval: 'approvals', approvals: 'approvals',
    estimation: 'projects', estimate: 'projects', quotation: 'projects', quote: 'projects',
    'sales order': 'projects', 'work order': 'projects',
    production: 'projects', quality: 'projects',
    logistics: 'projects', delivery: 'projects', shipping: 'projects',
    documents: 'projects',
  };
  for (const [k, v] of Object.entries(map)) if (t.includes(k)) return v;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  5. PAGE-AWARE SUGGESTIONS
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function getPageSuggestions(currentPage) {
  const p = (currentPage || '/').toLowerCase();

  if (p === '/' || p.includes('dashboard'))
    return {
      title: '---- Dashboard tips',
      suggestions: [
        '---- Check your KPI cards for a quick pulse',
        '--- Create a new project right from here',
        '---- Use the search bar to find any project instantly',
        '---- Filter by time range to see recent activity',
        '------ Peek at the Risk Overview for potential delays',
      ],
      quickActions: [
        { label: '--- New Project', path: '/projects' },
        { label: '---- All Projects', path: '/projects' },
        { label: '---- Analytics', path: '/analytics' },
      ],
    };

  if (p.includes('projects') && !p.match(/\/projects\/\w+/))
    return {
      title: '---- Projects page tips',
      suggestions: [
        '--- Create a new project with a client assignment',
        '---- Filter projects by status using the chips above the table',
        '---- Click any project row to view its full workflow',
        '---- Track revenue and deadlines at a glance',
        '------- Use bulk select to manage multiple projects at once',
      ],
      quickActions: [
        { label: '--- New Project', path: '/projects' },
        { label: '---- View Clients', path: '/clients' },
        { label: '---- Analytics', path: '/analytics' },
      ],
    };

  if (p.match(/\/projects\/\w+/)) {
    // Detect which tab is active from hash or query
    const tabHints = [];
    if (p.includes('estimation') || p.includes('tab=2'))
      tabHints.push(
        { label: '---- Generate Quotation', action: 'generate_quotation' },
        { label: '---- Send RFQ', action: 'create_rfq' },
        { label: '---- Add Vendor Materials', action: 'create_vendor_po' },
      );
    else if (p.includes('logistics') || p.includes('tab=8'))
      tabHints.push(
        { label: '---- Generate Invoice', action: 'generate_invoice' },
        { label: '---- Prepare Packing List', action: 'packing_list' },
      );
    else if (p.includes('invoice') || p.includes('tab=9'))
      tabHints.push(
        { label: '---- Generate Invoice', action: 'generate_invoice' },
        { label: '---- Download Invoice PDF', action: 'download_invoice' },
      );

    return {
      title: '---- Project Detail tips',
      suggestions: [
        '---- Fill out the Project Info tab first',
        '---- Add estimation details (materials, labor, profit)',
        '---- After client confirmation create a Sales Order',
        '---- Track production progress in the Production tab',
        '--- Run quality inspections in the Quality tab',
        '---- Set up logistics & delivery in the Logistics tab',
        '---- Generate invoices in the Invoice tab',
        '---- Upload supporting documents in the Documents tab',
      ],
      quickActions: tabHints.length > 0 ? tabHints : [
        { label: '---- All Projects', path: '/projects' },
        { label: '---- Dashboard', path: '/' },
      ],
    };
  }

  if (p.includes('clients'))
    return {
      title: '---- Clients page tips',
      suggestions: [
        '--- Add a new client profile',
        '---- Search for existing clients',
        '---- Review client-linked projects',
        '---- Check client activity history',
      ],
      quickActions: [
        { label: '--- Add Client', path: '/clients' },
        { label: '---- Projects', path: '/projects' },
      ],
    };

  if (p.includes('vendors'))
    return {
      title: '---- Vendors page tips',
      suggestions: [
        '--- Add a new vendor / supplier',
        '---- Review vendor performance metrics',
        '------ Check vendor risk assessments',
        '---- Filter vendors by category',
      ],
      quickActions: [
        { label: '--- Add Vendor', path: '/vendors/add' },
        { label: '------ Risk Dashboard', path: '/risk-dashboard' },
      ],
    };

  if (p.includes('analytics'))
    return {
      title: '---- Analytics tips',
      suggestions: [
        '---- Review revenue trends and projections',
        '---- Analyze project completion rates',
        '---- Check resource utilization metrics',
        '---- Identify performance bottlenecks',
      ],
      quickActions: [
        { label: '---- Dashboard', path: '/' },
        { label: '---- Projects', path: '/projects' },
      ],
    };

  if (p.includes('access-control'))
    return {
      title: '---- Access Control tips',
      suggestions: [
        '---- Manage user accounts and permissions',
        '---- Review and update role definitions',
        '---- Check audit logs for recent activity',
        '------- Review security settings',
        '---- Create permission templates',
      ],
      quickActions: [
        { label: '---- Users', path: '/access-control/users' },
        { label: '---- Audit Logs', path: '/access-control/audit-logs' },
      ],
    };

  if (p.includes('settings'))
    return {
      title: '------ Settings tips',
      suggestions: [
        '---- Update your profile info',
        '---- Change your password',
        '---- Review company settings (admin)',
        '------ Configure module preferences',
      ],
      quickActions: [
        { label: '---- Dashboard', path: '/' },
        { label: '---- Access Control', path: '/access-control' },
      ],
    };

  if (p.includes('messages'))
    return {
      title: '---- Messages tips',
      suggestions: [
        '---- Start a new conversation with a team member',
        '---- Check unread messages',
        '---- Search previous conversations',
      ],
      quickActions: [
        { label: '---- Dashboard', path: '/' },
        { label: '---- Projects', path: '/projects' },
      ],
    };

  if (p.includes('report'))
    return {
      title: '---- Reports tips',
      suggestions: [
        '---- Generate a project status report',
        '---- View revenue & financial reports',
        '---- Check production status reports',
        '---- Export reports as PDF or Excel',
      ],
      quickActions: [
        { label: '---- Analytics', path: '/analytics' },
        { label: '---- Dashboard', path: '/' },
      ],
    };

  if (p.includes('risk'))
    return {
      title: '------ Risk Dashboard tips',
      suggestions: [
        '------ Review overall risk score',
        '---- Check supply chain risks',
        '--- Monitor delay probabilities',
        '---- Assess vendor risk levels',
      ],
      quickActions: [
        { label: '---- Vendors', path: '/vendors' },
        { label: '---- Projects', path: '/projects' },
      ],
    };

  return {
    title: '---- Quick tips',
    suggestions: [
      '---- Check the Dashboard for an overview',
      '---- View and manage projects',
      '---- Message a team member',
      '---- Review analytics & performance',
    ],
    quickActions: [
      { label: '---- Dashboard', path: '/' },
      { label: '---- Projects', path: '/projects' },
      { label: '---- Analytics', path: '/analytics' },
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  5-B. CONVERSATION STATE (per user pending-action tracking)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** In-memory map: userId --- { pendingAction, pendingParams, followUp, timestamp } */
const conversationState = new Map();

/** Per-user rolling chat history --- last MAX_HISTORY messages (user + assistant). */
const conversationHistory = new Map();
const MAX_HISTORY = 12;

function getState(userId) {
  return conversationState.get(userId) || null;
}
function setState(userId, state) {
  conversationState.set(userId, { ...state, timestamp: Date.now() });
}
function clearState(userId) {
  conversationState.delete(userId);
}

function getHistory(userId) {
  return conversationHistory.get(userId) || [];
}
function pushHistory(userId, role, text) {
  if (!text) return;
  const arr = conversationHistory.get(userId) || [];
  arr.push({ role, text: String(text).slice(0, 800), at: Date.now() });
  while (arr.length > MAX_HISTORY) arr.shift();
  conversationHistory.set(userId, arr);
}

/** Re-extract entities from prior USER messages and merge into pendingParams. */
function recoverFromHistory(userId, state) {
  if (!state || !state.missingParams || !state.missingParams.length) return state;
  const hist = getHistory(userId).filter(h => h.role === 'user').slice(-6);
  if (!hist.length) return state;
  const ENTITY_TO_PARAM = {
    vendor_name: 'vendor_name', client_name: 'client_name',
    project_name: 'project_name', material_name: 'material_name',
    material_category: 'material_category', material_grade: 'material_grade',
    quantity: 'quantity', unit: 'unit', unit_cost: 'unit_cost',
    heat_number: 'heat_number', batch_number: 'batch_number',
    required_date: 'required_date', notes: 'notes',
    contact_person: 'contact_person', phone: 'phone', email: 'email',
    gst: 'tax_id', address: 'address', payment_terms: 'payment_terms',
    item_name: 'item_name', part_name: 'part_name',
    part_number: 'part_number', revision: 'revision',
    description: 'description',
  };
  // Walk newest -> oldest; first sighting wins
  for (let i = hist.length - 1; i >= 0; i--) {
    let extras;
    try { extras = extractEntities(hist[i].text); } catch (_) { continue; }
    for (const [eKey, pKey] of Object.entries(ENTITY_TO_PARAM)) {
      if (extras[eKey] && state.missingParams.includes(pKey) && !state.pendingParams[pKey]) {
        state.pendingParams[pKey] = extras[eKey];
      }
    }
  }
  state.missingParams = state.missingParams.filter(p => !state.pendingParams[p]);
  return state;
}

// Auto-expire pending actions after 5 minutes.
// BACKGROUND TASK SAFETY: this interval is pure in-memory Map maintenance.
// It makes ZERO database queries. Do not add DB queries here without wrapping
// the entire callback in tenantContext.runWithTenantContext(companyId, ...) or
// tenantContext.runAsPlatformAdmin(...).
setInterval(() => {
  const now = Date.now();
  for (const [uid, s] of conversationState.entries()) {
    if (now - s.timestamp > 5 * 60 * 1000) conversationState.delete(uid);
  }
  // History expires after 30 minutes of inactivity
  for (const [uid, arr] of conversationHistory.entries()) {
    const last = arr[arr.length - 1];
    if (last && now - last.at > 30 * 60 * 1000) conversationHistory.delete(uid);
  }
}, 60_000);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  6. GEN-Z FRIENDLY RESPONSE GENERATOR
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function generateResponse(intent, currentPage, user, companyId) {
  const pageSug = getPageSuggestions(currentPage);

  switch (intent.type) {

    // ------ Clarification --- ask user to disambiguate vague intent ------
    case 'clarify': {
      return {
        message: intent.message,
        suggestions: intent.suggestions || ['cancel'],
        quickActions: pageSug.quickActions || [],
        followUp: false,
      };
    }

    // ------ NEW: Direct tool execution (analytics, lists, etc.) ---------------------------------------------
    case 'tool_call': {
      try {
        const result = await executeTool(intent.tool, intent.params || {}, user, companyId);
        return {
          message: result.message || '--- Done!',
          suggestions: result.suggestions || ['What else can I do?', 'Show workflow'],
          quickActions: pageSug.quickActions || [],
          toolResult: result,
        };
      } catch (err) {
        return {
          message: `------ Couldn't complete that request --- ${err.message || 'unknown error'}. Try again or check manually.`,
          suggestions: ['Show suggestions', 'Dashboard'],
          quickActions: pageSug.quickActions || [],
        };
      }
    }

    // ------ NEW: Operational action (create, generate, send) ------------------------------------------------------
    case 'action': {
      const toolName = intent.tool || intent.action;
      const toolDef = TOOL_DEFINITIONS[toolName];
      if (!toolDef) {
        return {
          message: `I'm not sure how to perform "${toolName}". Could you rephrase?`,
          suggestions: ['What can you do?', 'Show quick actions'],
          quickActions: QUICK_ACTIONS,
        };
      }

      // Merge extracted params into a param map
      const params = { ...(intent.params || {}) };

      // For master-data create tools, collect curated extra fields step-by-step.
      // User can type "skip" to omit any optional field.
      const MASTER_DATA_ASK_LIST = {
        create_vendor:   ['vendor_name', 'contact_person', 'phone', 'email', 'address', 'tax_id'],
        create_client:   ['client_name', 'contact_person', 'phone', 'email', 'address', 'tax_id', 'payment_terms'],
        create_material: ['material_category', 'material_grade', 'density'],
        create_part:     ['part_name', 'part_number', 'description'],
        create_rfq:              ['vendor_name', 'material_name', 'required_quantity', 'project_name', 'required_date', 'notes'],
        create_purchase_order:   ['vendor_name', 'project_name', 'item_description', 'quantity', 'unit_cost', 'notes'],
        create_inventory_item:   ['item_name', 'category', 'unit', 'quantity', 'description'],
      };
      const askList = MASTER_DATA_ASK_LIST[toolName] || toolDef.required || [];

      // Compute fields still needed (skip any already provided)
      const missing = askList.filter(p => !params[p]);

      if (missing.length > 0) {
        // Ask follow-up questions for missing params
        setState(user?.id || 'anon', {
          pendingAction: toolName,
          pendingParams: params,
          missingParams: missing,
          currentAskIndex: 0,
        });

        const paramLabels = {
          project_name: 'project name',
          client_name: 'client name',
          client_id: 'client',
          project_id: 'project',
          vendor_id: 'vendor',
          vendor_name: 'vendor (company) name',
          company_name: 'company name',
          contact_person: 'contact person name',
          email: 'email address',
          phone: 'phone number',
          address: 'address',
          tax_id: 'GST / Tax ID (or type "skip")',
          payment_terms: 'payment terms (e.g. Net 30, or "skip")',
          material_id: 'material',
          material_category: 'material category (e.g. Steel, Aluminium)',
          material_grade: 'material grade (e.g. SS304, AL6061)',
          density: 'density (e.g. 7.85 g/cm³ -- a number)',
          quantity: 'quantity',
          deadline: 'deadline',
          description: 'description',
          items: 'items / line-items',
          amount: 'amount',
          part_name: 'part name',
          part_number: 'part number (or type "skip")',
          // Procurement / Inventory
          material_name: 'material / item name',
          required_quantity: 'required quantity (e.g. 100)',
          required_date: 'required date (YYYY-MM-DD or "skip")',
          notes: 'notes (or type "skip")',
          item_description: 'item description',
          unit_cost: 'unit cost (number)',
          item_name: 'item name',
          category: 'category (raw_material / consumable / safety_equipment / tools)',
          unit: 'unit of measure (e.g. Kg, Nos, Litre)',
        };
        const firstMissing = paramLabels[missing[0]] || missing[0];

        // Build expert-style acknowledgment summarising extracted data
        const captured = Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `   • **${k.replace(/_/g, ' ')}**: ${v}`)
          .join('\n');
        let ackHeader;
        if (captured) {
          ackHeader = `Understood --- ${toolDef.description.toLowerCase()}.\n\n**Captured so far:**\n${captured}\n\n`;
        } else {
          ackHeader = `Understood --- I'll ${toolDef.description.toLowerCase()}.\n\n`;
        }
        const remainingCount = missing.length;
        const remainingNote = remainingCount === 1
          ? `Only **one detail** missing.`
          : `**${remainingCount} details** still needed.`;

        // Adaptive --- suggest learned defaults for vendor / client / material / project
        const learnedSuggestions = buildLearnedSuggestions(user?.id || 'anon', missing[0]);
        let smartHint = '';
        const defaultPick = pickLearnedDefault(user?.id || 'anon', missing[0]);
        if (defaultPick) {
          smartHint = `\n\n_Last time you used **${defaultPick}** --- reply **same** to reuse it._`;
        }

        return {
          message: `${ackHeader}${remainingNote}\n\nWhat's the **${firstMissing}**?${smartHint}`,
          suggestions: [...learnedSuggestions, 'skip'],
          quickActions: [],
          followUp: true,
          followUpParam: missing[0],
        };
      }

      // All required params present --- show confirmation card
      setState(user?.id || 'anon', {
        pendingAction: toolName,
        pendingParams: params,
        missingParams: [],
      });

      const paramSummary = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `• **${k.replace(/_/g, ' ')}**: ${v}`)
        .join('\n');

      return {
        message: `**Please confirm this action:**\n\n📋 **${toolDef.description}**\n\n${paramSummary || '_(no extra parameters)_'}\n\nReply **yes** to confirm or **cancel** to abort.`,
        suggestions: ['yes', 'cancel'],
        quickActions: [],
        confirmationCard: {
          action: toolName,
          description: toolDef.description,
          params,
          buttons: ['✅ Approve', '✏️ Edit', '❌ Cancel'],
        },
      };
    }

    // ------ NEW: Approve pending action ---------------------------------------------------------------------------------------------------------------------
    case 'approve': {
      const state = getState(user?.id || 'anon');
      if (!state || !state.pendingAction) {
        return {
          message: 'There\'s nothing pending to approve right now. ----\n\nTry asking me to do something first!',
          suggestions: ['Create a project', 'Show quick actions'],
          quickActions: QUICK_ACTIONS.slice(0, 4),
        };
      }
      // ---- Pre-validate well-known fields so we ask for corrections nicely
      // instead of getting cryptic DB validation errors.
      const _emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const _emailFields = ['email', 'contact_email'];
      for (const f of _emailFields) {
        const v = state.pendingParams[f];
        if (v && typeof v === 'string' && !_emailRx.test(v.trim())) {
          state.lastError = { field: f, kind: 'email', value: v };
          setState(user?.id || 'anon', state);
          return {
            message: `\u26A0\uFE0F The email **${v}** doesn't look valid. What's the correct email address? (Or type **skip** to leave it blank.)`,
            suggestions: ['skip', 'cancel'],
            quickActions: [],
          };
        }
      }
      try {
        const result = await executeTool(state.pendingAction, state.pendingParams, user, companyId);
        // Adaptive learning --- remember vendors / materials / clients used
        if (result.success !== false) {
          try { aiPrefs.learnFromExecution(user?.id || 'anon', state.pendingAction, state.pendingParams); } catch (_) { /* noop */ }
        }
        if (result.success === false) {
          // KEEP state so the user can patch the bad field with one short reply.
          // Try to extract which field failed from the error string (e.g.
          // "Validation isEmail on contact_email failed").
          const errMsg = result.message || '';
          const fieldMatch = errMsg.match(/on\s+([a-z_]+)\s+failed/i)
            || errMsg.match(/([a-z_]+)\s+(?:is\s+)?(?:invalid|required|cannot\s+be)/i);
          const badField = fieldMatch ? fieldMatch[1] : null;
          // Map DB column names back to user-friendly param names
          const dbToParam = { contact_email: 'email', contact_phone: 'phone', vendor_name: 'vendor_name' };
          const mappedField = badField ? (dbToParam[badField] || badField) : null;
          state.lastError = { field: mappedField, raw: errMsg };
          setState(user?.id || 'anon', state);
          const labelMap = {
            email: 'email address', phone: 'phone number', vendor_name: 'vendor name',
            contact_person: 'contact person', address: 'address', tax_id: 'GST / Tax ID',
          };
          const label = mappedField ? (labelMap[mappedField] || mappedField.replace(/_/g, ' ')) : null;
          const ask = label
            ? `\n\nWhat's the correct **${label}**? (Or type **cancel** to abort.)`
            : `\n\nReply with the corrected value, or type **cancel** to abort.`;
          return {
            message: `\u26A0\uFE0F ${errMsg}${ask}`,
            suggestions: label ? [`use a different ${label}`, 'cancel'] : ['cancel'],
            quickActions: [],
            toolResult: result,
          };
        }
        clearState(user?.id || 'anon');
        return {
          message: `\u2705 ${result.message || 'Done!'}`,
          suggestions: result.suggestions || ['What else?', 'Show suggestions'],
          quickActions: pageSug.quickActions || [],
          toolResult: result,
        };
      } catch (err) {
        // Same recovery path for thrown errors
        state.lastError = { field: null, raw: err.message || 'unknown error' };
        setState(user?.id || 'anon', state);
        return {
          message: `\u26A0\uFE0F Action failed: ${err.message || 'unknown error'}.\n\nReply with the corrected value or type **cancel** to abort.`,
          suggestions: ['cancel', 'Try again'],
          quickActions: pageSug.quickActions || [],
        };
      }
    }

    // ------ NEW: Cancel pending action ------------------------------------------------------------------------------------------------------------------------
    case 'cancel': {
      const had = !!getState(user?.id || 'anon')?.pendingAction;
      clearState(user?.id || 'anon');
      return {
        message: had
          ? '--- Action cancelled. No changes were made.\n\nWhat would you like to do instead?'
          : 'Nothing to cancel --- all clear! ------',
        suggestions: ['Show suggestions', 'Quick actions'],
        quickActions: pageSug.quickActions || [],
      };
    }

    // ------ NEW: Edit pending action params ---------------------------------------------------------------------------------------------------------
    case 'edit_pending': {
      const state = getState(user?.id || 'anon');
      if (!state || !state.pendingAction) {
        return {
          message: 'No pending action to edit. Start a new request and I\'ll help! ----',
          suggestions: ['Create a project', 'Show quick actions'],
          quickActions: QUICK_ACTIONS.slice(0, 4),
        };
      }

      // Parse the edit detail to update params
      const detail = (intent.detail || '').toLowerCase();
      const toolDef = TOOL_DEFINITIONS[state.pendingAction];
      const allParams = [...(toolDef?.required || []), ...(toolDef?.optional || [])];

      let updated = false;
      for (const param of allParams) {
        const paramRegex = new RegExp(`(?:${param.replace(/_/g, '[_ ]')})[:\\s]+(.+)`, 'i');
        const match = detail.match(paramRegex);
        if (match) {
          state.pendingParams[param] = match[1].trim();
          updated = true;
        }
      }

      if (!updated && detail) {
        // Try to guess which param the user is updating
        const missingOrFirst = (state.missingParams && state.missingParams[0]) || allParams[0];
        if (missingOrFirst) {
          state.pendingParams[missingOrFirst] = detail.trim();
          if (state.missingParams) state.missingParams = state.missingParams.slice(1);
          updated = true;
        }
      }

      setState(user?.id || 'anon', state);

      const paramSummary = Object.entries(state.pendingParams)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `--- **${k.replace(/_/g, ' ')}**: ${v}`)
        .join('\n');

      return {
        message: `------ Updated! Here's the current action:\n\n---- **${toolDef?.description || state.pendingAction}**\n\n${paramSummary}\n\nReady to proceed?`,
        suggestions: [],
        quickActions: [],
        confirmationCard: {
          action: state.pendingAction,
          description: toolDef?.description || state.pendingAction,
          params: state.pendingParams,
          buttons: ['--- Approve', '------ Edit', '--- Cancel'],
        },
      };
    }

    case 'greeting': {
      const h = new Date().getHours();
      const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      const name = user?.name?.split(' ')[0] || 'there';
      // Short, natural greeting -- not a wall of text
      const variants = [
        `${greet}, ${name}! I'm **Amber AI**. How can I help you today?`,
        `Hi ${name}! \u{1F44B} **Amber AI** here -- what would you like to do?`,
        `Hey ${name}! ${greet}. I'm **Amber AI**, your assistant for Forge i-DAS. What's on your mind?`,
      ];
      return {
        message: variants[Math.floor(Math.random() * variants.length)],
        suggestions: ['What can you do?', 'Daily summary', 'Show projects'],
        quickActions: pageSug.quickActions || [],
      };
    }

    case 'smalltalk': {
      const name = user?.name?.split(' ')[0] || 'there';
      switch (intent.sub) {
        case 'identity': {
          return {
            message: `I'm **Amber AI** -- the smart assistant built into Forge i-DAS. \u{1F916}\n\nI can help you create projects, clients, vendors, materials, RFQs and POs; pull live business data; navigate the platform; and answer questions about any module. Just talk to me naturally.`,
            suggestions: ['What can you do?', 'Show daily summary', 'Open projects'],
            quickActions: pageSug.quickActions || [],
          };
        }
        case 'how_are_you': {
          const replies = [
            `I'm doing great, ${name} -- thanks for asking! \u{1F60A} Ready when you are. What would you like to work on?`,
            `All systems good on my end. \u{2705} How can I help you today, ${name}?`,
            `Running smoothly, ${name}! What's the plan?`,
          ];
          return {
            message: replies[Math.floor(Math.random() * replies.length)],
            suggestions: ['Daily summary', 'Show projects', 'What can you do?'],
            quickActions: pageSug.quickActions || [],
          };
        }
        case 'time': {
          const now = new Date();
          const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          return {
            message: `It's **${timeStr}** on **${dateStr}**.`,
            suggestions: ['Daily summary', 'What can you do?'],
            quickActions: pageSug.quickActions || [],
          };
        }
        case 'ack': {
          const replies = [`\u{1F44D}`, `Got it!`, `Cool. Anything else?`, `Noted.`, `\u{2705}`];
          return {
            message: replies[Math.floor(Math.random() * replies.length)],
            suggestions: ['What can you do?', 'Show suggestions'],
            quickActions: pageSug.quickActions || [],
          };
        }
        case 'already_given': {
          // First, try recovering missing fields from the user's recent
          // chat history (last 6 messages) -- this is the real "re-check
          // previous message" behaviour.
          let st = getState(user?.id || 'anon');
          if (st && st.missingParams && st.missingParams.length > 0) {
            const before = [...st.missingParams];
            st = recoverFromHistory(user?.id || 'anon', st);
            setState(user?.id || 'anon', st);
            const recovered = before.filter(p => !st.missingParams.includes(p));
            if (recovered.length > 0) {
              const recoveredList = recovered
                .map(p => `   \u2022 **${p.replace(/_/g, ' ')}**: ${st.pendingParams[p]}`)
                .join('\n');
              if (st.missingParams.length === 0) {
                // All filled --- jump to confirmation summary
                const allParams = Object.entries(st.pendingParams)
                  .filter(([, v]) => v !== undefined && v !== null && v !== '')
                  .map(([k, v]) => `   \u2022 **${k.replace(/_/g, ' ')}**: ${v}`)
                  .join('\n');
                return {
                  message: `You're right, ${name} -- I had it. Pulled from earlier:\n\n${recoveredList}\n\n**Ready to proceed with:**\n${allParams}\n\nReply **yes** to confirm or **edit** to change anything.`,
                  suggestions: ['yes', 'edit', 'cancel'],
                  quickActions: [],
                };
              }
              return {
                message: `You're right, ${name} -- I found these in your earlier message:\n\n${recoveredList}\n\n_Still needed:_ **${st.missingParams.join(', ')}**.`,
                suggestions: ['skip', 'cancel'],
                quickActions: [],
                followUp: true,
                followUpParam: st.missingParams[0],
              };
            }
          }
          // Fallback: show what we already have
          if (st && st.pendingParams && Object.keys(st.pendingParams).length > 0) {
            const captured = Object.entries(st.pendingParams)
              .filter(([, v]) => v !== undefined && v !== null && v !== '')
              .map(([k, v]) => `   \u2022 **${k.replace(/_/g, ' ')}**: ${v}`)
              .join('\n');
            const stillMissing = (st.missingParams || []).join(', ') || 'nothing';
            return {
              message: `My apologies, ${name}. Here's what I have so far:\n\n${captured}\n\n_Still needed:_ **${stillMissing}**.\n\nIf something's wrong, type **edit** to fix it; otherwise just give me the missing detail.`,
              suggestions: ['edit', 'cancel', 'yes'],
              quickActions: [],
            };
          }
          return {
            message: `Sorry ${name}, I might have missed it. Could you re-share the detail one more time? I promise I'll catch it this time.`,
            suggestions: ['Show suggestions'],
            quickActions: pageSug.quickActions || [],
          };
        }
        default:
          return {
            message: `I'm here, ${name}. What can I help you with?`,
            suggestions: ['What can you do?', 'Show suggestions'],
            quickActions: pageSug.quickActions || [],
          };
      }
    }

    case 'thanks': {
      const replies = [
        'Happy to help! ---- Lmk if you need anything else.',
        'Anytime! ---- I\'m always here for you.',
        'No worries! Got your back. ----',
        'You\'re welcome! Hit me up whenever. ----',
      ];
      return {
        message: replies[Math.floor(Math.random() * replies.length)],
        suggestions: ['Show suggestions', 'Dashboard overview'],
        quickActions: pageSug.quickActions || [],
      };
    }

    case 'farewell': {
      return {
        message: 'Catch you later! ------ If you need help, just open me up anytime.',
        suggestions: [],
        quickActions: [],
      };
    }

    case 'capabilities': {
      return {
        message: `I'm **Amber AI** -- here's what I can do for you in Forge i-DAS:\n\n**---- Navigation**\nSay "Open Projects" or "Go to Analytics" and I'll take you there.\n\n**--- Create & Update**\n"Create a project for ABC client", "Add vendor XYZ", "Add inventory item Aluminium qty 50", "Raise RFQ", "Generate quotation".\nI confirm before saving anything.\n\n**---- Analytics & Insights**\n"Show daily summary", "Revenue report", "Active orders", "Project performance".\n\n**---- Document Intelligence**\nUpload a document and I'll classify it and extract the key data.\n\n**---- Platform Knowledge**\nAsk about any module -- I know them all inside out.`,
        suggestions: ['Show workflow', 'Daily summary', 'Show projects'],
        quickActions: QUICK_ACTIONS.slice(0, 5),
      };
    }

    case 'quickActions': {
      return {
        message: `Here are your **Quick Actions** ---\n\nUse the buttons below to jump to any section instantly:`,
        suggestions: [],
        quickActions: QUICK_ACTIONS,
      };
    }

    case 'navigation': {
      const mod = findModule(intent.target);
      if (mod && KB.modules[mod]) {
        const m = KB.modules[mod];
        return {
          message: `${m.emoji} **${m.name}** --- got it!\n\n${m.short}\n\n${m.tips ? '**Pro tips:**\n' + m.tips.map(t => `--- ${t}`).join('\n') : ''}\n\nI'll open it for you. ----`,
          action: { type: 'navigate', path: m.path },
          suggestions: [`What can I do in ${m.name}?`, 'Show workflow'],
          quickActions: pageSug.quickActions || [],
        };
      }

      const tabMatch = Object.keys(KB.projectTabs).find(t =>
        intent.target.toLowerCase().includes(t.toLowerCase()),
      );
      if (tabMatch) {
        return {
          message: `---- **${tabMatch}** is a tab inside each project's detail page.\n\n${KB.projectTabs[tabMatch]}\n\n**How to get there:**\n1. Go to **Projects**\n2. Click on a project\n3. Select the **${tabMatch}** tab\n\nI'll take you to the Projects page first. ----`,
          action: { type: 'navigate', path: '/projects' },
          suggestions: ['Show all projects', 'Show workflow'],
          quickActions: [],
        };
      }

      const moduleList = Object.values(KB.modules).map(m => `--- ${m.emoji} **${m.name}** --- ${m.path}`).join('\n');
      return {
        message: `Hmm, I couldn't find a page for "${intent.target}" ----\n\nHere are all the available modules:\n\n${moduleList}\n\nWhich one do you want?`,
        suggestions: Object.values(KB.modules).slice(0, 3).map(m => `Open ${m.name}`),
        quickActions: [],
      };
    }

    case 'create': {
      const e = intent.entity.toLowerCase();
      if (e.includes('project')) {
        return {
          message: `**How to create a new project** -------\n\n1. Head to **Dashboard** or **Projects** page\n2. Click the **"+ New Project"** button\n3. Fill in:\n   --- Project name\n   --- Select / add a client\n   --- Set the deadline\n   --- Add a description\n4. Hit **Save** --- your project starts in **Pending** status\n\n**What's next?**\nAfter creating, move through the tabs: Estimation --- Quotation --- Sales Order --- Work Order --- Production --- Quality --- Logistics --- Documents.\n\nWant me to open the Projects page?`,
          action: { type: 'navigate', path: '/projects' },
          suggestions: ['Yes, open Projects', 'Show full workflow', 'What are project statuses?'],
          quickActions: [{ label: '--- New Project', path: '/projects' }],
        };
      }
      if (e.includes('client') || e.includes('customer')) {
        return {
          message: `**How to add a new client** -------\n\n1. Go to **Clients** (sidebar --- Management)\n2. Click **"+ Add Client"**\n3. Fill in: company name, contact person, email, phone, address\n4. Click **Save**\n\n*Note: Admin or Main Admin access required.*`,
          action: { type: 'navigate', path: '/clients' },
          suggestions: ['Open Clients', 'Show all clients'],
          quickActions: [{ label: '---- Clients', path: '/clients' }],
        };
      }
      if (e.includes('vendor') || e.includes('supplier')) {
        return {
          message: `**How to add a new vendor** -------\n\n1. Navigate to **Vendors** (sidebar --- Management)\n2. Click **"+ Add Vendor"**\n3. Fill in: company name, contact person, email, phone, category, business details\n4. Click **Save**\n\n*Note: Admin access required.*`,
          action: { type: 'navigate', path: '/vendors/add' },
          suggestions: ['Open Vendors', 'Show all vendors'],
          quickActions: [{ label: '---- Add Vendor', path: '/vendors/add' }],
        };
      }
      if (e.includes('user') || e.includes('account')) {
        return {
          message: `**How to add a new user** -------\n\n1. Go to **Access Control** --- **Users**\n2. Click **"+ Add User"**\n3. Fill in: name, email, password, role (User/Admin), module permissions\n4. Click **Save**\n\n*Admin access required.*`,
          action: { type: 'navigate', path: '/access-control/users' },
          suggestions: ['Access Control', 'What are user roles?'],
          quickActions: [{ label: '---- Users', path: '/access-control/users' }],
        };
      }
      if (e.includes('estimate') || e.includes('estimation') || e.includes('quote') || e.includes('quotation')) {
        return {
          message: `**How to create an Estimation / Quotation** ----\n\n1. Go to **Projects** and open the target project\n2. Click the **Estimation** tab\n3. Add cost items: materials, labor, overhead, profit margins\n4. Save --- project status updates to **Estimated**\n\nFor quotations, use the **Quotation** tab to manage pricing sent to clients.\n\n*Tip: The Estimation tab supports revisions (R0, R1, R2 ---) so you can track changes.*`,
          action: { type: 'navigate', path: '/projects' },
          suggestions: ['Open Projects', 'Show workflow'],
          quickActions: [{ label: '---- Projects', path: '/projects' }],
        };
      }
      if (e.includes('work order')) {
        return {
          message: `**How to create a Work Order** ----\n\n1. Open the target project\n2. Go to the **Work Order** tab\n3. Fill in manufacturing details: items, quantities, prepared by, PO number\n4. Save the work order\n\n*Tip: The PO number auto-populates from the Sales Order/Purchase Order tab.*`,
          action: { type: 'navigate', path: '/projects' },
          suggestions: ['Open Projects', 'Show workflow'],
          quickActions: [],
        };
      }
      if (e.includes('sales order') || e.includes('purchase order') || e.includes('po')) {
        return {
          message: `**How to create a Sales Order** ----\n\n1. Open the target project\n2. Go to the **Sales Order** tab\n3. Enter sales order details: SO number, customer PO number, upload PO document\n4. Save --- project status updates to **Order Confirmed**\n\n*Tip: Upload the client's PO document for reference.*`,
          action: { type: 'navigate', path: '/projects' },
          suggestions: ['Open Projects', 'Show workflow'],
          quickActions: [],
        };
      }
      return {
        message: `I can help you create:\n\n--- ---- **Project** --- Start a new fabrication project\n--- ---- **Client** --- Add a new client profile\n--- ---- **Vendor** --- Register a new supplier\n--- ---- **User** --- Create a user account (Admin only)\n--- ---- **Estimation** --- Add cost estimation to a project\n--- ---- **Work Order** --- Create a manufacturing work order\n--- ---- **Sales Order** --- Generate a sales order\n\nWhich one?`,
        suggestions: ['Create a project', 'Create a client', 'Create a vendor'],
        quickActions: [],
      };
    }

    case 'count': {
      const e = intent.entity.toLowerCase();
      try {
        if (e.includes('project')) {
          const total = await Project.count({ where: companyId ? { company_id: companyId } : {} });
          let breakdown = '';
          try {
            const byStatus = await Project.findAll({
              where: companyId ? { company_id: companyId } : {},
              attributes: ['status', [require('sequelize').fn('COUNT', '*'), 'count']],
              group: ['status'],
            });
            breakdown = byStatus.map(s => `--- **${s.status || 'Unknown'}**: ${s.get('count')}`).join('\n');
          } catch { /* skip */ }
          return {
            message: `---- **Total Projects: ${total}**${breakdown ? '\n\n' + breakdown : ''}\n\nWant me to show them?`,
            suggestions: ['Show all projects', 'Show production projects', 'Dashboard'],
            quickActions: [{ label: '---- Projects', path: '/projects' }],
          };
        }
        if (e.includes('client') || e.includes('customer')) {
          const total = await Client.count({ where: companyId ? { company_id: companyId } : {} });
          return {
            message: `---- **Total Clients: ${total}**\n\nWant to see the full list?`,
            suggestions: ['Show all clients', 'Add a client'],
            quickActions: [{ label: '---- Clients', path: '/clients' }],
          };
        }
        if (e.includes('vendor') || e.includes('supplier')) {
          const total = await Vendor.count({ where: companyId ? { company_id: companyId } : {} });
          return {
            message: `---- **Total Vendors: ${total}**`,
            suggestions: ['Show all vendors', 'Add a vendor'],
            quickActions: [{ label: '---- Vendors', path: '/vendors' }],
          };
        }
        if (e.includes('user')) {
          const total = await User.count({ where: companyId ? { company_id: companyId } : {} });
          return {
            message: `---- **Total Users: ${total}**`,
            suggestions: ['Access Control', 'Add a user'],
            quickActions: [{ label: '---- Access Control', path: '/access-control' }],
          };
        }
      } catch {
        return { message: 'Couldn\'t fetch the count right now --- try navigating to the relevant page. ----', suggestions: ['Dashboard'], quickActions: [] };
      }
      return {
        message: 'I can count:\n--- Projects\n--- Clients\n--- Vendors\n--- Users\n\nWhich one?',
        suggestions: ['How many projects?', 'How many clients?', 'How many vendors?'],
        quickActions: [],
      };
    }

    case 'query': {
      const e = intent.entity.toLowerCase();

      if (e.includes('project')) {
        try {
          const where = {};
          if (e.includes('production') || e.includes('manufacturing')) where.status = 'In Production';
          else if (e.includes('pending')) where.status = 'Pending';
          else if (e.includes('completed') || e.includes('done')) where.status = 'Completed';
          else if (e.includes('confirmed') || e.includes('order confirmed')) where.status = 'Order Confirmed';
          else if (e.includes('estimated')) where.status = 'Estimated';
          else if (e.includes('shipped')) where.status = 'Shipped';
          else if (e.includes('active')) where.status = { [Op.notIn]: ['Completed', 'Cancelled'] };

          if (companyId) where.company_id = companyId;
          const projects = await Project.findAll({
            where,
            limit: 10,
            order: [[(e.includes('recent') || e.includes('latest') || e.includes('updated')) ? 'updatedAt' : 'createdAt', 'DESC']],
            attributes: ['id', 'project_name', 'status', 'updatedAt'],
            include: [{ model: Client, as: 'client', attributes: ['client_name'], required: false }],
          });

          if (projects.length === 0)
            return {
              message: `No projects found${where.status ? ` with status "${typeof where.status === 'string' ? where.status : 'Active'}"` : ''}. ----\n\nWant to create one?`,
              action: { type: 'navigate', path: '/projects' },
              suggestions: ['Create a project', 'Dashboard'],
              quickActions: [{ label: '--- New Project', path: '/projects' }],
            };

          const list = projects.map((p, i) =>
            `${i + 1}. **${p.project_name}** --- ${p.status} ${p.client?.client_name ? `(${p.client.client_name})` : ''}`
          ).join('\n');

          return {
            message: `---- **Projects${where.status ? ` --- ${typeof where.status === 'string' ? where.status : 'Active'}` : ''}** (${projects.length}):\n\n${list}\n\nClick on any project in the Projects page to see full details.`,
            action: { type: 'navigate', path: '/projects' },
            suggestions: ['Create a project', 'Show production projects', 'Show workflow'],
            quickActions: [{ label: '---- Open Projects', path: '/projects' }],
          };
        } catch {
          return {
            message: 'Head to the **Projects** page to see all your projects --- you can filter by status and search by name. ----',
            action: { type: 'navigate', path: '/projects' },
            suggestions: ['Open Projects', 'Workflow'],
            quickActions: [{ label: '---- Projects', path: '/projects' }],
          };
        }
      }

      if (e.includes('client') || e.includes('customer')) {
        try {
          const clients = await Client.findAll({ where: companyId ? { company_id: companyId } : {}, limit: 10, order: [['createdAt', 'DESC']], attributes: ['id', 'client_name', 'contact_person', 'email'] });
          if (clients.length === 0)
            return { message: 'No clients found yet. Want to add one? ----', action: { type: 'navigate', path: '/clients' }, suggestions: ['Add a client'], quickActions: [{ label: '---- Add Client', path: '/clients' }] };

          const list = clients.map((c, i) => `${i + 1}. **${c.client_name}** --- ${c.contact_person || ''} ${c.email ? `(${c.email})` : ''}`).join('\n');
          return {
            message: `---- **Clients** (${clients.length}):\n\n${list}`,
            action: { type: 'navigate', path: '/clients' },
            suggestions: ['Add a client', 'Show projects'],
            quickActions: [{ label: '---- Clients', path: '/clients' }],
          };
        } catch {
          return { message: 'Navigate to **Clients** to see the full list. ----', action: { type: 'navigate', path: '/clients' }, suggestions: ['Open Clients'], quickActions: [] };
        }
      }

      if (e.includes('vendor') || e.includes('supplier')) {
        try {
          const vendors = await Vendor.findAll({ where: companyId ? { company_id: companyId } : {}, limit: 10, order: [['createdAt', 'DESC']], attributes: ['id', 'company_name', 'contact_person', 'email', 'risk_level'] });
          if (vendors.length === 0)
            return { message: 'No vendors yet. Want to add one? ----', action: { type: 'navigate', path: '/vendors' }, suggestions: ['Add a vendor'], quickActions: [{ label: '---- Add Vendor', path: '/vendors/add' }] };

          const list = vendors.map((v, i) => `${i + 1}. **${v.company_name}** --- ${v.contact_person || ''} ${v.risk_level ? `------ Risk: ${v.risk_level}` : ''}`).join('\n');
          const highRisk = vendors.filter(v => ['high', 'High'].includes(v.risk_level));
          return {
            message: `---- **Vendors** (${vendors.length}):\n\n${list}${highRisk.length ? `\n\n------ **${highRisk.length} high-risk vendor(s)** --- check the Risk Dashboard!` : ''}`,
            action: { type: 'navigate', path: '/vendors' },
            suggestions: ['Add a vendor', 'Risk Dashboard'],
            quickActions: [{ label: '---- Vendors', path: '/vendors' }],
          };
        } catch {
          return { message: 'Head to **Vendors** to see the full list. ----', action: { type: 'navigate', path: '/vendors' }, suggestions: ['Open Vendors'], quickActions: [] };
        }
      }

      if ((e.includes('high') && e.includes('risk')) || e.includes('risky')) {
        try {
          const highVendors = await Vendor.findAll({ where: { ...(companyId ? { company_id: companyId } : {}), risk_level: { [Op.iLike]: '%high%' } }, attributes: ['id', 'company_name', 'contact_person'] });
          if (highVendors.length === 0) return { message: '--- No high-risk vendors found. All vendors are in good shape!', suggestions: ['Show all vendors', 'Risk Dashboard'], quickActions: [] };
          const list = highVendors.map((v, i) => `${i + 1}. **${v.company_name}** --- ${v.contact_person || 'No contact'} ------`).join('\n');
          return {
            message: `------ **High-Risk Vendors** (${highVendors.length}):\n\n${list}\n\nReview these vendors and consider mitigation strategies.`,
            action: { type: 'navigate', path: '/risk-dashboard' },
            suggestions: ['Risk Dashboard', 'Show all vendors'],
            quickActions: [{ label: '------ Risk Dashboard', path: '/risk-dashboard' }],
          };
        } catch {
          return { message: 'Check the **Risk Dashboard** or **Vendors** page to review risk levels.', action: { type: 'navigate', path: '/vendors' }, suggestions: ['Open Vendors'], quickActions: [] };
        }
      }

      if (e.includes('pending') && e.includes('approval')) {
        return {
          message: 'To check pending approvals:\n\n1. Go to **Approvals** from the sidebar\n2. Review items marked as "Pending"\n3. Approve or reject each item\n\nI\'ll take you there. ---',
          action: { type: 'navigate', path: '/approvals' },
          suggestions: ['Open Approvals', 'Dashboard'],
          quickActions: [{ label: '--- Approvals', path: '/approvals' }],
        };
      }

      if (e.includes('audit') || e.includes('log') || e.includes('activity')) {
        return {
          message: '---- **Audit Logs** track every action in the system --- who did what and when.\n\nYou can find them under **Access Control --- Audit Logs**.\n\nI\'ll open it for you. ----',
          action: { type: 'navigate', path: '/access-control/audit-logs' },
          suggestions: ['Open Access Control', 'Dashboard'],
          quickActions: [{ label: '---- Audit Logs', path: '/access-control/audit-logs' }],
        };
      }

      return {
        message: 'I can show you:\n--- ---- **Projects** (all, active, by status)\n--- ---- **Clients**\n--- ---- **Vendors** (including high-risk ones)\n--- ---- **Audit Logs / Activity**\n--- --- **Pending Approvals**\n\nWhat would you like to see?',
        suggestions: ['Show all projects', 'Show clients', 'Show vendors'],
        quickActions: [],
      };
    }

    case 'status': {
      const e = intent.entity.toLowerCase();
      if (e.includes('project') || e.match(/forged|fabricat/)) {
        try {
          const search = e.replace(/project\s*/i, '').replace(/the\s*/i, '').trim();
          let project;
          if (search) {
            project = await Project.findOne({
              where: { ...(companyId ? { company_id: companyId } : {}), project_name: { [Op.iLike]: `%${search}%` } },
              include: [{ model: Client, as: 'client', attributes: ['client_name'], required: false }],
            });
          }
          if (project) {
            return {
              message: `---- **${project.project_name}**\n\n--- Status: **${project.status}**\n--- Client: ${project.client?.client_name || 'Not assigned'}\n--- Deadline: ${project.deadline ? new Date(project.deadline).toLocaleDateString() : 'Not set'}\n--- Created: ${new Date(project.createdAt).toLocaleDateString()}\n--- Updated: ${new Date(project.updatedAt).toLocaleDateString()}\n\nWant to open this project?`,
              action: { type: 'navigate', path: `/projects/${project.id}` },
              suggestions: ['Yes, open it', 'Show all projects', 'Workflow'],
              quickActions: [],
            };
          }
        } catch { /* fall through */ }
      }
      return {
        message: 'To check the status of something:\n\n--- **Projects** --- Go to Projects or ask "status of [project name]"\n--- **Dashboard** --- Quick overview at a glance\n--- **Risk Dashboard** --- Risk metrics\n\nTry asking about a specific project by name! ----',
        suggestions: ['Show all projects', 'Dashboard'],
        quickActions: [{ label: '---- Dashboard', path: '/' }],
      };
    }

    case 'explain': {
      const e = intent.entity.toLowerCase();
      const mod = findModule(e);
      if (mod && KB.modules[mod]) {
        const m = KB.modules[mod];
        let resp = `${m.emoji} **${m.name}**\n\n${m.short}\n\n**Features:**\n${m.features.map(f => `--- ${f}`).join('\n')}`;
        if (m.sections) resp += `\n\n**Sections:**\n${Object.entries(m.sections).map(([k, v]) => `--- **${k}** --- ${v}`).join('\n')}`;
        if (m.tips) resp += `\n\n**Pro tips:**\n${m.tips.map(t => `---- ${t}`).join('\n')}`;
        return {
          message: resp,
          action: { type: 'navigate', path: m.path },
          suggestions: [`Open ${m.name}`, 'Show workflow'],
          quickActions: [{ label: `${m.emoji} ${m.name}`, path: m.path }],
        };
      }

      const tab = Object.keys(KB.projectTabs).find(t => e.includes(t.toLowerCase()));
      if (tab) {
        return {
          message: `---- **${tab} Tab**\n\n${KB.projectTabs[tab]}\n\nFound inside each project's detail page. Open a project and select the **${tab}** tab.`,
          suggestions: ['Show projects', 'Show workflow'],
          quickActions: [{ label: '---- Projects', path: '/projects' }],
        };
      }

      if (e.includes('role') || e.includes('permission')) {
        const roleInfo = Object.entries(KB.roles).map(([r, d]) => `--- **${r.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}** --- ${d}`).join('\n');
        return {
          message: `---- **User Roles:**\n\n${roleInfo}\n\nRoles control what each user can see and do. Manage them in **Access Control --- Roles**.`,
          action: { type: 'navigate', path: '/access-control/roles' },
          suggestions: ['Access Control', 'How to add a user?'],
          quickActions: [{ label: '---- Roles', path: '/access-control/roles' }],
        };
      }

      if (e.includes('status') || e.includes('statuses') || e.includes('stage')) {
        const statusList = Object.entries(KB.statuses).map(([s, d]) => `--- **${s}** --- ${d}`).join('\n');
        return {
          message: `---- **Project Statuses:**\n\n${statusList}`,
          suggestions: ['Show workflow', 'Show all projects'],
          quickActions: [],
        };
      }

      const moduleList = Object.values(KB.modules).map(m => `--- ${m.emoji} **${m.name}** --- ${m.short.substring(0, 50)}---`).join('\n');
      return {
        message: `I can explain any part of Forge i-DAS:\n\n${moduleList}\n\nWhat would you like to know about?`,
        suggestions: ['Tell me about Projects', 'Tell me about Analytics', 'Tell me about Access Control'],
        quickActions: [],
      };
    }

    case 'workflow': {
      return {
        message: `**Project Workflow in Forge i-DAS** ----\n\n${KB.workflowSteps.join('\n')}\n\nEach step maps to a tab in the project detail page. The project status automatically updates as you complete stages.\n\n**Status Pipeline:**\nPending --- Estimated --- Quoted --- Order Confirmed --- In Production --- Inspected --- Shipped --- Completed`,
        action: { type: 'navigate', path: '/projects' },
        suggestions: ['What are project statuses?', 'Create a project', 'Open Projects'],
        quickActions: [{ label: '---- Projects', path: '/projects' }],
      };
    }

    case 'troubleshoot': {
      const d = intent.detail || '';

      if (d.includes('login') || d.includes('sign in') || d.includes('password')) {
        return {
          message: '---- **Login troubleshooting:**\n\n1. **Wrong password** --- Reset via admin or Settings\n2. **Account locked** --- Ask your Main Admin to unlock\n3. **Account inactive** --- May have been deactivated --- contact admin\n4. **Session expired** --- You\'ll be redirected --- just log in again\n\nIf it persists, reach out to your system administrator.',
          suggestions: ['Go to Settings', 'Access Control'],
          quickActions: [{ label: '------ Settings', path: '/settings' }],
        };
      }

      if (d.includes('permission') || d.includes('access') || d.includes('denied') || d.includes('unauthorized')) {
        return {
          message: '------- **Permission / access issue:**\n\n1. Your role might not have access to this module\n2. Some actions need Admin or Main Admin role\n3. Page redirects = you need elevated permissions\n\n**Role hierarchy:**\n--- Main Admin --- Full access\n--- Admin --- Most features\n--- User --- Assigned modules only\n\nAsk your admin to update your permissions in **Access Control**.',
          action: { type: 'navigate', path: '/settings' },
          suggestions: ['User roles', 'Access Control'],
          quickActions: [{ label: '---- Access Control', path: '/access-control' }],
        };
      }

      if (d.includes('save') || d.includes('update') || d.includes('submit')) {
        return {
          message: '---- **Form / save issues:**\n\n1. **Required fields missing** --- Check for red validation messages\n2. **Status not updating** --- Complete prerequisite steps first (e.g., estimation before quotation)\n3. **Data not loading** --- Refresh the page (Ctrl+R)\n4. **Network error** --- Check your internet connection\n\nIf you see a specific error message, tell me and I\'ll help decode it! ----',
          suggestions: ['Show workflow', 'Dashboard'],
          quickActions: [],
        };
      }

      if (d.includes('estimat') || d.includes('quotat')) {
        return {
          message: '---- **Estimation / Quotation issues:**\n\n1. **Can\'t create estimation** --- Make sure the project exists first\n2. **Revision not saving** --- Check required fields (materials, quantities, prices)\n3. **Quotation tab empty** --- Add estimation first, then generate quotation\n4. **Revision tracking** --- Each save creates a new revision (R0, R1, R2 ---)\n\nFollowed the workflow? Estimation comes after Project Info. ----',
          suggestions: ['Show workflow', 'Open Projects'],
          quickActions: [{ label: '---- Projects', path: '/projects' }],
        };
      }

      if (d.includes('production') || d.includes('work order')) {
        return {
          message: '---- **Production / Work Order issues:**\n\n1. **Can\'t create work order** --- Ensure Sales Order is completed first\n2. **Production tab empty** --- Create a work order first\n3. **Status not updating** --- Move through steps sequentially\n4. **PO number missing** --- Check the Sales Order tab for PO details\n\nRemember: the workflow goes Estimation --- Quotation --- Sales Order --- Work Order --- Production. ----',
          suggestions: ['Show workflow', 'Open Projects'],
          quickActions: [],
        };
      }

      return {
        message: '------- **General troubleshooting:**\n\n---- **Access issues** --- Check your role & permissions\n---- **Save/update problems** --- Ensure required fields are filled\n---- **Loading issues** --- Refresh the page (Ctrl+R)\n---- **Notifications** --- Check Settings for preferences\n---- **Network errors** --- Check internet connection\n\nTell me the specific issue and I\'ll help you fix it! ----',
        suggestions: ['Permission issues', 'Login problems', 'Form issues'],
        quickActions: [],
      };
    }

    case 'suggest': {
      return {
        message: `**${pageSug.title}**\n\n${pageSug.suggestions.join('\n')}\n\nUse the quick actions below to jump to any section! ---`,
        suggestions: ['What can you do?', 'Show workflow'],
        quickActions: pageSug.quickActions || [],
      };
    }

    case 'general':
    default: {
      const rawMsg = (intent.message || '').trim();
      const userFirst = user?.name?.split(' ')[0] || 'there';

      // 1) Try matching a module by name first (only when text actually mentions one)
      const mod = findModule(rawMsg);
      if (mod && KB.modules[mod]) {
        const m = KB.modules[mod];
        return {
          message: `${m.emoji} **${m.name}**\n\n${m.short}\n\n${m.features ? '**Key features:**\n' + m.features.slice(0, 4).map(f => `--- ${f}`).join('\n') : ''}\n\nWant to go there or learn more?`,
          action: { type: 'navigate', path: m.path },
          suggestions: [`Open ${m.name}`, `Tell me more about ${m.name}`],
          quickActions: [{ label: `${m.emoji} ${m.name}`, path: m.path }],
        };
      }

      // 2) Honest fallback -- DON'T pretend to know, ask the user to clarify
      const wordCount = rawMsg.split(/\s+/).filter(Boolean).length;
      const tooShort = wordCount <= 2;
      const askMore = tooShort
        ? `I'm not quite sure what you'd like, ${userFirst}. Could you give me a bit more detail?`
        : `Hmm, I didn't fully follow that, ${userFirst}. Could you rephrase it for me?`;
      return {
        message: `${askMore}\n\n_For example, you can say:_\n  \u2022 "create a project for ABC client"\n  \u2022 "add vendor XYZ"\n  \u2022 "show daily summary"\n  \u2022 "what is the Quality module?"`,
        suggestions: ['What can you do?', 'Daily summary', 'Show suggestions'],
        quickActions: pageSug.quickActions || [],
      };
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  7. CONTROLLERS
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const processMessage = async (req, res) => {
  try {
    let { message } = req.body;
    const { currentPage } = req.body;
    if (!message?.trim())
      return res.status(400).json({ success: false, message: 'Message is required' });

    const userId = req.user?.id || 'anon';
    const state = getState(userId);

    // Fuzzy-normalise the raw message --- handles typos, short forms,
    // informal input. Original kept for reference; cleaned text is what
    // intent detection / entity extraction / follow-up parsing operates on.
    const _originalMessage = message;
    const { text: normalisedMessage } = fuzzyNormalise(message, aiPrefs, userId);
    if (normalisedMessage && normalisedMessage !== message) {
      message = normalisedMessage;
    }

    // Record the user's message in rolling chat history so smalltalk
    // 'already_given' can re-extract entities from prior turns.
    pushHistory(userId, 'user', _originalMessage);

    // Wrap res.json once so every assistant reply is logged to history
    // without having to touch each individual return site.
    const _origJson = res.json.bind(res);
    res.json = (payload) => {
      try {
        const msg = payload?.data?.message;
        if (msg) pushHistory(userId, 'assistant', msg);
      } catch (_) { /* never break the response on history failure */ }
      return _origJson(payload);
    };

    // ------ Recovery from a previously FAILED action ----------------------------
    // If the user just got a validation error (state.lastError set), treat their
    // next message as a single-field correction and re-show the confirmation
    // card with the patched value -- don't restart the whole create flow.
    if (state && state.pendingAction && state.lastError) {
      const answer = message.trim();
      // Cancel always wins
      if (/^(cancel|abort|stop|nevermind|never\s*mind|quit|exit)\s*[.!]*$/i.test(answer)) {
        clearState(userId);
        return res.json({
          success: true,
          data: {
            message: 'Cancelled. What else can I help you with?',
            suggestions: ['What can you do?', 'Show quick actions'],
            action: null, intent: 'cancel', quickActions: [],
          },
        });
      }
      // Try labeled extraction first (e.g. "Email: foo@bar.com use this"),
      // then a single-token email / phone / GST detection.
      let patched = false;
      try {
        const extras = extractEntities(answer);
        const ENTITY_TO_PARAM = {
          email: 'email', phone: 'phone', gst: 'tax_id', address: 'address',
          contact_person: 'contact_person', vendor_name: 'vendor_name',
          client_name: 'client_name', payment_terms: 'payment_terms',
        };
        for (const [eKey, pKey] of Object.entries(ENTITY_TO_PARAM)) {
          if (extras[eKey]) { state.pendingParams[pKey] = extras[eKey]; patched = true; }
        }
      } catch (_) { /* noop */ }
      // Fallback: if the message LOOKS like the field that failed, use it directly.
      if (!patched && state.lastError.field) {
        const f = state.lastError.field;
        const bare = answer.replace(/^(use\s+this|use|set\s+to|change\s+to|its|it'?s|the\s+correct\s+\w+\s+is)\s+/i, '')
                           .replace(/\s+(use\s+this|please|thanks|now)\s*[.!?]*$/i, '')
                           .trim();
        const emailMatch = bare.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
        const phoneMatch = bare.match(/(?:\+?\d[\d\s\-]{7,}\d)/);
        if (f === 'email' && emailMatch) { state.pendingParams.email = emailMatch[0]; patched = true; }
        else if (f === 'phone' && phoneMatch) { state.pendingParams.phone = phoneMatch[0].replace(/\s+/g, ''); patched = true; }
        else if (bare.length > 0 && bare.length < 200) {
          // Generic single-line correction --- assume it's the failing field
          state.pendingParams[f] = bare;
          patched = true;
        }
      }
      if (patched) {
        delete state.lastError;
        // Drop the patched fields from missingParams if they were there
        if (state.missingParams) {
          state.missingParams = state.missingParams.filter(p => !state.pendingParams[p]);
        }
        setState(userId, state);
        const toolDef = TOOL_DEFINITIONS[state.pendingAction];
        const paramSummary = Object.entries(state.pendingParams)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `\u2022 **${k.replace(/_/g, ' ')}**: ${v}`)
          .join('\n');
        return res.json({
          success: true,
          data: {
            message: `Updated. **Please confirm this action:**\n\n\uD83D\uDCCB **${toolDef?.description || state.pendingAction}**\n\n${paramSummary}\n\nReply **yes** to confirm or **cancel** to abort.`,
            suggestions: ['yes', 'cancel'],
            action: null,
            intent: 'confirmation',
            quickActions: [],
            confirmationCard: {
              action: state.pendingAction,
              description: toolDef?.description || state.pendingAction,
              params: state.pendingParams,
              buttons: ['\u2705 Approve', '\u270F\uFE0F Edit', '\u274C Cancel'],
            },
          },
        });
      }
      // Couldn't patch --- fall through to normal handling
    }

    // ------ Handle follow-up answers for missing params ---------------------------------------------------------------------
    if (state && state.pendingAction && state.missingParams && state.missingParams.length > 0) {
      const paramName = state.missingParams[0];
      const answer = message.trim();

      // Allow user to BROWSE master data mid-conversation without losing state
      // e.g. "list materials", "show vendors", "client list please i'll choose one"
      // Two detection paths:
      //   (a) Explicit phrase anywhere: "list X", "show X", "X list", "list of X"
      //   (b) Context-aware: if we're asking for an ID/name field and the user
      //       asks for help/options, infer the kind from the param name.
      // Maps the entity-reference field being asked for -> the corresponding
      // browse tool. Used for both detection and the hard guard below.
      const ENTITY_FIELD_TO_BROWSE = {
        client_id: 'list_clients', client_name: 'list_clients', company_name: 'list_clients', customer_id: 'list_clients', customer_name: 'list_clients',
        vendor_id: 'list_vendors', vendor_name: 'list_vendors', supplier_id: 'list_vendors', supplier_name: 'list_vendors',
        project_id: 'list_projects', project_name: 'list_projects',
        material_id: 'list_materials', material_name: 'list_materials', item_id: 'list_materials', item_name: 'list_materials',
      };
      const isEntityRefField = Object.prototype.hasOwnProperty.call(ENTITY_FIELD_TO_BROWSE, paramName);

      const browseIntent = (() => {
        // (a) Explicit, order-independent phrasing
        const a = answer;
        const matchKind = (kindRegex) =>
          new RegExp(`(?:list|show|display|fetch|see|view|browse|give\\s+me|let\\s+me\\s+see|what(?:'s|\\s+is|\\s+are)|which|options?\\s+(?:for|of)|pick(?:\\s+from)?|choose(?:\\s+from)?|select(?:\\s+from)?)[^a-z0-9]*(?:${kindRegex})\\b`, 'i').test(a)
          || new RegExp(`\\b(?:${kindRegex})\\s*(?:list|options?)\\b`, 'i').test(a)
          || new RegExp(`\\blist\\s+of\\s+(?:${kindRegex})\\b`, 'i').test(a);

        if (matchKind('material(?:s)?(?:\\s+library)?|inventory|stock')) return 'list_materials';
        if (matchKind('(?:vendor|supplier)s?')) return 'list_vendors';
        if (matchKind('clients?|customers?')) return 'list_clients';
        if (matchKind('projects?')) return 'list_projects';

        // (c) HARD GUARD: when the question is for an entity-ref field, treat
        // ANY response that contains a list/help cue as a browse request.
        // This prevents storing junk like "list clients" / "show vendors" /
        // "i don't know" as the actual id/name value.
        if (isEntityRefField) {
          const guardCue = /\b(list|lists|listing|show|see|view|display|browse|options?|choose|choice|pick|select|which|what(?:'s|\s+is|\s+are)?|help|don'?t\s+know|no\s+idea|not\s+sure|search)\b/i;
          if (guardCue.test(a)) return ENTITY_FIELD_TO_BROWSE[paramName];
        }

        return null;
      })();

      if (browseIntent) {
        try {
          const aiToolsService = require('../services/aiToolsService');
          const result = await aiToolsService.executeTool(browseIntent, { limit: 20 }, req.user, req.user?.company_id);
          // Re-prompt for the same param after showing the list
          const labelMap = {
            material_name: 'material / item name', material_category: 'material category',
            material_grade: 'material grade', vendor_name: 'vendor name',
            client_name: 'client name', client_id: 'client', project_id: 'project',
            project_name: 'project name', item_name: 'item name', vendor_id: 'vendor',
            material_id: 'material',
          };
          const label = labelMap[paramName] || paramName;
          // Build a structured `selection` payload alongside the markdown
          // message. The frontend can render selectable chips/cards from
          // `selection.options`; backwards-compatible because legacy clients
          // ignore unknown fields and still see the markdown list.
          const rows = Array.isArray(result?.data) ? result.data : (Array.isArray(result?.results) ? result.results : []);
          const options = rows.slice(0, 20).map((r) => ({
            id: String(r.id ?? r._id ?? r.code ?? r.name ?? ''),
            label: String(r.name ?? r.client_name ?? r.vendor_name ?? r.project_name ?? r.material_name ?? r.title ?? r.id ?? ''),
          })).filter((o) => o.id && o.label);
          return res.json({
            success: true,
            data: {
              type: 'selection',
              message: `${result.message || 'Done.'}\n\n---\n\nPick one from the list above, or type the **${label}** you'd like to use.`,
              suggestions: ['skip', 'cancel'],
              action: null,
              intent: 'followUp',
              quickActions: [],
              followUp: true,
              followUpParam: paramName,
              selection: {
                field: paramName,
                message: `Select a ${label}`,
                options,
              },
            },
          });
        } catch (err) {
          // fall through to normal handling
        }
      }

      // Allow user to cancel mid-flow
      if (/^(cancel|abort|stop|nevermind|never\s*mind|quit|exit)\s*[.!]*$/i.test(answer)) {
        clearState(userId);
        return res.json({
          success: true,
          data: {
            message: 'Cancelled. What else can I help you with?',
            suggestions: ['What can you do?', 'Show quick actions'],
            action: null, intent: 'cancel', quickActions: [],
          },
        });
      }

      // ---- Paste-mode: user wants to provide all fields in one go ----
      // Examples: "i'll give full details", "let me paste all", "wait, i'll
      // send everything", "all at once", "i'll provide all info".
      // We DON'T store this phrase as the answer -- we acknowledge and
      // wait for the actual data in the next message.
      const wantsPasteMode = /^(?:i\s*(?:'?ll|will)?\s*(?:give|provide|send|paste|share|enter|fill|type)|let\s*me\s*(?:paste|give|send|provide|fill|share|type)|wait|hold\s*on|gimme\s*a\s*sec|hang\s*on|one\s*(?:sec|moment|min)|i\s*have\s*(?:all|everything|the\s*details))\b.*?(?:full\s*details?|all\s*(?:details?|fields?|info|at\s*once)|everything|one\s*(?:shot|go|message)|complete\s*details?|details?\s*together)?\s*[.!?]*$/i.test(answer)
        || /^(?:full\s*details?|all\s*details?|all\s*at\s*once|everything\s*together|paste\s*mode)\s*[.!?]*$/i.test(answer);
      if (wantsPasteMode) {
        state.awaitingPaste = true;
        setState(userId, state);
        const labelList = (state.missingParams || []).map(p => `\u2022 **${p.replace(/_/g, ' ')}**`).join('\n');
        return res.json({
          success: true,
          data: {
            message: `Sure --- go ahead and paste everything at once. Use any of these labels (one per line works best):\n\n${labelList}\n\n_Example:_\n\u0060\u0060\u0060\nVendor Name: ABC Industries\nContact Person: John Smith\nPhone: 9876543210\nEmail: john@abc.com\nGST: 33ABCDE1234F1Z5\nAddress: 123 MG Road, Chennai\n\u0060\u0060\u0060`,
            suggestions: ['cancel'],
            action: null,
            intent: 'awaitingPaste',
            quickActions: [],
            followUp: true,
            followUpParam: paramName,
          },
        });
      }

      // ---- If awaitingPaste is set, treat THIS message as the bulk paste ----
      // Run extractEntities on the full text and bulk-fill all matching params,
      // then skip the "store as primary answer" path entirely.
      if (state.awaitingPaste) {
        state.awaitingPaste = false;
        try {
          const extras = extractEntities(answer);
          const ENTITY_TO_PARAM = {
            vendor_name: 'vendor_name', client_name: 'client_name',
            project_name: 'project_name', material_name: 'material_name',
            material_category: 'material_category', material_grade: 'material_grade',
            quantity: 'quantity', unit: 'unit', unit_cost: 'unit_cost',
            heat_number: 'heat_number', batch_number: 'batch_number',
            required_date: 'required_date', notes: 'notes',
            contact_person: 'contact_person', phone: 'phone', email: 'email',
            gst: 'tax_id', address: 'address', payment_terms: 'payment_terms',
            item_name: 'item_name', part_name: 'part_name',
            part_number: 'part_number', revision: 'revision',
            description: 'description',
          };
          for (const [eKey, pKey] of Object.entries(ENTITY_TO_PARAM)) {
            if (extras[eKey] && state.missingParams.includes(pKey) && !state.pendingParams[pKey]) {
              state.pendingParams[pKey] = extras[eKey];
            }
          }
          state.missingParams = state.missingParams.filter(p => !state.pendingParams[p]);
          setState(userId, state);
        } catch (_) { /* best-effort */ }
        // If everything is now filled, fall through so the loop below builds
        // the confirmation card. If still missing, ask only the next field.
        if (state.missingParams.length > 0) {
          const nextParam = state.missingParams[0];
          const labelMap = {
            vendor_name: 'vendor (company) name', client_name: 'client name',
            project_name: 'project name', contact_person: 'contact person name',
            phone: 'phone number', email: 'email address', tax_id: 'GST / Tax ID',
            address: 'address', payment_terms: 'payment terms',
            material_name: 'material name', material_category: 'material category',
            material_grade: 'material grade', quantity: 'quantity', unit: 'unit',
            unit_cost: 'unit cost / rate', heat_number: 'heat number',
            batch_number: 'batch number', required_date: 'required date',
            item_name: 'item name', part_name: 'part name',
            part_number: 'part number', revision: 'revision',
          };
          const captured = Object.entries(state.pendingParams)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `   \u2022 **${k.replace(/_/g, ' ')}**: ${v}`)
            .join('\n');
          return res.json({
            success: true,
            data: {
              message: `Got it. Captured so far:\n\n${captured}\n\n_Still need:_ **${labelMap[nextParam] || nextParam}**.`,
              suggestions: ['skip', 'cancel'],
              action: null,
              intent: 'followUp',
              quickActions: [],
              followUp: true,
              followUpParam: nextParam,
            },
          });
        }
        // All filled --- fall through to the confirmation-building code below
      }

      // Allow user to skip optional fields
      const isSkip = /^(skip|none|n\/?a|no|-)$/i.test(answer);

      // ---- Second-line guard: NEVER store a browse-cue phrase as the value
      // of an entity-ref field. If the upstream browseIntent block didn't
      // catch it (e.g. tool failure, unexpected wording), refuse the value
      // and re-ask. This is the belt-and-suspenders that prevents bugs
      // like `client id: "list client"` showing up in the confirmation.
      if (!isSkip && isEntityRefField) {
        const looksLikeBrowse = /\b(list|lists|listing|show|see|view|display|browse|options?|choose|pick|select|which|what(?:'s|\s+is|\s+are)?|help|don'?t\s+know|no\s+idea|not\s+sure)\b/i.test(answer);
        const tooShort = answer.length < 2;
        if (looksLikeBrowse || tooShort) {
          const browseHint = ENTITY_FIELD_TO_BROWSE[paramName] === 'list_clients' ? 'list clients'
            : ENTITY_FIELD_TO_BROWSE[paramName] === 'list_vendors' ? 'list vendors'
            : ENTITY_FIELD_TO_BROWSE[paramName] === 'list_projects' ? 'list projects'
            : 'list materials';
          return res.json({
            success: true,
            data: {
              type: 'step',
              message: `That doesn't look like a valid **${paramName.replace(/_/g, ' ')}** value. Type **${browseHint}** to see options, pick one from the list, or type **cancel** to abort.`,
              suggestions: [browseHint, 'cancel'],
              action: null,
              intent: 'followUp',
              quickActions: [],
              followUp: true,
              followUpParam: paramName,
            },
          });
        }
      }

      if (!isSkip && !state.awaitingPaste) {
        // Basic email validation
        if (paramName === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer)) {
          return res.json({
            success: true,
            data: {
              message: `That doesn't look like a valid email address. Please enter a valid email (e.g. name@example.com), or type **skip**.`,
              suggestions: ['skip'],
              action: null,
              intent: 'followUp',
              quickActions: [],
              followUp: true,
              followUpParam: paramName,
            },
          });
        }
        // Capture correction phrases like "use Aluminium 7000, not 6000"
        // -- record so future suggestions auto-correct, then use the "right" value
        let effectiveAnswer = answer;
        const correction = detectCorrection(answer);
        if (correction && correction.right && correction.wrong) {
          try { aiPrefs.recordCorrection(userId, correction.wrong, correction.right); } catch (_) { /* noop */ }
          effectiveAnswer = correction.right;
        }
        // Normalise: strip "vendor is X", expand "same", apply learned corrections
        const cleaned = normaliseAnswer(userId, paramName, effectiveAnswer);
        state.pendingParams[paramName] = cleaned;

        // Rule #4 + #5: read the FULL answer -- if the user provided extra
        // fields in the same reply (e.g. "vendor ABC, qty 50, heat 555"),
        // pull them out too so we don't ask for them again.
        try {
          const extras = extractEntities(answer);
          const ENTITY_TO_PARAM = {
            vendor_name: 'vendor_name', client_name: 'client_name',
            project_name: 'project_name', material_name: 'material_name',
            material_category: 'material_category', material_grade: 'material_grade',
            quantity: 'quantity', unit: 'unit', unit_cost: 'unit_cost',
            heat_number: 'heat_number', batch_number: 'batch_number',
            required_date: 'required_date', notes: 'notes',
            contact_person: 'contact_person', phone: 'phone', email: 'email',
            gst: 'tax_id', address: 'address', payment_terms: 'payment_terms',
            item_name: 'item_name', part_name: 'part_name',
            part_number: 'part_number', revision: 'revision',
            description: 'description',
          };
          for (const [eKey, pKey] of Object.entries(ENTITY_TO_PARAM)) {
            if (extras[eKey] && state.missingParams.includes(pKey) && !state.pendingParams[pKey]) {
              state.pendingParams[pKey] = extras[eKey];
            }
          }
          // Drop any params we just filled from the missing list
          state.missingParams = state.missingParams.filter(p => !state.pendingParams[p]);
        } catch (_) { /* noop -- extras are best-effort */ }
      }
      // Always drop the head (handles the skip case + ensures progress
      // even if the bulk-fill above didn't remove the current param).
      if (state.missingParams[0] === paramName) {
        state.missingParams = state.missingParams.slice(1);
      }
      setState(userId, state);

      if (state.missingParams.length > 0) {
        // Still have more params to collect
        const paramLabels = {
          project_name: 'project name', client_name: 'client name', client_id: 'client',
          project_id: 'project', vendor_id: 'vendor', vendor_name: 'vendor (company) name',
          company_name: 'company name', contact_person: 'contact person name',
          email: 'email address', phone: 'phone number', address: 'address',
          tax_id: 'GST / Tax ID (or type "skip")', payment_terms: 'payment terms (e.g. Net 30, or "skip")',
          material_id: 'material', material_category: 'material category (e.g. Steel, Aluminium)',
          material_grade: 'material grade (e.g. SS304, AL6061)',
          density: 'density (e.g. 7.85 g/cm³ -- a number)',
          quantity: 'quantity', deadline: 'deadline',
          description: 'description', items: 'items / line-items', amount: 'amount',
          part_name: 'part name', part_number: 'part number (or type "skip")',
          material_name: 'material / item name', required_quantity: 'required quantity (e.g. 100)',
          required_date: 'required date (YYYY-MM-DD or "skip")', notes: 'notes (or type "skip")',
          item_description: 'item description', unit_cost: 'unit cost (number)',
          item_name: 'item name',
          category: 'category (raw_material / consumable / safety_equipment / tools)',
          unit: 'unit of measure (e.g. Kg, Nos, Litre)',
        };
        const nextMissing = paramLabels[state.missingParams[0]] || state.missingParams[0];
        const remainingCount = state.missingParams.length;
        const remainingNote = remainingCount === 1
          ? `Only **one detail** left.`
          : `**${remainingCount}** more to go.`;
        const learnedSuggestions = buildLearnedSuggestions(userId, state.missingParams[0]);
        const defaultPick = pickLearnedDefault(userId, state.missingParams[0]);
        const smartHint = defaultPick ? `\n\n_Last time: **${defaultPick}** --- reply **same** to reuse._` : '';
        // Hint the user they can ask for the list when picking a master-data ref
        const browseHintMap = {
          client_id: 'list clients', client_name: 'list clients', company_name: 'list clients',
          vendor_id: 'list vendors', vendor_name: 'list vendors', supplier_name: 'list vendors',
          project_id: 'list projects', project_name: 'list projects',
          material_id: 'list materials', material_name: 'list materials', item_name: 'list materials',
        };
        const browseHint = browseHintMap[state.missingParams[0]];
        const browseSuggestion = browseHint ? [browseHint] : [];
        const browseTip = browseHint ? `\n\n_Don't know the value? Type **${browseHint}** to see options._` : '';
        const totalSteps = (Object.keys(state.pendingParams || {}).length) + (state.missingParams || []).length;
        const currentStepNum = (Object.keys(state.pendingParams || {}).length) + 1;
        return res.json({
          success: true,
          data: {
            type: 'step',
            message: `Step ${currentStepNum} of ${totalSteps} \u2014 ${remainingNote}\n\nWhat's the **${nextMissing}**?${smartHint}${browseTip}`,
            suggestions: [...learnedSuggestions, ...browseSuggestion, 'skip'],
            action: null,
            intent: 'followUp',
            quickActions: [],
            followUp: true,
            followUpParam: state.missingParams[0],
            step: { current: currentStepNum, total: totalSteps, field: state.missingParams[0], collected: state.pendingParams || {} },
          },
        });
      }

      // All params collected --- show confirmation card
      const toolDef = TOOL_DEFINITIONS[state.pendingAction];
      const paramSummary = Object.entries(state.pendingParams)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `• **${k.replace(/_/g, ' ')}**: ${v}`)
        .join('\n');

      return res.json({
        success: true,
        data: {
          type: 'confirmation',
          message: `**Please confirm this action:**\n\n📋 **${toolDef?.description || state.pendingAction}**\n\n${paramSummary}\n\nReply **yes** to confirm or **cancel** to abort.`,
          suggestions: ['yes', 'cancel'],
          action: null,
          intent: 'confirmation',
          quickActions: [],
          confirmationCard: {
            action: state.pendingAction,
            description: toolDef?.description || state.pendingAction,
            params: state.pendingParams,
            buttons: ['✅ Approve', '✏️ Edit', '❌ Cancel'],
          },
        },
      });
    }

    // ------ Normal intent detection & response ------------------------------------------------------------------------------------------------
    const intent = detectIntent(message);
    const companyId = req.tenantScope?.company_id || req.user?.company_id || null;
    const response = await generateResponse(intent, currentPage, req.user, companyId);

    return res.json({
      success: true,
      data: {
        message: response.message,
        suggestions: response.suggestions || [],
        action: response.action || null,
        intent: intent.type,
        quickActions: response.quickActions || [],
        confirmationCard: response.confirmationCard || null,
        followUp: response.followUp || false,
        followUpParam: response.followUpParam || null,
        toolResult: response.toolResult || null,
      },
    });
  } catch (error) {
    console.error('AI Assistant error:', error);
    return res.status(500).json({
      success: false,
      message: 'Oops, something went wrong on my end. Try again? ----',
    });
  }
};

const getSuggestions = async (req, res) => {
  try {
    const { currentPage } = req.query;
    const suggestions = getPageSuggestions(currentPage);

    return res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    console.error('AI Suggestions error:', error);
    return res.status(500).json({ success: false, message: 'Could not generate suggestions.' });
  }
};

// ------ Document upload & classification ------------------------------------------------------------------------------------------------------------------
const processDocument = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const { originalname, buffer, mimetype } = req.file;
    let textContent = '';

    // Basic text extraction (plain-text or CSV files)
    if (mimetype === 'text/plain' || mimetype === 'text/csv' || mimetype === 'application/json') {
      textContent = buffer.toString('utf-8');
    } else if (mimetype === 'application/pdf') {
      // Attempt PDF text extraction via pdf-parse if available
      try {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(buffer);
        textContent = pdfData.text || '';
      } catch {
        textContent = ''; // pdf-parse not installed --- classify by filename only
      }
    }

    const classification = classifyDocument(originalname, textContent);
    const extractedData = extractDataFromText(textContent, classification.type);
    const formatted = formatExtractedData(classification, extractedData);

    // Log the AI document action
    try {
      await AuditLog.create({
        userId: req.user?.id,
        action: 'AI_DOCUMENT_CLASSIFY',
        entityType: 'Document',
        details: { filename: originalname, classification: classification.type, confidence: classification.confidence },
        company_id: req.user?.company_id,
      });
    } catch { /* non-critical */ }

    return res.json({
      success: true,
      data: {
        message: formatted.message,
        classification,
        extractedData,
        suggestedActions: formatted.suggestedActions || [],
        suggestions: formatted.suggestions || ['Upload another document', 'Show suggestions'],
        quickActions: [],
      },
    });
  } catch (error) {
    console.error('AI Document processing error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process the document.' });
  }
};

// ------ Action history (audit log of AI actions) ------------------------------------------------------------------------------------------
const getActionHistory = async (req, res) => {
  try {
    const logs = await AuditLog.findAll({
      where: {
        userId: req.user?.id,
        action: { [Op.like]: 'AI_%' },
      },
      order: [['createdAt', 'DESC']],
      limit: 20,
    });
    return res.json({ success: true, data: logs });
  } catch (error) {
    console.error('AI Action history error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve action history.' });
  }
};

module.exports = { processMessage, getSuggestions, processDocument, getActionHistory };
