import { readDb, writeDb } from "../database/db.js";
import { encrypt } from "../utils/cipher.js";
import { cascadeSoftDeleteTenant } from "../utils/softDeleteCascade.js";

const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "manage"];

export const tenantRepository = {
  async findAll({ limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT t.id, t.id AS tenant_id, t.company_name, t.owner_name, t.owner_email, t.owner_phone,
              t.industry, t.status, t.login_portal, t.created_at, t.updated_at,
              tl.max_users, tl.max_warehouses, tl.max_stores, tl.max_orders_per_month,
              ts.billing_cycle, ts.start_date, ts.renewal_date, ts.status AS subscription_status,
              ts.total_amount, ts.amount_due,
              sp.plan_name, sp.id AS subscription_plan_id
       FROM wh_tenants t
       LEFT JOIN wh_tenant_limits tl ON tl.tenant_id = t.id AND tl.deleted_at IS NULL
       LEFT JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
       LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
       WHERE t.deleted_at IS NULL
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM wh_tenants WHERE deleted_at IS NULL`
    );
    return { rows, total };
  },

  async findById(id) {
    const [rows] = await readDb.query(
      `SELECT t.*, tl.max_users, tl.max_warehouses, tl.max_stores, tl.max_orders_per_month,
              ts.id AS subscription_id, ts.billing_cycle, ts.start_date, ts.renewal_date,
              ts.status AS subscription_status, ts.total_amount, ts.amount_due, ts.subscription_plan_id,
              sp.plan_name
       FROM wh_tenants t
       LEFT JOIN wh_tenant_limits tl ON tl.tenant_id = t.id AND tl.deleted_at IS NULL
       LEFT JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
       LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
       WHERE t.id = ? AND t.deleted_at IS NULL LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async getTenantModules(tenantId) {
    const [rows] = await readDb.query(
      `SELECT tm.module_id, tm.is_enabled, m.module_name
       FROM wh_tenant_modules tm
       JOIN modules m ON m.id = tm.module_id AND m.deleted_at IS NULL
       WHERE tm.tenant_id = ? AND tm.deleted_at IS NULL`,
      [tenantId]
    );
    return rows;
  },

  async updateLoginPortal(id, loginPortal) {
    await writeDb.query(
      `UPDATE wh_tenants SET login_portal = ? WHERE id = ? AND deleted_at IS NULL`,
      [loginPortal, id]
    );
  },

  async update(id, data) {
    await writeDb.query(
      `UPDATE wh_tenants SET company_name = ?, owner_name = ?, owner_email = ?,
       owner_phone = ?, industry = ?, status = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        data.company_name,
        data.owner_name,
        data.owner_email,
        data.owner_phone,
        data.industry,
        data.status,
        id,
      ]
    );
  },

  async syncLoginPortalForPlan(planId, loginPortal) {
    const id = Number(planId);
    if (!Number.isInteger(id) || id <= 0) return;
    await writeDb.query(
      `UPDATE wh_tenants t
       INNER JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
       SET t.login_portal = ?
       WHERE ts.subscription_plan_id = ? AND t.deleted_at IS NULL`,
      [loginPortal, id]
    );
  },

  async getSuperAdminUser(tenantId) {
    const [rows] = await readDb.query(
      `SELECT u.id, u.name, u.email, u.username, u.password
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND r.deleted_at IS NULL
       WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND r.role_name = 'Super Admin'
       ORDER BY u.id ASC LIMIT 1`,
      [tenantId]
    );
    return rows[0] || null;
  },

  async softDelete(id) {
    return cascadeSoftDeleteTenant(id);
  },

  async getOrganizationSettings(tenantId) {
    const [rows] = await readDb.query(
      `SELECT company_name, logo_url, timezone, currency, language, fiscal_year_start, fiscal_year_end
       FROM organization_settings
       WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [tenantId]
    );
    return rows[0] || null;
  },

  async getLatestPayment(tenantId) {
    const [rows] = await readDb.query(
      `SELECT id, bank, cash, total_received, received_at
       FROM wh_tenant_payments
       WHERE tenant_id = ? AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [tenantId]
    );
    return rows[0] || null;
  },

  async updateSuperAdmin(id, { name, email, username, password }) {
    const user = await this.getSuperAdminUser(id);
    if (!user) return;
    if (password) {
      const hashed = encrypt(password);
      await writeDb.query(
        `UPDATE users SET name = ?, email = ?, username = ?, password = ? WHERE id = ? AND deleted_at IS NULL`,
        [name, email, username, hashed, user.id]
      );
    } else {
      await writeDb.query(
        `UPDATE users SET name = ?, email = ?, username = ? WHERE id = ? AND deleted_at IS NULL`,
        [name, email, username, user.id]
      );
    }
  },

  async updateFull(tenantId, payload) {
    const pool = (await import("../database/db.js")).getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE wh_tenants SET company_name = ?, owner_name = ?, owner_email = ?,
         owner_phone = ?, industry = ?, status = ?, login_portal = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          payload.company.company_name,
          payload.company.owner_name,
          payload.company.owner_email,
          payload.company.owner_phone,
          payload.company.industry,
          payload.company.status || "active",
          payload.login_portal,
          tenantId,
        ]
      );

      await connection.execute(
        `UPDATE wh_tenant_limits SET max_users = ?, max_warehouses = ?, max_stores = ?, max_orders_per_month = ?
         WHERE tenant_id = ? AND deleted_at IS NULL`,
        [
          payload.limits.max_users,
          payload.limits.max_warehouses,
          payload.limits.max_stores,
          payload.limits.max_orders_per_month,
          tenantId,
        ]
      );

      await connection.execute(
        `UPDATE wh_tenant_subscriptions SET billing_cycle = ?, start_date = ?, renewal_date = ?,
         status = ?, total_amount = ?, amount_due = ?, subscription_plan_id = ?
         WHERE tenant_id = ? AND deleted_at IS NULL`,
        [
          payload.billing.billing_cycle,
          payload.billing.start_date,
          payload.billing.renewal_date,
          payload.billing.status || "active",
          payload.billing.total_amount,
          payload.billing.amount_due,
          payload.subscription_plan_id,
          tenantId,
        ]
      );

      const [payRows] = await connection.execute(
        `SELECT id FROM wh_tenant_payments WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`,
        [tenantId]
      );
      const bank = payload.payment?.bank ?? 0;
      const cash = payload.payment?.cash ?? 0;
      const totalReceived = payload.payment?.total_received ?? bank + cash;
      if (payRows.length) {
        await connection.execute(
          `UPDATE wh_tenant_payments SET bank = ?, cash = ?, total_received = ?, received_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
          [bank, cash, totalReceived, payload.payment?.received_at || null, payRows[0].id]
        );
      } else {
        await connection.execute(
          `INSERT INTO wh_tenant_payments (bank, cash, total_received, received_at, tenant_id)
           VALUES (?, ?, ?, ?, ?)`,
          [bank, cash, totalReceived, payload.payment?.received_at || null, tenantId]
        );
      }

      await connection.execute(
        `UPDATE wh_tenant_modules SET deleted_at = NOW() WHERE tenant_id = ? AND deleted_at IS NULL`,
        [tenantId]
      );
      for (const moduleId of payload.module_ids) {
        await connection.execute(
          `INSERT INTO wh_tenant_modules (is_enabled, enabled_at, module_id, tenant_id)
           VALUES (1, NOW(), ?, ?)
           ON DUPLICATE KEY UPDATE is_enabled = 1, enabled_at = NOW(), disabled_at = NULL, deleted_at = NULL`,
          [moduleId, tenantId]
        );
      }

      const org = payload.organization;
      const [orgRows] = await connection.execute(
        `SELECT id FROM organization_settings WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
        [tenantId]
      );
      if (orgRows.length) {
        await connection.execute(
          `UPDATE organization_settings SET company_name = ?, logo_url = ?, timezone = ?, currency = ?,
           language = ?, fiscal_year_start = ?, fiscal_year_end = ?
           WHERE tenant_id = ? AND deleted_at IS NULL`,
          [
            org.company_name,
            org.logo_url || null,
            org.timezone || null,
            org.currency || null,
            org.language || null,
            org.fiscal_year_start || null,
            org.fiscal_year_end || null,
            tenantId,
          ]
        );
      } else {
        await connection.execute(
          `INSERT INTO organization_settings
           (company_name, logo_url, timezone, currency, language, fiscal_year_start, fiscal_year_end, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            org.company_name,
            org.logo_url || null,
            org.timezone || null,
            org.currency || null,
            org.language || null,
            org.fiscal_year_start || null,
            org.fiscal_year_end || null,
            tenantId,
          ]
        );
      }

      if (payload.super_admin?.username) {
        const user = await this.getSuperAdminUser(tenantId);
        const sa = payload.super_admin;
        if (user) {
          if (sa.password) {
            const hashed = encrypt(sa.password);
            await connection.execute(
              `UPDATE users SET name = ?, email = ?, username = ?, password = ? WHERE id = ? AND deleted_at IS NULL`,
              [sa.name || sa.username, sa.email, sa.username, hashed, user.id]
            );
          } else {
            await connection.execute(
              `UPDATE users SET name = ?, email = ?, username = ? WHERE id = ? AND deleted_at IS NULL`,
              [sa.name || sa.username, sa.email, sa.username, user.id]
            );
          }
        }
      }

      await connection.commit();
      return tenantId;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  async createFull(payload) {
    const pool = (await import("../database/db.js")).getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [tenantResult] = await connection.execute(
        `INSERT INTO wh_tenants
         (company_name, owner_name, owner_email, owner_phone, industry, status, login_portal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.company.company_name,
          payload.company.owner_name,
          payload.company.owner_email,
          payload.company.owner_phone,
          payload.company.industry,
          payload.company.status || "active",
          payload.login_portal,
        ]
      );
      const tenantId = tenantResult.insertId;

      await connection.execute(
        `INSERT INTO wh_tenant_limits
         (max_users, max_warehouses, max_stores, max_orders_per_month, tenant_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          payload.limits.max_users,
          payload.limits.max_warehouses,
          payload.limits.max_stores,
          payload.limits.max_orders_per_month,
          tenantId,
        ]
      );

      await connection.execute(
        `INSERT INTO wh_tenant_subscriptions
         (billing_cycle, start_date, renewal_date, status, total_amount, amount_due,
          tenant_id, subscription_plan_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.billing.billing_cycle,
          payload.billing.start_date,
          payload.billing.renewal_date,
          payload.billing.status || "active",
          payload.billing.total_amount,
          payload.billing.amount_due,
          tenantId,
          payload.subscription_plan_id,
        ]
      );

      const bank = payload.payment?.bank ?? 0;
      const cash = payload.payment?.cash ?? 0;
      const totalReceived = payload.payment?.total_received ?? bank + cash;
      await connection.execute(
        `INSERT INTO wh_tenant_payments (bank, cash, total_received, received_at, tenant_id)
         VALUES (?, ?, ?, ?, ?)`,
        [bank, cash, totalReceived, payload.payment?.received_at || null, tenantId]
      );

      for (const moduleId of payload.module_ids) {
        await connection.execute(
          `INSERT INTO wh_tenant_modules (is_enabled, enabled_at, module_id, tenant_id)
           VALUES (1, NOW(), ?, ?)`,
          [moduleId, tenantId]
        );
      }

      const org = payload.organization;
      await connection.execute(
        `INSERT INTO organization_settings
         (company_name, logo_url, timezone, currency, language, fiscal_year_start, fiscal_year_end, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          org.company_name,
          org.logo_url || null,
          org.timezone || null,
          org.currency || null,
          org.language || null,
          org.fiscal_year_start || null,
          org.fiscal_year_end || null,
          tenantId,
        ]
      );

      const [roleResult] = await connection.execute(
        `INSERT INTO roles (role_name, description, status, tenant_id)
         VALUES ('Super Admin', 'Full access to all modules', 'active', ?)`,
        [tenantId]
      );
      const roleId = roleResult.insertId;

      for (const moduleId of payload.module_ids) {
        for (const action of PERMISSION_ACTIONS) {
          await connection.execute(
            `INSERT INTO permissions (permission_name, action, role_id, module_id)
             VALUES ('full_access', ?, ?, ?)`,
            [action, roleId, moduleId]
          );
        }
      }

      const hashedPassword = encrypt(payload.super_admin.password);
      await connection.execute(
        `INSERT INTO users (tenant_id, name, email, username, password, phone, status, role_id)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          tenantId,
          payload.super_admin.name || payload.super_admin.username,
          payload.super_admin.email,
          payload.super_admin.username,
          hashedPassword,
          payload.super_admin.phone || null,
          roleId,
        ]
      );

      await connection.commit();
      return tenantId;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },
};
