const WH_ACTION_LABELS = {
  module_create: "Created a module",
  module_update: "Updated a module",
  module_delete: "Deleted a module",
  subscription_create: "Created a subscription plan",
  subscription_update: "Updated a subscription plan",
  subscription_delete: "Deleted a subscription plan",
  support_ticket_create: "Created a support ticket",
  support_ticket_update: "Updated a support ticket",
  support_ticket_delete: "Deleted a support ticket",
  tenant_create: "Created a tenant",
  tenant_update: "Updated a tenant",
  tenant_update_full: "Updated tenant details",
  tenant_delete: "Deleted a tenant",
  session_terminate: "Ended a user session",
  impersonate_start: "Started impersonating a tenant",
};

const TENANT_ACTION_LABELS = {
  organization_settings_update: "Updated organization settings",
  user_create: "Created a user",
  user_update: "Updated a user",
  role_create: "Created a role",
  role_update: "Updated role permissions",
  session_terminate: "Ended a session",
  crm_lead_created: "Created a lead",
  crm_lead_updated: "Updated a lead",
  crm_lead_converted: "Converted a lead to customer",
  crm_customer_created: "Created a customer",
  crm_customer_updated: "Updated a customer",
  crm_customer_note_added: "Added a customer note",
  crm_complaint_created: "Created a complaint",
  crm_complaint_updated: "Updated a complaint",
};

function titleCaseWords(text) {
  return String(text || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatWhAuditAction(action) {
  if (!action) return "—";
  if (action.startsWith("Impersonation:")) return action;
  if (WH_ACTION_LABELS[action]) return WH_ACTION_LABELS[action];
  if (action.startsWith("tenant_impersonation:")) {
    const inner = action.slice("tenant_impersonation:".length);
    if (TENANT_ACTION_LABELS[inner]) return `Impersonation: ${TENANT_ACTION_LABELS[inner]}`;
    return `Impersonation: ${titleCaseWords(inner.replace(/^crm_/, ""))}`;
  }
  if (action.startsWith("impersonation:")) {
    const rest = action.slice("impersonation:".length).trim();
    const [method, ...pathParts] = rest.split(" ");
    const path = pathParts.join(" ");
    const verb = method === "POST" ? "Created" : method === "DELETE" ? "Deleted" : "Updated";
    if (path.includes("/inventory/products")) return `Impersonation: ${verb} a product`;
    if (path.includes("/inventory/warehouses")) return `Impersonation: ${verb} a warehouse`;
    if (path.includes("/inventory/stock-movements")) return `Impersonation: ${verb} stock`;
    if (path.includes("/inventory/stock-transfers")) return `Impersonation: ${verb} a transfer`;
    if (path.includes("/crm/leads")) return `Impersonation: ${verb} a lead`;
    if (path.includes("/crm/customers")) return `Impersonation: ${verb} a customer`;
    if (path.includes("/crm/complaints")) return `Impersonation: ${verb} a complaint`;
    if (path.includes("/tenant/users")) return `Impersonation: ${verb} a user`;
    if (path.includes("/pos/")) return `Impersonation: ${verb} POS data`;
    return `Impersonation: ${verb} ${path.replace(/^\/api\//, "")}`;
  }
  return titleCaseWords(action);
}

export function formatTenantAuditAction(action) {
  if (!action) return "—";
  if (TENANT_ACTION_LABELS[action]) return TENANT_ACTION_LABELS[action];
  if (action.startsWith("crm_")) return titleCaseWords(action.replace(/^crm_/, ""));
  return titleCaseWords(action);
}
