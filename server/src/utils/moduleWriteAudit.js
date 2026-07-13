import { getAuditContext } from "./auditContext.js";
import { logTenantAudit } from "./tenantAudit.js";

let cachedInventoryModuleId = null;
let cachedFinanceModuleId = null;
let cachedPosModuleId = null;

async function moduleIdForTable(table) {
  const isFinance = table.startsWith("finance_");
  if (isFinance) {
    if (cachedFinanceModuleId) return cachedFinanceModuleId;
    const { readDb } = await import("../database/db.js");
    const [rows] = await readDb.query(
      `SELECT id FROM modules WHERE module_name = 'Finance & Accounting' AND deleted_at IS NULL LIMIT 1`,
      [],
      { skipTenantGuard: true, skipWriteAudit: true }
    );
    cachedFinanceModuleId = rows[0]?.id ?? null;
    return cachedFinanceModuleId;
  }

  if (table.startsWith("pos_")) {
    if (cachedPosModuleId) return cachedPosModuleId;
    const { readDb } = await import("../database/db.js");
    const [rows] = await readDb.query(
      `SELECT id FROM modules WHERE module_name = 'POS Terminal' AND deleted_at IS NULL LIMIT 1`,
      [],
      { skipTenantGuard: true, skipWriteAudit: true }
    );
    cachedPosModuleId = rows[0]?.id ?? null;
    return cachedPosModuleId;
  }

  if (cachedInventoryModuleId) return cachedInventoryModuleId;
  const { readDb } = await import("../database/db.js");
  const [rows] = await readDb.query(
    `SELECT id FROM modules WHERE module_name = 'Inventory & Procurement' AND deleted_at IS NULL LIMIT 1`,
    [],
    { skipTenantGuard: true, skipWriteAudit: true }
  );
  cachedInventoryModuleId = rows[0]?.id ?? null;
  return cachedInventoryModuleId;
}

/**
 * Basic audit log for Finance and Inventory write operations.
 * @param {{ tenantId: number, userId: number | null, action: string, table: string, recordId: number | null }} entry
 */
export async function logModuleWriteAudit({ tenantId, userId, action, table, recordId, oldRow = null, newRow = null }) {
  const ctx = getAuditContext();
  const moduleId = await moduleIdForTable(table);
  const prefix = table.startsWith("finance_")
    ? "finance"
    : table.startsWith("pos_")
      ? "pos"
      : "inventory";

  const auditAction = `${prefix}_${action}`;
  const oldValue = oldRow || (action === "delete" ? { table, record_id: recordId } : null);
  const newValue = newRow || (action === "insert" ? { table, record_id: recordId } : { table, record_id: recordId, action });

  await logTenantAudit({
    tenantId,
    userId,
    moduleId,
    action: auditAction,
    oldValue,
    newValue,
    ipAddress: ctx?.ipAddress ?? ctx?.ip ?? null,
    deviceInfo: ctx?.deviceInfo ?? null,
    skipIfImpersonated: true,
    impersonatedBy: ctx?.impersonatedBy ?? null,
  });
}
