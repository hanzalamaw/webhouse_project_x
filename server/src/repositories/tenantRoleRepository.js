import { readDb, writeDb } from "../database/db.js";
import { flattenPermissions } from "../utils/permissionRules.js";
import { SUPER_ADMIN_ROLE_NAME, isSuperAdminRole, isSuperAdminRoleName } from "../utils/tenantRoles.js";

export const tenantRoleRepository = {
  async findAllByTenant(tenantId) {
    const [rows] = await readDb.query(
      `SELECT r.id, r.role_name, r.description, r.status,
              (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.deleted_at IS NULL AND u.tenant_id = ?) AS user_count
       FROM roles r
       WHERE r.tenant_id = ? AND r.deleted_at IS NULL
       ORDER BY r.role_name ASC`,
      [tenantId, tenantId]
    );
    return rows;
  },

  async findById(tenantId, roleId) {
    const [rows] = await readDb.query(
      `SELECT id, role_name, description, status FROM roles
       WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
      [tenantId, roleId]
    );
    return rows[0] || null;
  },

  async getPermissionsMatrix(tenantId, roleId) {
    const [rows] = await readDb.query(
      `SELECT p.module_id, p.action, m.module_name
       FROM permissions p
       JOIN modules m ON m.id = p.module_id AND m.deleted_at IS NULL
       JOIN roles r ON r.id = p.role_id AND r.deleted_at IS NULL
       WHERE r.tenant_id = ? AND p.role_id = ? AND p.deleted_at IS NULL`,
      [tenantId, roleId]
    );
    const matrix = {};
    for (const row of rows) {
      if (!matrix[row.module_id]) matrix[row.module_id] = [];
      matrix[row.module_id].push(row.action);
    }
    return { matrix, modules: rows };
  },

  async create(tenantId, { role_name, description, status = "active", permissions = {} }) {
    if (isSuperAdminRoleName(role_name)) {
      const err = new Error("Super Admin is a reserved role and cannot be created");
      err.status = 400;
      throw err;
    }
    const pool = (await import("../database/db.js")).getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO roles (role_name, description, status, tenant_id) VALUES (?, ?, ?, ?)`,
        [role_name.trim(), description || null, status, tenantId]
      );
      const roleId = result.insertId;
      await this._replacePermissions(connection, roleId, permissions);
      await connection.commit();
      return roleId;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  async update(tenantId, roleId, { role_name, description, status, permissions }) {
    const role = await this.findById(tenantId, roleId);
    if (!role) return false;
    if (isSuperAdminRole(role) && role_name && !isSuperAdminRoleName(role_name)) {
      const err = new Error("Super Admin role cannot be renamed");
      err.status = 400;
      throw err;
    }
    if (isSuperAdminRole(role) && status && status !== role.status) {
      const err = new Error("Super Admin role status cannot be changed");
      err.status = 400;
      throw err;
    }

    const pool = (await import("../database/db.js")).getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE roles SET role_name = ?, description = ?, status = ?
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [
          role_name?.trim() || role.role_name,
          description ?? role.description,
          status || role.status,
          roleId,
          tenantId,
        ]
      );
      if (permissions && isSuperAdminRole(role)) {
        const err = new Error("Super Admin permissions cannot be changed");
        err.status = 400;
        throw err;
      }
      if (permissions) {
        await this._replacePermissions(connection, roleId, permissions);
      }
      await connection.commit();
      return true;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  async _replacePermissions(connection, roleId, permissionsMatrix) {
    await connection.execute(
      `UPDATE permissions SET deleted_at = NOW() WHERE role_id = ? AND deleted_at IS NULL`,
      [roleId]
    );
    const flat = flattenPermissions(permissionsMatrix);
    for (const { moduleId, action } of flat) {
      await connection.execute(
        `INSERT INTO permissions (permission_name, action, role_id, module_id)
         VALUES ('access', ?, ?, ?)`,
        [action, roleId, moduleId]
      );
    }
  },

  async listAssignableModules(tenantId) {
    const [rows] = await readDb.query(
      `SELECT m.id, m.module_name
       FROM wh_tenant_modules tm
       JOIN modules m ON m.id = tm.module_id AND m.deleted_at IS NULL
       WHERE tm.tenant_id = ? AND tm.is_enabled = 1 AND tm.deleted_at IS NULL
       ORDER BY m.module_name`,
      [tenantId]
    );
    return rows;
  },
};
