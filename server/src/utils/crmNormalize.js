import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  CUSTOMER_TYPES,
  CUSTOMER_STATUSES,
  LEAD_SOURCE_LABELS,
  CUSTOMER_TYPE_LABELS,
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

const SOURCE_ALIASES = {
  web: "website",
  site: "website",
  wa: "whatsapp",
  import: "csv_import",
  csv: "csv_import",
};

export function normalizeLeadSource(value, fallback = "csv_import") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const alias = SOURCE_ALIASES[slugify(raw)];
  if (alias) return alias;
  const key = SOURCE_INDEX.get(raw.toLowerCase()) || SOURCE_INDEX.get(slugify(raw));
  if (key && LEAD_SOURCES.includes(key)) return key;
  const slug = slugify(raw);
  if (LEAD_SOURCES.includes(slug)) return slug;
  throw new Error(`Invalid lead source "${raw}". Use: ${LEAD_SOURCES.join(", ")} or labels like Website, WhatsApp, Manual`);
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
  if (key && CUSTOMER_TYPES.includes(key)) return key;
  if (CUSTOMER_TYPES.includes(slugify(raw))) return slugify(raw);
  throw new Error(`Invalid customer type "${raw}". Use: ${CUSTOMER_TYPES.join(", ")} or labels like Retailer, VIP`);
}

export function normalizeCustomerStatus(value, fallback = "active") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const s = slugify(raw);
  if (CUSTOMER_STATUSES.includes(s)) return s;
  throw new Error(`Invalid customer status "${raw}". Use: ${CUSTOMER_STATUSES.join(", ")}`);
}
