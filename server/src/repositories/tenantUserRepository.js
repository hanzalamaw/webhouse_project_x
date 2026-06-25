import { readDb, writeDb } from "../database/db.js";
import { encrypt } from "../utils/cipher.js";
export const tenantUserRepository = {
  async countActive(tenantId) {
    const [[row]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM users
       WHERE tenant_id = ? AND status = 'active' AND deleted_at IS NULL`,
      [tenantId]
    );
    return Number(row.total || 0);
  },

  async getLimits(tenantId) {
    const [rows] = await readDb.query(
      `SELECT max_users FROM wh_tenant_limits
       WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [tenantId]
    );
    return rows[0] || { max_users: 0 };
  },

  async findAllByTenant(tenantId) {
    const [rows] = await readDb.query(
      `SELECT u.id, u.name, u.email, u.username, u.phone, u.status, u.last_login_at, u.role_id,
              r.role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id AND r.deleted_at IS NULL
       WHERE u.tenant_id = ? AND u.deleted_at IS NULL
       ORDER BY u.name ASC`,
      [tenantId]
    );
    return rows;
  },

  async findById(tenantId, userId) {
    const [rows] = await readDb.query(
      `SELECT u.id, u.name, u.email, u.username, u.phone, u.status, u.last_login_at, u.role_id,
              r.role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id AND r.deleted_at IS NULL
       WHERE u.tenant_id = ? AND u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
      [tenantId, userId]
    );
    return rows[0] || null;
  },

  async create(tenantId, { name, email, username, phone, password, role_id, status = "active" }) {
    const hashed = encrypt(password);
    const [result] = await writeDb.query(
      `INSERT INTO users (tenant_id, name, email, username, password, phone, status, role_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, name, email, username.trim().toLowerCase(), hashed, phone || null, status, role_id]
    );
    return result.insertId;
  },

  async update(tenantId, userId, { name, email, username, phone, role_id, status, password }) {
    if (password) {
      const hashed = encrypt(password);
      await writeDb.query(
        `UPDATE users SET name = ?, email = ?, username = ?, phone = ?, role_id = ?, status = ?, password = ?
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [name, email, username.trim().toLowerCase(), phone || null, role_id, status, hashed, userId, tenantId]
      );
    } else {
      await writeDb.query(
        `UPDATE users SET name = ?, email = ?, username = ?, phone = ?, role_id = ?, status = ?
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [name, email, username.trim().toLowerCase(), phone || null, role_id, status, userId, tenantId]
      );
    }
  },

  async setStatus(tenantId, userId, status) {
    await writeDb.query(
      `UPDATE users SET status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [status, userId, tenantId]
    );
  },
};
