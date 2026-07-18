import { getAuditContext } from "./auditContext.js";
import { logTenantAudit } from "./tenantAudit.js";
import { buildWriteAuditSummary, sanitizeAuditRow } from "./auditRowSnapshot.js";

let cachedInventoryModuleId = null;
let cachedFinanceModuleId = null;
let cachedPosModuleId = null;
let cachedOrderModuleId = null;

async function moduleIdForTable(table) {
  const { readDb } = await import("../database/db.js");
  const opts = { skipTenantGuard: true, skipWriteAudit: true };

  if (table.startsWith("finance_")) {
    if (cachedFinanceModuleId) return cachedFinanceModuleId;
    const [rows] = await readDb.query(
      `SELECT id FROM modules WHERE module_name = 'Finance & Accounting' AND deleted_at IS NULL LIMIT 1`,
      [],
      opts,
    );
    cachedFinanceModuleId = rows[0]?.id ?? null;
    return cachedFinanceModuleId;
  }

  if (table.startsWith("pos_")) {
    if (cachedPosModuleId) return cachedPosModuleId;
    const [rows] = await readDb.query(
      `SELECT id FROM modules WHERE module_name = 'POS Terminal' AND deleted_at IS NULL LIMIT 1`,
      [],
      opts,
    );
    cachedPosModuleId = rows[0]?.id ?? null;
    return cachedPosModuleId;
  }

  if (table === "orders" || table.startsWith("order_")) {
    if (cachedOrderModuleId) return cachedOrderModuleId;
    const [rows] = await readDb.query(
      `SELECT id FROM modules WHERE module_name = 'Order Management' AND deleted_at IS NULL LIMIT 1`,
      [],
      opts,
    );
    cachedOrderModuleId = rows[0]?.id ?? null;
    return cachedOrderModuleId;
  }

  if (cachedInventoryModuleId) return cachedInventoryModuleId;
  const [rows] = await readDb.query(
    `SELECT id FROM modules WHERE module_name = 'Inventory & Procurement' AND deleted_at IS NULL LIMIT 1`,
    [],
    opts,
  );
  cachedInventoryModuleId = rows[0]?.id ?? null;
  return cachedInventoryModuleId;
}

function actionPrefix(table) {
  if (table.startsWith("finance_")) return "finance";
  if (table.startsWith("pos_")) return "pos";
  if (table === "orders" || table.startsWith("order_")) return "order";
  return "inventory";
}

/**
 * Audit log for module write operations with full row snapshots when available.
 * @param {{
 *   tenantId: number,
 *   userId: number | null,
 *   action: string,
 *   table: string,
 *   recordId: number | null,
 *   oldRow?: object | null,
 *   newRow?: object | null,
 * }} entry
 */
export async function logModuleWriteAudit({
  tenantId,
  userId,
  action,
  table,
  recordId,
  oldRow = null,
  newRow = null,
}) {
  const ctx = getAuditContext();
  const moduleId = await moduleIdForTable(table);
  const prefix = actionPrefix(table);
  const auditAction = `${prefix}_${action}`;

  const cleanOld = oldRow ? sanitizeAuditRow(oldRow) : null;
  const cleanNew = newRow ? sanitizeAuditRow(newRow) : null;
  const summary = buildWriteAuditSummary(action, table, cleanNew || cleanOld || { id: recordId });

  let oldValue = null;
  let newValue = null;

  if (action === "insert") {
    oldValue = null;
    newValue = cleanNew
      ? { summary, ...cleanNew }
      : { summary, table, record_id: recordId };
  } else if (action === "delete") {
    oldValue = cleanOld
      ? { ...cleanOld }
      : (recordId != null ? { table, record_id: recordId } : null);
    newValue = { summary };
  } else {
    // update — DiffViewer compares field-by-field
    oldValue = cleanOld || null;
    newValue = cleanNew
      ? { summary, ...cleanNew }
      : { summary, table, record_id: recordId, action: "update" };
  }

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
