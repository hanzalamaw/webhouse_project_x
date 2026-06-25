export const MODULE_SLUG = "inventory-procurement";
export const MODULE_BASE = `/app/m/${MODULE_SLUG}`;

export const PRODUCT_STATUS = ["active", "inactive"];
export const PRODUCT_UNITS = ["piece", "kg", "g", "liter", "ml", "box", "dozen", "meter", "pack", "set"];
export const MOVEMENT_TYPES = ["initial_stock", "stock_in", "stock_out", "transfer_in", "transfer_out"];
export const TRANSFER_STATUSES = ["pending", "completed", "cancelled"];

export const MOVEMENT_LABELS = {
  initial_stock: "Initial Stock",
  stock_in: "Stock In",
  stock_out: "Stock Out",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
};
