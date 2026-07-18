import { writeDb, readDb } from "../database/db.js";
import { logWhAudit } from "./whAudit.js";
import { getAuditContext } from "./auditContext.js";

async function defaultModuleId(tenantId) {
  const [rows] = await readDb.query(
    `SELECT tm.module_id FROM wh_tenant_modules tm
     JOIN modules m ON m.id = tm.module_id AND m.deleted_at IS NULL
     WHERE tm.tenant_id = ? AND tm.is_enabled = 1 AND tm.deleted_at IS NULL
     ORDER BY m.module_name = 'Admin' DESC, m.module_name ASC LIMIT 1`,
    [tenantId]
  );
  return rows[0]?.module_id ?? 1;
}

export async function logTenantAudit({
  tenantId,
  userId,
  moduleId = null,
  action,
  oldValue = null,
  newValue = null,
  ipAddress = null,
  deviceInfo = null,
  skipIfImpersonated = true,
  impersonatedBy = null,
}) {
  const ctx = getAuditContext();
  const resolvedImpersonatedBy = impersonatedBy ?? ctx?.impersonatedBy ?? null;
  const resolvedIp = ipAddress ?? ctx?.ipAddress ?? ctx?.ip ?? null;
  const resolvedDevice = deviceInfo ?? ctx?.deviceInfo ?? null;
  const safeAction = String(action || "unknown").slice(0, 191);

  if (resolvedImpersonatedBy) {
    await logWhAudit({
      adminUserId: resolvedImpersonatedBy,
      action: `tenant_impersonation:${safeAction}`.slice(0, 191),
      oldValue: oldValue
        ? { tenant_id: tenantId, user_id: userId, ...oldValue }
        : { tenant_id: tenantId, user_id: userId },
      newValue: newValue ? { tenant_id: tenantId, user_id: userId, ...newValue } : null,
      ipAddress: resolvedIp,
    });
    if (skipIfImpersonated) return;
  }

  const resolvedModuleId = moduleId || (await defaultModuleId(tenantId));

  // System/import paths may have no acting user — never fail the write for audit alone.
  if (userId == null || userId === "") return;

  await writeDb.query(
    `INSERT INTO audit_logs
     (action, old_value, new_value, ip_address, device_info, tenant_id, module_id, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      safeAction,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      resolvedIp,
      resolvedDevice,
      tenantId,
      resolvedModuleId,
      userId,
    ]
  );
}
