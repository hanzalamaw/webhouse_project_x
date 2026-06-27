export const MODULE_SLUG = "crm";
export const MODULE_BASE = `/app/m/${MODULE_SLUG}`;

export const ACTIVE_CUSTOMER_DAYS = 30;

export const LEAD_SOURCES = ["website", "whatsapp", "referral", "campaign", "manual", "csv_import"];
export const LEAD_STATUSES = ["new", "contacted", "qualified", "lost", "converted"];

export const CUSTOMER_TYPES = ["retailer", "wholesaler", "distributor", "corporate", "vip", "other"];
export const CUSTOMER_STATUSES = ["active", "inactive"];

export const NOTE_TYPES = ["note", "review", "remark"];
export const ADDRESS_TYPES = ["default", "office", "home", "other"];

export const COMPLAINT_STATUSES = ["open", "in_progress", "resolved", "closed"];
export const COMPLAINT_PRIORITIES = ["low", "medium", "high", "urgent"];
export const COMPLAINT_ISSUE_TYPES = ["complaint", "issue", "request"];

export const LEAD_SOURCE_LABELS = {
  website: "Website",
  whatsapp: "WhatsApp",
  referral: "Referral",
  campaign: "Campaign",
  manual: "Manual",
  csv_import: "CSV Import",
};

export const LEAD_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  lost: "Lost",
  converted: "Converted",
};

export const CUSTOMER_STATUS_LABELS = {
  active: "Active",
  inactive: "Inactive",
};

export const CUSTOMER_TYPE_LABELS = {
  retailer: "Retailer",
  wholesaler: "Wholesaler",
  distributor: "Distributor",
  corporate: "Corporate",
  vip: "VIP",
  other: "Other",
};

export const ADDRESS_TYPE_LABELS = {
  default: "Default",
  office: "Office",
  home: "Home",
  other: "Other",
};

export const NOTE_TYPE_LABELS = {
  note: "Note",
  review: "Review",
  remark: "Remark",
};

export const ISSUE_TYPE_LABELS = {
  complaint: "Complaint",
  issue: "Issue",
  request: "Request",
};
