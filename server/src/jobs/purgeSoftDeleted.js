import { writeDb } from "../database/db.js";

const TABLES_WITH_SOFT_DELETE = [
  "modules",
  "wh_subscription_plans",
  "wh_subscription_module",
  "wh_tenants",
  "wh_tenant_modules",
  "wh_tenant_limits",
  "wh_tenant_subscriptions",
  "wh_tenant_payments",
  "wh_support_tickets",
  "wh_audit_logs",
  "roles",
  "users",
  "permissions",
  "audit_logs",
  "sessions",
  "organization_settings",
  "crm_leads",
  "crm_customers",
  "crm_customer_addresses",
  "crm_customer_complaints",
];

/**
 * Hard-delete rows soft-deleted more than 7 days ago.
 * Runs from server/index.js on a daily interval and via: npm run purge:deleted
 *
 * NOT a MySQL trigger — application-level purge (see cursor_instructions.txt).
 * FK CASCADE handles related records on hard delete.
 */
export async function purgeSoftDeleted() {
  const results = {};
  for (const table of TABLES_WITH_SOFT_DELETE) {
    const [result] = await writeDb.query(
      `DELETE FROM \`${table}\` WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );
    results[table] = result.affectedRows;
  }
  return results;
}
