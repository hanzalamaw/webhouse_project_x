export const MODULE_SLUG = "order-management";
export const MODULE_BASE = `/app/m/${MODULE_SLUG}`;

export const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"];
export const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "refunded", "failed"];
export const FULFILLMENT_STATUSES = ["unfulfilled", "partial", "fulfilled"];
export const ORDER_SOURCES = ["manual", "shopify", "daraz", "facebook", "instagram", "website", "pos", "csv_import"];

export const PAYMENT_METHODS = ["cod", "card", "bank_transfer", "cash", "online", "other"];
export const PAYMENT_RECORD_STATUSES = ["pending", "paid", "partial", "failed", "refunded"];

export const ASSIGNMENT_TYPES = ["staff", "warehouse", "fulfillment", "courier", "verification"];
export const ASSIGNMENT_STATUSES = ["pending", "active", "completed", "cancelled"];

export const RETURN_STATUSES = ["requested", "approved", "received", "rejected", "completed"];
export const EXCHANGE_STATUSES = ["requested", "approved", "completed", "rejected"];
export const REFUND_STATUSES = ["pending", "processed", "failed", "cancelled"];
export const REFUND_METHODS = ["original_payment", "bank_transfer", "cash", "store_credit", "other"];

export const ORDER_STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const PAYMENT_STATUS_LABELS = {
  unpaid: "Unpaid",
  partial: "Partial Paid",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Failed",
};

export const ORDER_SOURCE_LABELS = {
  manual: "Manual",
  shopify: "Shopify",
  daraz: "Daraz",
  facebook: "Facebook",
  instagram: "Instagram",
  website: "Website",
  pos: "POS",
  csv_import: "CSV Import",
  other: "Other",
};

export const PAYMENT_METHOD_LABELS = {
  cod: "COD",
  card: "Card",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  online: "Online",
  other: "Other",
};

export const ASSIGNMENT_TYPE_LABELS = {
  staff: "Staff",
  warehouse: "Warehouse Team",
  fulfillment: "Fulfillment Team",
  courier: "Courier Team",
  verification: "Verification Agent",
};

export const PRINT_DOC_TYPES = [
  { key: "invoice", label: "Invoice" },
  { key: "packing_slip", label: "Packing Slip" },
  { key: "receipt", label: "Order Receipt" },
  { key: "delivery", label: "Delivery Document" },
];
