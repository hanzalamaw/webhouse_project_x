export const MODULE_BASE = "/app/m/finance";

export const VENDOR_BILL_STATUSES = ["unpaid", "partial", "paid"];
export const EXPENSE_PAYMENT_METHODS = ["cash", "bank_transfer", "card", "online", "other"];
export const RECURRING_FREQUENCIES = ["monthly", "quarterly", "yearly"];
export const RECURRING_STATUSES = ["active", "paused", "cancelled"];
export const BANK_ACCOUNT_STATUSES = ["active", "inactive"];

export const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  online: "Online",
  qris: "QRIS",
  other: "Other",
};

export const CUSTOMER_PAYMENT_SOURCE_LABELS = {
  order: "Order (Inventory & Procurement)",
  pos: "POS Terminal",
};

export const TRANSACTION_TYPE_LABELS = {
  customer_payment: "Customer payment",
  vendor_payment: "Vendor payment",
  expense: "Expense",
  recurring_expense: "Recurring expense",
  adjustment: "Adjustment",
};

export function labelFor(map, value) {
  return map[value] || value || "—";
}
