/**
 * Central tenant isolation helpers for raw SQL repositories.
 * tenant_id must always come from verified auth context (see tenantContext.js).
 */

/** Tables with a tenant_id column — used by query guard and cascade delete. */
export const TENANT_SCOPED_TABLES = new Set([
  "wh_tenant_modules",
  "wh_tenant_limits",
  "wh_tenant_subscriptions",
  "wh_tenant_payments",
  "wh_support_tickets",
  "roles",
  "users",
  "audit_logs",
  "sessions",
  "organization_settings",
  "activity_alerts",
  "inventory_categories",
  "inventory_products",
  "inventory_product_variants",
  "inventory_variant_attributes",
  "inventory_warehouses",
  "inventory_stock_levels",
  "inventory_stock_movements",
  "inventory_stock_transfers",
  "crm_customers",
  "crm_customer_addresses",
  "crm_leads",
  "crm_customer_complaints",
  "orders",
  "order_items",
  "order_assignments",
  "order_payments",
  "order_cancellations",
  "order_returns",
  "order_exchanges",
  "order_refunds",
  "order_field_options",
  "ecom_store_connections",
  "ecom_sync_logs",
  "ecom_external_orders",
  "ecom_synced_records",
  "ecom_entity_links",
  "ecom_oauth_pending_states",
  "ecom_oauth_sessions",
  "finance_vendor_bills",
  "finance_vendor_payments",
  "finance_expense_categories",
  "finance_expense_sub_categories",
  "finance_expenses",
  "finance_recurring_expenses",
  "finance_bank_accounts",
  "finance_transactions",
  "logistics_courier_partners",
  "logistics_tracking_sync_logs",
  "logistics_pickup_requests",
  "logistics_pickup_orders",
  "pos_outlets",
  "pos_terminals",
  "pos_sales",
  "pos_sale_items",
  "pos_cash_registers",
  "pos_refunds",
  "pos_categories",
  "pos_products",
  "pos_product_variants",
  "pos_variant_attributes",
  "pos_stock_levels",
  "pos_stock_movements",
  "pos_stock_transfers",
]);

/** Finance + Inventory tables that require write audit logging. */
export const AUDITED_WRITE_TABLES = new Set([
  "inventory_categories",
  "inventory_products",
  "inventory_product_variants",
  "inventory_variant_attributes",
  "inventory_warehouses",
  "inventory_stock_levels",
  "inventory_stock_movements",
  "inventory_stock_transfers",
  "finance_vendor_bills",
  "finance_vendor_payments",
  "finance_expense_categories",
  "finance_expense_sub_categories",
  "finance_expenses",
  "finance_recurring_expenses",
  "finance_bank_accounts",
  "finance_transactions",
  "pos_categories",
  "pos_products",
  "pos_product_variants",
  "pos_variant_attributes",
  "pos_stock_levels",
  "pos_stock_movements",
  "pos_stock_transfers",
]);

/**
 * Standard WHERE fragment: alias.tenant_id = ? AND alias.deleted_at IS NULL
 * @param {string} alias
 * @param {{ softDelete?: boolean }} [opts]
 */
export function tenantWhere(alias, opts = {}) {
  const { softDelete = true } = opts;
  const scope = `${alias}.tenant_id = ?`;
  return softDelete ? `${scope} AND ${alias}.deleted_at IS NULL` : scope;
}

/**
 * JOIN condition ensuring both sides share tenant_id.
 * @param {string} leftAlias
 * @param {string} rightAlias
 * @param {{ softDeleteRight?: boolean }} [opts]
 */
export function joinOnTenant(leftAlias, rightAlias, opts = {}) {
  const { softDeleteRight = true } = opts;
  let clause = matchTenant(leftAlias, rightAlias);
  if (softDeleteRight) {
    clause += ` AND ${rightAlias}.deleted_at IS NULL`;
  }
  return clause;
}

/** Tenant match for JOIN/WHERE: left.tenant_id = right.tenant_id */
export function matchTenant(leftAlias, rightAlias) {
  return `${leftAlias}.tenant_id = ${rightAlias}.tenant_id`;
}

/** Allowed movement_type values for inventory/POS list filters. */
export const INVENTORY_MOVEMENT_TYPES = new Set([
  "initial_stock",
  "stock_in",
  "stock_out",
  "transfer_in",
  "transfer_out",
]);

export function assertAllowedMovementType(value) {
  if (value != null && value !== "" && !INVENTORY_MOVEMENT_TYPES.has(value)) {
    throw new Error(`Invalid movement_type: ${value}`);
  }
}

/**
 * Extract referenced table names from SQL (best-effort, for guard only).
 * @param {string} sql
 * @returns {Set<string>}
 */
export function extractTableNames(sql) {
  const normalized = sql.replace(/`/g, "").replace(/\s+/g, " ");
  const tables = new Set();
  const patterns = [
    /\bFROM\s+([a-z_][a-z0-9_]*)/gi,
    /\bJOIN\s+([a-z_][a-z0-9_]*)/gi,
    /\bINTO\s+([a-z_][a-z0-9_]*)/gi,
    /\bUPDATE\s+([a-z_][a-z0-9_]*)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(normalized)) !== null) {
      tables.add(m[1].toLowerCase());
    }
  }
  return tables;
}

/**
 * Detect write operation type from SQL.
 * @param {string} sql
 * @returns {"INSERT"|"UPDATE"|"DELETE"|"SELECT"|null}
 */
export function detectSqlOperation(sql) {
  const head = sql.trim().slice(0, 20).toUpperCase();
  if (head.startsWith("INSERT")) return "INSERT";
  if (head.startsWith("UPDATE")) return "UPDATE";
  if (head.startsWith("DELETE")) return "DELETE";
  if (head.startsWith("SELECT")) return "SELECT";
  return null;
}

/**
 * Fail closed when a tenant-scoped query runs without tenant_id filter under enforced context.
 * @param {string} sql
 * @param {{ enforced: boolean, operation?: string | null }} ctx
 */
export function assertTenantScopedQuery(sql, ctx) {
  if (!ctx.enforced) return;

  const tables = extractTableNames(sql);
  const scoped = [...tables].filter((t) => TENANT_SCOPED_TABLES.has(t));
  if (!scoped.length) return;

  const op = ctx.operation ?? detectSqlOperation(sql);
  const normalized = sql.replace(/\s+/g, " ").toLowerCase();

  if (op === "INSERT") {
    const missingTenantCol = scoped.some((t) => !normalized.includes(`${t} (`) && !normalized.includes("tenant_id"));
    if (missingTenantCol && !normalized.includes("tenant_id")) {
      throw new Error(`Tenant isolation: INSERT on scoped table(s) [${scoped.join(", ")}] missing tenant_id`);
    }
    return;
  }

  if (!normalized.includes("tenant_id")) {
    throw new Error(`Tenant isolation: query on scoped table(s) [${scoped.join(", ")}] missing tenant_id filter`);
  }
}

/**
 * Strip tenant_id from user-supplied payloads so it cannot override auth context.
 * @param {Record<string, unknown> | null | undefined} body
 */
export function stripTenantIdFromBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const { tenant_id: _ignored, tenantId: _ignored2, ...rest } = body;
  return rest;
}
