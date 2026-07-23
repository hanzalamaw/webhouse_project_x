/** Canonical module_name → frontend slug (mirrors client registry). */
export const MODULE_NAME_TO_SLUG = {
  Admin: "admin",
  "Logistics Partners": "logistics-partners",
  "Order Management": "order-management",
  POS: "pos",
  CRM: "crm",
  "E-Commerce Integration": "ecommerce",
  "Finance & Accounting": "finance",
  "Inventory & Procurement": "inventory-procurement",
  "POS Terminal": "pos-terminal",
};

export function slugForModuleName(moduleName) {
  return MODULE_NAME_TO_SLUG[moduleName] || null;
}
