import { readDb, writeDb, withoutTenantGuard } from "../database/db.js";
import { PURGE_AFTER_DAYS } from "../utils/softDeletePolicy.js";

/**
 * Prefer purging leaf / dependent tables before parents when FK blocks deletion.
 * Tables not listed are still purged (after listed ones) via schema discovery.
 */
const PURGE_TABLE_PRIORITY = [
  // Order children
  "order_items",
  "order_payments",
  "order_assignments",
  "order_cancellations",
  "order_returns",
  "order_exchanges",
  "order_refunds",
  "orders",
  // Finance leaf
  "finance_vendor_payments",
  "finance_expenses",
  "finance_transactions",
  "finance_recurring_expenses",
  "finance_expense_sub_categories",
  "finance_vendor_bills",
  "finance_expense_categories",
  "finance_bank_accounts",
  // POS / inventory leaf
  "pos_sale_items",
  "pos_refunds",
  "pos_stock_levels",
  "pos_stock_movements",
  "pos_stock_transfers",
  "pos_product_variants",
  "pos_products",
  "pos_categories",
  "pos_cash_registers",
  "pos_sales",
  "pos_terminals",
  "pos_outlets",
  "inventory_stock_levels",
  "inventory_stock_movements",
  "inventory_stock_transfers",
  "inventory_product_variants",
  "inventory_products",
  "inventory_categories",
  "inventory_warehouses",
  // CRM
  "crm_customer_addresses",
  "crm_customer_complaints",
  "crm_leads",
  "crm_customers",
  // E-commerce staging
  "ecom_sync_logs",
  "ecom_external_orders",
  "ecom_synced_records",
  "ecom_entity_links",
  "ecom_store_connections",
  // Logistics
  "logistics_pickup_orders",
  "logistics_tracking_sync_logs",
  "logistics_pickup_requests",
  "logistics_courier_partners",
  // Tenant admin
  "permissions",
  "activity_alerts",
  "audit_logs",
  "sessions",
  "users",
  "roles",
  "organization_settings",
  // WH billing
  "wh_tenant_payments",
  "wh_support_tickets",
  "wh_tenant_subscriptions",
  "wh_tenant_limits",
  "wh_tenant_modules",
  "wh_subscription_module",
  "wh_audit_logs",
  "wh_tenants",
  "wh_subscription_plans",
  "modules",
  "wh_admin_users",
];

async function discoverSoftDeleteTables() {
  const [rows] = await readDb.query(
    `SELECT TABLE_NAME AS table_name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'deleted_at'
     GROUP BY TABLE_NAME`
  );
  return rows.map((r) => r.table_name);
}

function orderTablesForPurge(tables) {
  const rank = new Map(PURGE_TABLE_PRIORITY.map((name, i) => [name, i]));
  return [...tables].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a) : 10_000;
    const rb = rank.has(b) ? rank.get(b) : 10_001;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

/**
 * Hard-delete rows soft-deleted more than PURGE_AFTER_DAYS ago.
 * Uses multi-pass deletes so FK constraints resolve (children before parents).
 */
export async function purgeSoftDeleted() {
  const discovered = await discoverSoftDeleteTables();
  const tables = orderTablesForPurge(discovered);
  const results = {};

  return withoutTenantGuard(async () => {
    const errors = {};
    const maxPasses = 25;
    const batchSize = 2000;

    for (let pass = 1; pass <= maxPasses; pass += 1) {
      let passTotal = 0;

      for (const table of tables) {
        try {
          const [result] = await writeDb.query(
            `DELETE FROM \`${table}\`
             WHERE deleted_at IS NOT NULL
               AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)
             LIMIT ?`,
            [PURGE_AFTER_DAYS, batchSize],
            { skipTenantGuard: true, skipWriteAudit: true }
          );
          const n = result.affectedRows ?? 0;
          if (n > 0) {
            results[table] = (results[table] || 0) + n;
            passTotal += n;
          }
        } catch (err) {
          const msg = err?.message || String(err);
          if (!errors[table]) errors[table] = msg;
        }
      }

      if (passTotal === 0) break;
    }

    const total = Object.values(results).reduce((a, b) => a + b, 0);
    return { total, tables: results, errors, purgeAfterDays: PURGE_AFTER_DAYS };
  });
}
