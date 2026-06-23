import { readDb, writeDb } from "../database/db.js";

const ACTIVE_WHERE = "s.is_active = 1 AND (s.logout_at IS NULL OR s.logout_at = '0000-00-00 00:00:00')";

export const sessionRepository = {
  async findAll({ limit, offset, activeOnly = true }) {
    const activeClause = activeOnly ? `AND ${ACTIVE_WHERE}` : "";
    const baseFrom = `
      FROM sessions s
      INNER JOIN wh_tenants t ON t.id = s.tenant_id AND t.deleted_at IS NULL
      INNER JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
      WHERE s.deleted_at IS NULL ${activeClause}`;

    const [rows] = await readDb.query(
      `SELECT s.id, s.ip_address, s.device_info, s.login_at, s.logout_at,
              CAST(s.is_active AS UNSIGNED) AS is_active,
              t.id AS tenant_id, t.company_name,
              u.id AS user_id, u.name AS user_name, u.email AS user_email
       ${baseFrom}
       ORDER BY s.login_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [[{ total }]] = await readDb.query(`SELECT COUNT(*) AS total ${baseFrom}`);
    return { rows, total };
  },

  async isActive(id) {
    if (!id) return false;
    const [rows] = await readDb.query(
      `SELECT id FROM sessions
       WHERE id = ? AND deleted_at IS NULL AND is_active = 1
         AND (logout_at IS NULL OR logout_at = '0000-00-00 00:00:00')
       LIMIT 1`,
      [id]
    );
    return rows.length > 0;
  },

  async terminate(id) {
    const [result] = await writeDb.query(
      `UPDATE sessions SET is_active = 0, logout_at = NOW()
       WHERE id = ? AND deleted_at IS NULL AND is_active = 1`,
      [id]
    );
    return result.affectedRows;
  },

  async create({ sessionToken, ipAddress, deviceInfo, tenantId, userId }) {
    const [result] = await writeDb.query(
      `INSERT INTO sessions (session_token, ip_address, device_info, tenant_id, user_id, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [sessionToken, ipAddress, deviceInfo || null, tenantId, userId]
    );
    return result.insertId;
  },
};
