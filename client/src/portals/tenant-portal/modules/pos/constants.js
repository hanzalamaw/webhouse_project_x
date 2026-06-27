export const MODULE_BASE = "/app/m/pos";

export const OUTLET_STATUSES = ["active", "inactive"];
export const TERMINAL_STATUSES = ["active", "inactive"];
export const PAYMENT_STATUSES = ["paid", "pending", "refunded"];

export function labelize(value) {
  if (value == null || value === "") return value;
  const s = String(value);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const OUTLET_STATUS_LABELS = {
  active: "Active",
  inactive: "Inactive",
};

export const TERMINAL_STATUS_LABELS = {
  active: "Active",
  inactive: "Inactive",
};

export const PAYMENT_STATUS_LABELS = {
  paid: "Paid",
  pending: "Pending",
  refunded: "Refunded",
  cash: "Cash",
  card: "Card",
  qris: "Qris",
};

export const PRODUCT_STATUS = ["active", "inactive"];
export const PRODUCT_UNITS = ["piece", "kg", "g", "liter", "ml", "box", "dozen", "meter", "pack", "set"];
export const MOVEMENT_TYPES = ["initial_stock", "stock_in", "stock_out", "transfer_in", "transfer_out"];
export const MOVEMENT_LABELS = {
  initial_stock: "Initial Stock",
  stock_in: "Stock In",
  stock_out: "Stock Out",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
};
export const PAYMENT_METHODS = ["cash", "card", "qris"];
