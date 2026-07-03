import { writeDb } from "../database/db.js";
import { extractClientIp } from "./clientIp.js";

export async function logWhAudit({ adminUserId, action, oldValue, newValue, ipAddress }) {
  await writeDb.query(
    `INSERT INTO wh_audit_logs (action, old_value, new_value, ip_address, admin_user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      action,
      oldValue != null ? JSON.stringify(oldValue) : null,
      newValue != null ? JSON.stringify(newValue) : null,
      ipAddress || "0.0.0.0",
      adminUserId,
    ]
  );
}

export function getClientIp(req) {
  return extractClientIp(req) || "0.0.0.0";
}
