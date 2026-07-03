import { formatDateTime } from "./dateTime";

// Friendly labels for common field keys so non-technical readers understand logs.
const FIELD_LABELS = {
  customer_id: "Customer",
  customer_name: "Customer name",
  company_name: "Company",
  product_id: "Product",
  product_name: "Product",
  new_product_id: "New product",
  old_product_id: "Old product",
  warehouse_id: "Warehouse",
  warehouse_name: "Warehouse",
  order_id: "Order",
  order_no: "Order number",
  order_source: "Order channel",
  order_status: "Order status",
  payment_status: "Payment status",
  payment_method: "Payment method",
  fulfillment_status: "Fulfillment status",
  return_status: "Return status",
  exchange_status: "Exchange status",
  refund_status: "Refund status",
  refund_method: "Refund method",
  refund_amount: "Refund amount",
  payable_amount: "Payable amount",
  total_amount: "Total amount",
  discount_amount: "Discount",
  delivery_charges: "Delivery charges",
  delivery_address: "Delivery address",
  unit_price: "Unit price",
  total_price: "Line total",
  quantity: "Quantity",
  sku: "SKU",
  is_active: "Active",
  is_read: "Read",
  is_default: "Default",
  role_id: "Role",
  role_name: "Role",
  module_id: "Module",
  module_name: "Module",
  user_id: "User",
  user_name: "User",
  tenant_id: "Tenant",
  created_at: "Created on",
  updated_at: "Updated on",
  paid_at: "Paid on",
  refunded_at: "Refunded on",
  cancelled_at: "Cancelled on",
  phone: "Phone",
  email: "Email",
  status: "Status",
  priority: "Priority",
  note: "Note",
  notes: "Notes",
  reason: "Reason",
  address: "Address",
  city: "City",
  state: "State",
  postal_code: "Postal code",
  tags: "Tags",
  permissions: "Permissions",
};

function humanizeSegment(seg) {
  const key = String(seg || "").trim();
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/_id$/i, "")
    .replace(/_/g, " ")
    .replace(/\bid\b/gi, "ID")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Turns keys like "permissions.orders.create" into "Permissions › Orders › Create".
export function humanizeFieldLabel(key) {
  if (!key) return "";
  return String(key)
    .split(".")
    .map(humanizeSegment)
    .join(" › ");
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const SNAKE_WORD_RE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

// Internal/technical fields that mean nothing to a normal reader.
const HIDDEN_KEYS = new Set([
  "id",
  "tenant_id",
  "user_id",
  "deleted_at",
  "created_by",
  "updated_by",
  "entity_type",
  "entity_id",
  "summary",
  "password",
  "password_hash",
  "encrypted_password",
  "token",
  "reset_token",
  "sessionId",
  "session_id",
  "assignable_modules",
]);

function flattenObject(obj, prefix = "") {
  const out = {};
  if (obj == null || typeof obj !== "object") return out;
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(out, flattenObject(val, path));
    } else {
      out[path] = val;
    }
  }
  return out;
}

function isHidden(path) {
  const last = path.split(".").pop();
  return HIDDEN_KEYS.has(last);
}

// A short human sentence some logs carry (e.g. CRM activity summaries).
export function getAuditSummary(value) {
  if (value && typeof value === "object" && typeof value.summary === "string" && value.summary.trim()) {
    return value.summary.trim();
  }
  return null;
}

// Turns raw old/new JSON into readable change rows, skipping internal fields.
export function buildAuditChanges(oldValue, newValue) {
  const oldFlat = flattenObject(oldValue);
  const newFlat = flattenObject(newValue);
  const keys = [...new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])]
    .filter((k) => !isHidden(k))
    .sort();

  return keys
    .map((key) => {
      const oldV = oldFlat[key];
      const newV = newFlat[key];
      const changed = JSON.stringify(oldV) !== JSON.stringify(newV);
      const isNew = !(key in oldFlat) || oldV === null || oldV === undefined || oldV === "";
      return {
        key,
        label: humanizeFieldLabel(key),
        fromText: humanizeFieldValue(oldV),
        toText: humanizeFieldValue(newV),
        changed,
        isNew,
      };
    })
    .filter((row) => row.changed);
}

export function humanizeFieldValue(value) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.length ? value.map((v) => humanizeFieldValue(v)).join(", ") : "None";
  }
  if (typeof value === "object") {
    const parts = Object.entries(value).map(([k, v]) => `${humanizeSegment(k)}: ${humanizeFieldValue(v)}`);
    return parts.length ? parts.join(", ") : "None";
  }
  if (typeof value === "string") {
    if (ISO_DATE_RE.test(value)) return formatDateTime(value);
    if (SNAKE_WORD_RE.test(value)) {
      return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    }
    return value;
  }
  return String(value);
}
