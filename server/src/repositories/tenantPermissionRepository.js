import { readDb } from "../database/db.js";

export const tenantPermissionRepository = {
  async findUserRole(tenantId, userId) {
    const [rows] = await readDb.query(
      `SELECT u.role_id, r.role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id AND r.deleted_at IS NULL
       WHERE u.id = ? AND u.tenant_id = ? AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId, tenantId]
    );
    return rows[0] || null;
  },

  async findPermissionsByRole(roleId) {
    const [rows] = await readDb.query(
      `SELECT p.module_id, m.module_name, p.action
       FROM permissions p
       INNER JOIN modules m ON m.id = p.module_id AND m.deleted_at IS NULL
       WHERE p.role_id = ? AND p.deleted_at IS NULL`,
      [roleId]
    );
    return rows;
  },
};
