export const FINANCE_MODULE = "Finance & Accounting";

export const VENDOR_BILL_STATUSES = ["unpaid", "partial", "paid"];
export const EXPENSE_PAYMENT_METHODS = ["cash", "bank_transfer", "card", "online", "other"];
export const RECURRING_FREQUENCIES = ["monthly", "quarterly", "yearly"];
export const RECURRING_STATUSES = ["active", "paused", "cancelled"];
export const BANK_ACCOUNT_STATUSES = ["active", "inactive"];

export const TRANSACTION_TYPES = {
  CUSTOMER_PAYMENT: "customer_payment",
  VENDOR_PAYMENT: "vendor_payment",
  EXPENSE: "expense",
  RECURRING_EXPENSE: "recurring_expense",
  ADJUSTMENT: "adjustment",
};
