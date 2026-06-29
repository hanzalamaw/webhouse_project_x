import { readDb } from "../database/db.js";

export const logRepository = {
  async findWhLogs({ limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT al.id, al.action, al.old_value, al.new_value, al.ip_address, al.created_at,
              u.name AS admin_name, u.email AS admin_email
       FROM wh_audit_logs al
       JOIN wh_admin_users u ON u.id = al.admin_user_id AND u.deleted_at IS NULL
       WHERE al.deleted_at IS NULL
       ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM wh_audit_logs WHERE deleted_at IS NULL`
    );
    return { rows, total };
  },

  async findTenantLogs({ tenantId, limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT al.id, al.action, al.old_value, al.new_value, al.ip_address, al.device_info,
              al.created_at, t.company_name, m.module_name, u.name AS user_name, u.email AS user_email
       FROM audit_logs al
       JOIN wh_tenants t ON t.id = al.tenant_id AND t.deleted_at IS NULL
       LEFT JOIN modules m ON m.id = al.module_id AND m.deleted_at IS NULL
       JOIN users u ON u.id = al.user_id AND u.deleted_at IS NULL
       WHERE al.deleted_at IS NULL AND al.tenant_id = ?
       ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [tenantId, limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM audit_logs WHERE deleted_at IS NULL AND tenant_id = ?`,
      [tenantId]
    );
    return { rows, total };
  },

  async findByUser(tenantId, userId) {
    const [rows] = await readDb.query(
      `SELECT al.id, al.action, al.new_value, al.ip_address, al.device_info, al.created_at,
              m.module_name, u.name AS user_name
       FROM audit_logs al
       LEFT JOIN modules m ON m.id = al.module_id AND m.deleted_at IS NULL
       JOIN users u ON u.id = al.user_id AND u.deleted_at IS NULL
       WHERE al.deleted_at IS NULL AND al.tenant_id = ? AND al.user_id = ?
       ORDER BY al.created_at DESC`,
      [tenantId, userId]
    );
    return rows;
  },
};
