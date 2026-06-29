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

const API_RESOURCE_LABELS = [
  { match: /\/inventory\/products/i, create: "a product", update: "a product", delete: "a product" },
  { match: /\/inventory\/warehouses/i, create: "a warehouse", update: "a warehouse", delete: "a warehouse" },
  { match: /\/inventory\/stock-movements/i, create: "a stock movement", update: "a stock movement", delete: "a stock movement" },
  { match: /\/inventory\/stock-transfers/i, create: "a stock transfer", update: "a stock transfer", delete: "a stock transfer" },
  { match: /\/inventory\/categories/i, create: "a category", update: "a category", delete: "a category" },
  { match: /\/pos\//i, create: "a POS record", update: "a POS record", delete: "a POS record" },
  { match: /\/crm\/leads/i, create: "a lead", update: "a lead", delete: "a lead" },
  { match: /\/crm\/customers/i, create: "a customer", update: "a customer", delete: "a customer" },
  { match: /\/crm\/complaints/i, create: "a complaint", update: "a complaint", delete: "a complaint" },
  { match: /\/tenant\/users/i, create: "a user", update: "a user", delete: "a user" },
  { match: /\/tenant\/roles/i, create: "a role", update: "a role", delete: "a role" },
  { match: /\/tenant\/organization-settings/i, update: "organization settings" },
  { match: /\/tenant\/sessions/i, update: "a session" },
];

function verbForMethod(method) {
  if (method === "POST") return "Created";
  if (method === "PUT" || method === "PATCH") return "Updated";
  if (method === "DELETE") return "Deleted";
  return method;
}

export function describeImpersonationApiAction(method, path) {
  const verb = verbForMethod(method);
  for (const rule of API_RESOURCE_LABELS) {
    if (!rule.match.test(path)) continue;
    if (method === "POST" && rule.create) return `Impersonation: ${verb} ${rule.create}`;
    if ((method === "PUT" || method === "PATCH") && rule.update) return `Impersonation: ${verb} ${rule.update}`;
    if (method === "DELETE" && rule.delete) return `Impersonation: ${verb} ${rule.delete}`;
  }
  const short = String(path || "").replace(/^\/api\//, "");
  return `Impersonation: ${verb} ${short || "tenant data"}`;
}

export function describeWhAuditAction(action) {
  if (!action) return "Unknown action";
  if (WH_ACTION_LABELS[action]) return WH_ACTION_LABELS[action];
  if (action.startsWith("tenant_impersonation:")) {
    const inner = action.slice("tenant_impersonation:".length);
    if (TENANT_ACTION_LABELS[inner]) return `Impersonation: ${TENANT_ACTION_LABELS[inner]}`;
    if (inner.startsWith("crm_")) {
      const label = inner.replace(/^crm_/, "").replace(/_/g, " ");
      return `Impersonation: ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
    }
    return `Impersonation: ${inner.replace(/_/g, " ")}`;
  }
  if (action.startsWith("impersonation:")) {
    const rest = action.slice("impersonation:".length).trim();
    const [method, ...pathParts] = rest.split(" ");
    return describeImpersonationApiAction(method, pathParts.join(" "));
  }
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function describeTenantAuditAction(action) {
  if (!action) return "Unknown action";
  if (TENANT_ACTION_LABELS[action]) return TENANT_ACTION_LABELS[action];
  if (action.startsWith("crm_")) {
    const label = action.replace(/^crm_/, "").replace(/_/g, " ");
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
