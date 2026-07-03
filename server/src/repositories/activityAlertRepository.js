import { readDb, writeDb } from "../database/db.js";

export const activityAlertRepository = {
  async findByTenant(tenantId, { limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT a.id, a.alert_type, a.title, a.message,
              COALESCE(
                a.ip_address,
                (SELECT s.ip_address FROM sessions s
                   WHERE s.user_id = a.user_id AND s.tenant_id = a.tenant_id AND s.deleted_at IS NULL
                   ORDER BY s.login_at DESC LIMIT 1)
              ) AS ip_address,
              COALESCE(
                a.device_info,
                (SELECT s.device_info FROM sessions s
                   WHERE s.user_id = a.user_id AND s.tenant_id = a.tenant_id AND s.deleted_at IS NULL
                   ORDER BY s.login_at DESC LIMIT 1)
              ) AS device_info,
              a.priority, a.is_read, a.user_id, a.created_at
       FROM activity_alerts a
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [tenantId, limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM activity_alerts WHERE tenant_id = ? AND deleted_at IS NULL`,
      [tenantId]
    );
    return { rows, total };
  },

  async markRead(tenantId, alertId) {
    const [result] = await writeDb.query(
      `UPDATE activity_alerts SET is_read = 1
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [alertId, tenantId]
    );
    return result.affectedRows > 0;
  },

  async countByType(tenantId, alertType) {
    const [[row]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM activity_alerts
       WHERE tenant_id = ? AND deleted_at IS NULL AND alert_type = ?`,
      [tenantId, alertType]
    );
    return Number(row?.total || 0);
  },
};
