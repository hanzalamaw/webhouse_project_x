import { readDb, writeDb } from "../database/db.js";

export const activityAlertRepository = {
  async findByTenant(tenantId, { limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT id, alert_type, title, message, priority, is_read, user_id, created_at
       FROM activity_alerts
       WHERE tenant_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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
