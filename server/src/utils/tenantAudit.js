import { writeDb, readDb } from "../database/db.js";
import { logWhAudit } from "./whAudit.js";

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
  if (impersonatedBy) {
    await logWhAudit({
      adminUserId: impersonatedBy,
      action: `tenant_impersonation:${action}`,
      oldValue: oldValue ? { tenant_id: tenantId, user_id: userId, ...oldValue } : { tenant_id: tenantId, user_id: userId },
      newValue: newValue ? { tenant_id: tenantId, user_id: userId, ...newValue } : null,
      ipAddress,
    });
    if (skipIfImpersonated) return;
  }

  const resolvedModuleId = moduleId || (await defaultModuleId(tenantId));

  await writeDb.query(
    `INSERT INTO audit_logs
     (action, old_value, new_value, ip_address, device_info, tenant_id, module_id, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      action,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress,
      deviceInfo,
      tenantId,
      resolvedModuleId,
      userId,
    ]
  );
}
