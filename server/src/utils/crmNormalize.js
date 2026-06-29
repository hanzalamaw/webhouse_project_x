import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  CUSTOMER_TYPES,
  CUSTOMER_STATUSES,
  ADDRESS_TYPES,
  LEAD_SOURCE_LABELS,
  CUSTOMER_TYPE_LABELS,
  ADDRESS_TYPE_LABELS,
} from "./crmConstants.js";

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function buildLabelIndex(labels) {
  const index = new Map();
  for (const [key, label] of Object.entries(labels)) {
    index.set(key.toLowerCase(), key);
    index.set(slugify(key), key);
    index.set(String(label).toLowerCase(), key);
    index.set(slugify(label), key);
  }
  return index;
}

const SOURCE_INDEX = buildLabelIndex(LEAD_SOURCE_LABELS);
const TYPE_INDEX = buildLabelIndex(CUSTOMER_TYPE_LABELS);
const ADDRESS_INDEX = buildLabelIndex(ADDRESS_TYPE_LABELS);

const ADDRESS_LEGACY = {
  billing: "office",
  shipping: "office",
  default: "office",
};

const CUSTOMER_PRESETS = CUSTOMER_TYPES.filter((t) => t !== "other");
const ADDRESS_PRESETS = ADDRESS_TYPES.filter((t) => t !== "other");

const SOURCE_ALIASES = {
  web: "website",
  site: "website",
  wa: "whatsapp",
  import: "csv_import",
  csv: "csv_import",
};

const SOURCE_PRESETS = LEAD_SOURCES.filter((s) => s !== "other" && s !== "csv_import");

export function normalizeLeadSource(value, fallback = "manual") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const alias = SOURCE_ALIASES[slugify(raw)];
  if (alias) return alias;
  const key = SOURCE_INDEX.get(raw.toLowerCase()) || SOURCE_INDEX.get(slugify(raw));
  if (key && SOURCE_PRESETS.includes(key)) return key;
  const slug = slugify(raw);
  if (SOURCE_PRESETS.includes(slug)) return slug;
  if (raw.length > 100) throw new Error("Lead source must be 100 characters or less");
  return raw;
}

export function normalizeLeadStatus(value, fallback = "new", { forImport = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const s = slugify(raw);
  if (forImport && s === "converted") return "new";
  if (LEAD_STATUSES.includes(s)) return s;
  if (raw.toLowerCase() === "in progress") return "contacted";
  throw new Error(`Invalid lead status "${raw}". Use: ${LEAD_STATUSES.filter((x) => x !== "converted").join(", ")}`);
}

export function normalizeCustomerType(value, fallback = "retailer") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const key = TYPE_INDEX.get(raw.toLowerCase()) || TYPE_INDEX.get(slugify(raw));
  if (key && CUSTOMER_PRESETS.includes(key)) return key;
  if (CUSTOMER_PRESETS.includes(slugify(raw))) return slugify(raw);
  if (raw.length > 45) throw new Error("Customer type must be 45 characters or less");
  return raw;
}

export function normalizeAddressType(value, fallback = "office") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const slug = slugify(raw);
  if (ADDRESS_LEGACY[slug]) return ADDRESS_LEGACY[slug];
  const key = ADDRESS_INDEX.get(raw.toLowerCase()) || ADDRESS_INDEX.get(slug);
  if (key && ADDRESS_PRESETS.includes(key)) return key;
  if (ADDRESS_PRESETS.includes(slug)) return slug;
  if (raw.length > 45) throw new Error("Address type must be 45 characters or less");
  return raw;
}

export function normalizeCustomerStatus(value, fallback = "active") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const s = slugify(raw);
  if (CUSTOMER_STATUSES.includes(s)) return s;
  throw new Error(`Invalid customer status "${raw}". Use: ${CUSTOMER_STATUSES.join(", ")}`);
}
