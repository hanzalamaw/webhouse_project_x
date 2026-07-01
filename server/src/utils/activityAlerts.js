import { writeDb } from "../database/db.js";

const IMPORTANT_TYPES = new Set([
  "failed_login",
  "role_change",
  "permission_change",
  "user_deactivated",
  "record_deleted",
  "large_export",
]);

export async function createActivityAlert({
  tenantId,
  userId = null,
  alertType,
  title,
  message,
  priority = "medium",
  ipAddress = null,
  deviceInfo = null,
}) {
  if (!IMPORTANT_TYPES.has(alertType)) return;
  await writeDb.query(
    `INSERT INTO activity_alerts (alert_type, title, message, ip_address, device_info, priority, is_read, user_id, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [alertType, title, message, ipAddress, deviceInfo, priority, userId, tenantId]
  );
}
