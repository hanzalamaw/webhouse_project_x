import { writeDb } from "../database/db.js";
import { getAuditContext } from "./auditContext.js";

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
export async function logModuleWriteAudit({ tenantId, userId, action, table, recordId }) {
  const ctx = getAuditContext();
  const moduleId = await moduleIdForTable(table);
  const prefix = table.startsWith("finance_")
    ? "finance"
    : table.startsWith("pos_")
      ? "pos"
      : "inventory";

  await writeDb.query(
    `INSERT INTO audit_logs
       (action, old_value, new_value, ip_address, device_info, tenant_id, module_id, user_id)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    [
      `${prefix}_${action}`,
      JSON.stringify({ table, record_id: recordId, action }),
      ctx?.ipAddress ?? ctx?.ip ?? null,
      ctx?.deviceInfo ?? null,
      tenantId,
      moduleId,
      userId,
    ],
    { skipTenantGuard: true, skipWriteAudit: true }
  );
}
