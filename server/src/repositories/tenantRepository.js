import { readDb, writeDb } from "../database/db.js";
import { encrypt } from "../utils/cipher.js";
import { cascadeSoftDeleteTenant } from "../utils/softDeleteCascade.js";
import { subscriptionRepository } from "./subscriptionRepository.js";

const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "manage"];
const DEFAULT_TIMEZONE = "Asia/Karachi";

export const tenantRepository = {
  async findAll({ limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT t.id, t.id AS tenant_id, t.company_name, t.owner_name, t.owner_email, t.owner_phone,
              t.industry, t.status, t.login_portal, t.created_at, t.updated_at,
              (SELECT u.username FROM users u
               INNER JOIN roles r ON r.id = u.role_id AND r.deleted_at IS NULL
               WHERE u.tenant_id = t.id AND u.deleted_at IS NULL AND r.role_name = 'Super Admin'
               ORDER BY u.id ASC LIMIT 1) AS super_admin_username,
              tl.max_users, tl.max_warehouses, tl.max_stores, tl.max_orders_per_month,
              (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS user_count,
              (SELECT COUNT(*) FROM inventory_warehouses w WHERE w.tenant_id = t.id AND w.deleted_at IS NULL) AS warehouse_count,
              (SELECT COUNT(*) FROM pos_outlets s WHERE s.tenant_id = t.id AND s.deleted_at IS NULL) AS store_count,
              (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id AND o.deleted_at IS NULL
                 AND MONTH(o.created_at) = MONTH(CURRENT_DATE()) AND YEAR(o.created_at) = YEAR(CURRENT_DATE())) AS orders_this_month,
              ts.billing_cycle, ts.start_date, ts.renewal_date,
              COALESCE(ts.billing_anchor_date, ts.start_date) AS billing_anchor_date,
              ts.status AS subscription_status,
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
              (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS user_count,
              (SELECT COUNT(*) FROM inventory_warehouses w WHERE w.tenant_id = t.id AND w.deleted_at IS NULL) AS warehouse_count,
              (SELECT COUNT(*) FROM pos_outlets s WHERE s.tenant_id = t.id AND s.deleted_at IS NULL) AS store_count,
              (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id AND o.deleted_at IS NULL
                 AND MONTH(o.created_at) = MONTH(CURRENT_DATE()) AND YEAR(o.created_at) = YEAR(CURRENT_DATE())) AS orders_this_month,
              ts.id AS subscription_id, ts.billing_cycle, ts.start_date, ts.renewal_date,
              COALESCE(ts.billing_anchor_date, ts.start_date) AS billing_anchor_date,
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
    const [planRows] = await readDb.query(
      `SELECT m.id AS module_id, 1 AS is_enabled, m.module_name
       FROM wh_tenant_subscriptions ts
       INNER JOIN wh_subscription_module sm
         ON sm.subscription_plan_id = ts.subscription_plan_id AND sm.deleted_at IS NULL
       INNER JOIN modules m ON m.id = sm.module_id AND m.deleted_at IS NULL
       WHERE ts.tenant_id = ? AND ts.deleted_at IS NULL
       ORDER BY m.module_name`,
      [tenantId]
    );
    if (planRows.length > 0) return planRows;

    const [rows] = await readDb.query(
      `SELECT tm.module_id, tm.is_enabled, m.module_name
       FROM wh_tenant_modules tm
       JOIN modules m ON m.id = tm.module_id AND m.deleted_at IS NULL
       WHERE tm.tenant_id = ? AND tm.deleted_at IS NULL`,
      [tenantId]
    );
    return rows;
  },

  async resolveTenantModuleIds(subscriptionPlanId, requestedModuleIds) {
    const planModuleIds = await subscriptionRepository.getModuleIds(subscriptionPlanId);
    if (!planModuleIds.length) return (requestedModuleIds || []).map(Number).filter(Boolean);

    const requested = (requestedModuleIds || []).map(Number).filter(Boolean);
    if (!requested.length) return planModuleIds;

    const allowed = new Set(planModuleIds);
    const filtered = requested.filter((id) => allowed.has(id));
    return filtered.length > 0 ? filtered : planModuleIds;
  },

  async setTenantModules(tenantId, moduleIds, connection = null) {
    const exec = connection ? connection.execute.bind(connection) : writeDb.query.bind(writeDb);
    await exec(
      `UPDATE wh_tenant_modules SET deleted_at = NOW() WHERE tenant_id = ? AND deleted_at IS NULL`,
      [tenantId]
    );
    for (const moduleId of moduleIds) {
      await exec(
        `INSERT INTO wh_tenant_modules (is_enabled, enabled_at, module_id, tenant_id)
         VALUES (1, NOW(), ?, ?)
         ON DUPLICATE KEY UPDATE is_enabled = 1, enabled_at = NOW(), disabled_at = NULL, deleted_at = NULL`,
        [moduleId, tenantId]
      );
    }
  },

  async syncTenantModulesFromPlan(tenantId, planId, connection = null) {
    const moduleIds = await subscriptionRepository.getModuleIds(planId);
    await this.setTenantModules(tenantId, moduleIds, connection);
    return moduleIds;
  },

  async syncModulesForPlanTenants(planId) {
    const [tenants] = await readDb.query(
      `SELECT tenant_id FROM wh_tenant_subscriptions
       WHERE subscription_plan_id = ? AND deleted_at IS NULL`,
      [planId]
    );
    for (const { tenant_id } of tenants) {
      await this.syncTenantModulesFromPlan(tenant_id, planId);
    }
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
       WHERE tenant_id = ? AND deleted_at IS NULL AND total_received > 0
       ORDER BY id DESC LIMIT 1`,
      [tenantId]
    );
    return rows[0] || null;
  },

  async updateSuperAdmin(tenantId, { name, email, username, password }) {
    const user = await this.getSuperAdminUser(tenantId);
    if (!user) return;
    if (password) {
      const hashed = encrypt(password);
      await writeDb.query(
        `UPDATE users SET name = ?, email = ?, username = ?, password = ?
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [name, email, username, hashed, user.id, tenantId]
      );
    } else {
      await writeDb.query(
        `UPDATE users SET name = ?, email = ?, username = ?
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [name, email, username, user.id, tenantId]
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
        `INSERT INTO wh_tenant_limits
         (max_users, max_warehouses, max_stores, max_orders_per_month, tenant_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           max_users = VALUES(max_users),
           max_warehouses = VALUES(max_warehouses),
           max_stores = VALUES(max_stores),
           max_orders_per_month = VALUES(max_orders_per_month),
           deleted_at = NULL`,
        [
          payload.limits.max_users,
          payload.limits.max_warehouses,
          payload.limits.max_stores,
          payload.limits.max_orders_per_month,
          tenantId,
        ]
      );

      const [existingSubs] = await connection.execute(
        `SELECT id FROM wh_tenant_subscriptions WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
        [tenantId]
      );
      const billingParams = [
        payload.billing.billing_cycle,
        payload.billing.start_date,
        payload.billing.renewal_date,
        payload.billing.start_date,
        payload.billing.status || "active",
        payload.billing.total_amount,
        payload.billing.amount_due,
        payload.subscription_plan_id,
      ];
      if (existingSubs.length) {
        await connection.execute(
          `UPDATE wh_tenant_subscriptions SET billing_cycle = ?, start_date = ?, renewal_date = ?,
           billing_anchor_date = ?, status = ?, total_amount = ?, amount_due = ?, subscription_plan_id = ?
           WHERE id = ? AND deleted_at IS NULL`,
          [...billingParams, existingSubs[0].id]
        );
      } else {
        await connection.execute(
          `INSERT INTO wh_tenant_subscriptions
           (billing_cycle, start_date, renewal_date, billing_anchor_date, status, total_amount, amount_due,
            tenant_id, subscription_plan_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...billingParams, tenantId]
        );
      }

      const [payRows] = await connection.execute(
        `SELECT id FROM wh_tenant_payments WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`,
        [tenantId]
      );
      const bank = payload.payment?.bank ?? 0;
      const cash = payload.payment?.cash ?? 0;
      const totalReceived = payload.payment?.total_received ?? bank + cash;
      if (totalReceived > 0) {
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
      } else if (payRows.length) {
        await connection.execute(
          `UPDATE wh_tenant_payments SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
          [payRows[0].id]
        );
      }

      await connection.execute(
        `UPDATE wh_tenant_modules SET deleted_at = NOW() WHERE tenant_id = ? AND deleted_at IS NULL`,
        [tenantId]
      );
      const moduleIds = await this.resolveTenantModuleIds(
        payload.subscription_plan_id,
        payload.module_ids
      );
      for (const moduleId of moduleIds) {
        await connection.execute(
          `INSERT INTO wh_tenant_modules (is_enabled, enabled_at, module_id, tenant_id)
           VALUES (1, NOW(), ?, ?)
           ON DUPLICATE KEY UPDATE is_enabled = 1, enabled_at = NOW(), disabled_at = NULL, deleted_at = NULL`,
          [moduleId, tenantId]
        );
      }

      const org = payload.organization;
      await connection.execute(
        `INSERT INTO organization_settings
         (company_name, logo_url, timezone, currency, language, fiscal_year_start, fiscal_year_end, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           company_name = VALUES(company_name),
           logo_url = VALUES(logo_url),
           timezone = VALUES(timezone),
           currency = VALUES(currency),
           language = VALUES(language),
           fiscal_year_start = VALUES(fiscal_year_start),
           fiscal_year_end = VALUES(fiscal_year_end),
           deleted_at = NULL`,
        [
          org.company_name,
          org.logo_url || null,
          org.timezone || DEFAULT_TIMEZONE,
          org.currency || null,
          org.language || null,
          org.fiscal_year_start || null,
          org.fiscal_year_end || null,
          tenantId,
        ]
      );

      if (payload.super_admin?.username) {
        const user = await this.getSuperAdminUser(tenantId);
        const sa = payload.super_admin;
        if (user) {
          if (sa.password) {
            const hashed = encrypt(sa.password);
            await connection.execute(
              `UPDATE users SET name = ?, email = ?, username = ?, password = ?
               WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
              [sa.name || sa.username, sa.email, sa.username, hashed, user.id, tenantId]
            );
          } else {
            await connection.execute(
              `UPDATE users SET name = ?, email = ?, username = ?
               WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
              [sa.name || sa.username, sa.email, sa.username, user.id, tenantId]
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
         (billing_cycle, start_date, billing_anchor_date, renewal_date, status, total_amount, amount_due,
          tenant_id, subscription_plan_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.billing.billing_cycle,
          payload.billing.start_date,
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
      if (totalReceived > 0) {
        await connection.execute(
          `INSERT INTO wh_tenant_payments (bank, cash, total_received, received_at, tenant_id)
           VALUES (?, ?, ?, ?, ?)`,
          [bank, cash, totalReceived, payload.payment?.received_at || null, tenantId]
        );
      }

      const moduleIds = await this.resolveTenantModuleIds(
        payload.subscription_plan_id,
        payload.module_ids
      );
      for (const moduleId of moduleIds) {
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
          org.timezone || DEFAULT_TIMEZONE,
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

      for (const moduleId of moduleIds) {
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
