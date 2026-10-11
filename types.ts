
export enum ItemType {
  FILE = 'file',
  FOLDER = 'folder'
}

export enum ProjectStatus {
  ONGOING = 'نشطة / جارية',
  DESIGN = 'قيد المراجعة', 
  PAUSED = 'مؤقتة / معلقة',
  COMPLETED = 'مكتملة / مؤرشفة'
}

export type PortfolioCategory = string;

export interface PortfolioCustomField {
  id: string;
  key: string;
  value: string;
}

export interface PortfolioCategoryMeta {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgGradient: string;
  badgeBg: string;
  badgeText: string;
  description: string;
  isCustom?: boolean;
}

export const PORTFOLIO_CATEGORIES: PortfolioCategoryMeta[] = [
  {
    id: 'general',
    name: 'حافظة عامة',
    icon: 'fa-box-archive',
    color: 'blue',
    bgGradient: 'from-blue-100 via-slate-50 to-blue-200 border-blue-300',
    badgeBg: 'bg-blue-600',
    badgeText: 'text-white',
    description: 'مستندات وأوراق عامة'
  },
  {
    id: 'personal',
    name: 'شخصية ورسمية',
    icon: 'fa-id-card',
    color: 'amber',
    bgGradient: 'from-amber-100 via-orange-50 to-amber-200 border-amber-300',
    badgeBg: 'bg-amber-600',
    badgeText: 'text-white',
    description: 'هويات وأوراق شخصية'
  },
  {
    id: 'engineering',
    name: 'مشروعات وهندسة',
    icon: 'fa-compass-drafting',
    color: 'teal',
    bgGradient: 'from-teal-100 via-emerald-50 to-teal-200 border-teal-300',
    badgeBg: 'bg-teal-600',
    badgeText: 'text-white',
    description: 'مخططات ومشاريع موقع'
  },
  {
    id: 'real_estate',
    name: 'عقارات وعقود',
    icon: 'fa-house-lock',
    color: 'purple',
    bgGradient: 'from-purple-100 via-indigo-50 to-purple-200 border-purple-300',
    badgeBg: 'bg-purple-600',
    badgeText: 'text-white',
    description: 'عقود وصكوك عقارية'
  },
  {
    id: 'financial',
    name: 'مالية وبنوك',
    icon: 'fa-wallet',
    color: 'emerald',
    bgGradient: 'from-emerald-100 via-green-50 to-emerald-200 border-emerald-300',
    badgeBg: 'bg-emerald-600',
    badgeText: 'text-white',
    description: 'فواتير وحسابات مالية'
  },
  {
    id: 'business',
    name: 'أعمال وتجارة',
    icon: 'fa-briefcase',
    color: 'indigo',
    bgGradient: 'from-indigo-100 via-slate-50 to-indigo-200 border-indigo-300',
    badgeBg: 'bg-indigo-600',
    badgeText: 'text-white',
    description: 'سجلات وأوراق تجارية'
  },
  {
    id: 'medical',
    name: 'صحية وطبية',
    icon: 'fa-notes-medical',
    color: 'rose',
    bgGradient: 'from-rose-100 via-red-50 to-rose-200 border-rose-300',
    badgeBg: 'bg-rose-600',
    badgeText: 'text-white',
    description: 'تقارير وتحاليل طبية'
  },
  {
    id: 'academic',
    name: 'تعليمية وأكاديمية',
    icon: 'fa-graduation-cap',
    color: 'sky',
    bgGradient: 'from-sky-100 via-blue-50 to-sky-200 border-sky-300',
    badgeBg: 'bg-sky-600',
    badgeText: 'text-white',
    description: 'شهادات ودورات تعليمية'
  },
  {
    id: 'legal',
    name: 'قانونية وقضايا',
    icon: 'fa-scale-balanced',
    color: 'slate',
    bgGradient: 'from-slate-200 via-gray-100 to-slate-300 border-slate-400',
    badgeBg: 'bg-slate-700',
    badgeText: 'text-white',
    description: 'التوكيلات الرسمية، العقود القانونية، القضايا'
  }
];

// NEW: Sync Action Types
export enum SyncActionType {
  CREATE_PROJECT = 'CREATE_PROJECT',
  UPDATE_PROJECT = 'UPDATE_PROJECT',
  DELETE_PROJECT = 'DELETE_PROJECT',
  UPLOAD_FILE = 'UPLOAD_FILE',
  DELETE_FILE = 'DELETE_FILE',
  SAVE_LETTER = 'SAVE_LETTER'
}

export interface SyncQueueItem {
  id: string;
  action: SyncActionType;
  payload: any;
  createdAt: number;
  retryCount: number;
  status?: 'pending' | 'failed'; // NEW
  errorMessage?: string; // NEW
}

export interface Task {
  id: string;
  content: string;
  isDone: boolean;
  createdAt: string;
  type?: 'manual' | 'auto';
  priority?: 'high' | 'normal' | 'low';
  relatedProjectId?: string;
}

export interface ProjectLog {
  id: string;
  date: string;
  content: string;
  images?: string[]; // Array of Base64 strings or URLs
  createdAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  status?: string;
}

export interface PaymentItem {
  itemCode?: string;      // Matches BOQ
  description: string;    // Matches BOQ
  unit?: string;
  
  // Quantities
  contractQuantity?: number; // Matches BOQ
  prevQuantity?: number;
  currQuantity?: number;
  totalQuantity?: number; // Cumulative
  
  // Financials
  unitPrice?: number;     // Matches BOQ
  completionRatio?: number; // Percentage
  totalValue?: number;    // totalQuantity * unitPrice * ratio
}

export interface ProjectPayment {
  id: string;
  invoiceNumber?: string; // NEW
  date: string;
  
  // Financials
  cumulativeAmount: number; // إجمالي الأعمال حتى تاريخه
  netAmount: number;        // صافي هذا المستخلص
  
  note: string;
  items?: PaymentItem[]; // Analyzed items from the document
  attachments?: string[]; // Base64 or URLs
}

export interface BOQItem {
  id: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  executedQuantity: number;
  batchId?: string;
  batchName?: string;
}

export interface MaterialRequirement {
  materialName: string;
  unit: string;
  quantityPerUnit: number;
  totalQuantity: number;
  wastePercentage: number;
  totalWithWaste: number;
}

export interface MaterialCalculationResult {
  itemName: string;
  inputQuantity: string;
  materials: MaterialRequirement[];
  notes: string;
  calculationBasis: string;
}

export interface CostElement {
  type: 'Material' | 'Labor' | 'Equipment' | 'Other' | 'Tools';
  description: string;
  unit: string;
  rate: number;
  consumption: number;
  cost: number;
}

export interface PricingCalculationResult {
  itemName: string;
  unit: string;
  directCost: number;
  indirectCostPercent: number;
  profitPercent: number;
  finalUnitPrice: number;
  breakdown: CostElement[];
  currency: string;
  pricingBasis: string;
}

export interface ScheduleTask {
    id: string;
    taskName: string;
    startDay: number;
    duration: number;
    endDay: number;
    dependencies: string[];
    phase: string;
}

export interface ScheduleResult {
    projectName: string;
    totalDuration: number;
    tasks: ScheduleTask[];
    criticalPath: string[];
    recommendations: string;
}

// NEW: Expanded Market Categories (Added Solar, Pools, Smart Home, etc.)
export type MarketCategory = 
    // Ministry Bulletin (Updated Name Logic)
    'ministry_bulletin' |
    // Structural
    'steel' | 'cement' | 'bricks' | 'aggregates' | 'concrete' | 'additives' | 'blocks' |
    // Insulation & Chemicals
    'insulation_water' | 'insulation_thermal' | 'insulation_sound' | 'chemicals_flooring' | 'chemicals_repair' |
    // Finishing - Walls/Floors
    'paints_interior' | 'paints_exterior' | 'gypsum_board' | 'cornices' | 'wallpaper' |
    'ceramics' | 'porcelain' | 'marble' | 'granite' | 'parquet' | 'hdl_flooring' |
    // Openings
    'aluminum' | 'upvc' | 'wood_doors' | 'glass' | 'accessories_door' |
    // MEP - Plumbing
    'plumbing_pipes' | 'plumbing_fittings' | 'sanitary_ware' | 'water_tanks' | 'pumps' | 'swimming_pools' |
    // MEP - Electrical
    'cables_wires' | 'conduits' | 'lighting_units' | 'switches_sockets' | 'panels_breakers' | 'low_current' | 'smart_home' | 'solar_energy' |
    // MEP - HVAC & Fire
    'hvac_units' | 'ducts' | 'fire_fighting' | 'fire_alarm' |
    // External & Landscape
    'interlock' | 'basalt' | 'artificial_grass' | 'fences' | 'landscape_soft' |
    // Labor & Equip
    'labor_daily' | 'equipment_rental' | 'scaffolding' | 'tools_hardware' |
    // Elevators
    'elevators' |
    // Other
    'other';

// NEW: Detail Structure for Material Info
export interface MaterialDetailData {
    description: string;
    specifications: string[];
    usageSteps: string[];
    consumptionRates: string;
    technicalTips: string[];
    safetyPrecautions: string;
}

export interface MarketItem {
    id: string;
    name: string;
    unit: string;
    price: number;
    category: MarketCategory;
    lastUpdated: string;
    trend?: 'up' | 'down' | 'stable';
    source?: string;
    details?: MaterialDetailData; // NEW: Persisted details
    isWatchlisted?: boolean; // NEW: For Pulse Ticker
    
    // NEW: Bulletin Support
    bulletinId?: string; // ID grouping items into one bulletin card
    bulletinName?: string; // Display name of the bulletin (e.g. "نشرة مايو 2024")
}

export interface EngineeringReportItem {
    id: string;
    type: 'soil' | 'concrete' | 'proctor' | 'steel_test' | 'general' | 'memo';
    title: string;
    content: string; // HTML content
    date: string;
    summary?: string;
}

export interface RFI {
  id: string;
  refNumber: string;
  subject: string;
  date: string;
  location: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Approved with Notes';
  attachments?: string[];
  response?: string;
  responseDate?: string;
  htmlContent?: string; // NEW: AI Generated HTML
}

export interface Submittal {
  id: string;
  refNumber: string;
  type: 'Material' | 'Shop Drawing' | 'Method Statement' | 'Other';
  description: string;
  submissionDate: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Revise and Resubmit';
  attachments?: string[];
  response?: string;
  responseDate?: string;
  htmlContent?: string; // NEW: AI Generated HTML
}

export interface Correspondence {
  id: string;
  refNumber: string;
  direction: 'Incoming' | 'Outgoing';
  subject: string;
  entity: string; // To/From whom
  date: string;
  content?: string;
  htmlContent?: string; // NEW: AI Generated HTML
  attachments?: string[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  isChecked: boolean;
  notes?: string;
}

export interface Checklist {
  id: string;
  refNumber: string;
  activityName: string; // e.g., "صب خرسانة سقف", "أعمال مباني"
  items: ChecklistItem[];
  status: 'Open' | 'Completed' | 'Verified';
  inspectorName?: string;
  date: string;
  location?: string;
  htmlContent?: string; // NEW: AI Generated HTML
}

export interface NCR {
  id: string;
  ncrNumber: string;
  description: string;
  rootCause?: string;
  correctiveAction?: string;
  status: 'Open' | 'Closed';
  issueDate: string;
  closureDate?: string;
  photos?: string[];
  location?: string;
  htmlContent?: string; // NEW: AI Generated HTML
}

export interface Project {
  id: string;
  name: string;
  category?: PortfolioCategory; // NEW: Category for portfolio (Personal, Engineering, Real Estate, etc.)
  customFields?: PortfolioCustomField[]; // NEW: Custom fields (e.g. key: "رقم الهوية", value: "12345")
  location?: string;
  contractor?: string;
  value?: string;
  handoverDate?: string;
  completionDate?: string;
  status: ProjectStatus;
  autoStatusReason?: string;
  
  fullDescription: string;
  executionLogs: ProjectLog[];
  payments: ProjectPayment[];
  boqItems: BOQItem[];
  
  // NEW: Store exact coordinates to avoid geocoding every time
  lat?: number;
  lng?: number;

  // NEW: Multiple Engineering Reports Array
  engineeringReports?: EngineeringReportItem[];
  
  // NEW: Document Control System (DCS)
  rfis?: RFI[];
  submittals?: Submittal[];
  correspondence?: Correspondence[];

  // NEW: Quality, Health, Safety & Environment (QHSE)
  checklists?: Checklist[];
  ncrs?: NCR[];

  // DEPRECATED: Old single field (Keep for backward compatibility during migration)
  soilReportAnalysis?: string;

  calculatedProgress: number;
  boqFolderId: string;
  createdAt: string;
  driveFolderId?: string; // Explicitly optional now
}

export type Portfolio = Project;

export interface FileItem {
  id: string;
  parentId: string;
  name: string;
  type: ItemType;
  mimeType?: string;
  url?: string;
  previewUrl?: string;
  webViewLink?: string;
  webContentLink?: string;
  fileCount?: number;
  folderCount?: number;
  createdTime: string;
  content?: string;
  isSystem?: boolean;
  projectName?: string;
  size?: number; // ADDED: File size in bytes
}
