import { tenantUserRepository } from "../repositories/tenantUserRepository.js";
import { tenantRoleRepository } from "../repositories/tenantRoleRepository.js";
import { organizationSettingsRepository } from "../repositories/organizationSettingsRepository.js";
import { activityAlertRepository } from "../repositories/activityAlertRepository.js";
import { sessionRepository } from "../repositories/sessionRepository.js";
import { logRepository } from "../repositories/logRepository.js";
import { tenantRepository } from "../repositories/tenantRepository.js";
import { transactionRepository } from "../repositories/transactionRepository.js";
import { logTenantAudit } from "../utils/tenantAudit.js";
import { createActivityAlert } from "../utils/activityAlerts.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";
import { isSuperAdminRole, isSuperAdminRoleName, isSuperAdminUser } from "../utils/tenantRoles.js";
import { assertUsernameAvailable } from "../utils/usernamePolicy.js";

function auditCtx(req) {
  return {
    tenantId: req.tenantId,
    userId: req.userId,
    ipAddress: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress,
    deviceInfo: req.headers["user-agent"] || null,
    impersonatedBy: req.impersonatedBy,
  };
}

export const tenantPortalService = {
  async getOrganization(tenantId) {
    return organizationSettingsRepository.getByTenant(tenantId);
  },

  async updateOrganization(req, body) {
    const ctx = auditCtx(req);
    const old = await organizationSettingsRepository.getByTenant(ctx.tenantId);
    await organizationSettingsRepository.upsert(ctx.tenantId, body);
    await logTenantAudit({
      ...ctx,
      action: "organization_settings_update",
      oldValue: old,
      newValue: body,
    });
    return organizationSettingsRepository.getByTenant(ctx.tenantId);
  },

  async listUsers(tenantId) {
    const users = await tenantUserRepository.findAllByTenant(tenantId);
    const limits = await tenantUserRepository.getLimits(tenantId);
    const activeCount = await tenantUserRepository.countActive(tenantId);
    return { data: users, limits: { max_users: limits.max_users, active_count: activeCount } };
  },

  async createUser(req, body) {
    const ctx = auditCtx(req);
    const limits = await tenantUserRepository.getLimits(ctx.tenantId);
    const activeCount = await tenantUserRepository.countActive(ctx.tenantId);
    if (body.status === "active" && activeCount >= limits.max_users) {
      const err = new Error(`Active user limit reached (${limits.max_users})`);
      err.status = 400;
      throw err;
    }
    if (!body.password || body.password.length < 6) {
      const err = new Error("Password is required (min 6 characters)");
      err.status = 400;
      throw err;
    }
    const role = await tenantRoleRepository.findById(ctx.tenantId, body.role_id);
    if (!role) {
      const err = new Error("Role not found");
      err.status = 400;
      throw err;
    }
    if (isSuperAdminRole(role)) {
      const err = new Error("Super Admin role cannot be assigned to new users");
      err.status = 400;
      throw err;
    }
    body.username = await assertUsernameAvailable(ctx.tenantId, body.username);
    const id = await tenantUserRepository.create(ctx.tenantId, body);
    const user = await tenantUserRepository.findById(ctx.tenantId, id);
    await logTenantAudit({ ...ctx, action: "user_create", newValue: user });
    return user;
  },

  async updateUser(req, userId, body) {
    const ctx = auditCtx(req);
    const old = await tenantUserRepository.findById(ctx.tenantId, userId);
    if (!old) return null;

    if (body.status === "active" && old.status !== "active") {
      const limits = await tenantUserRepository.getLimits(ctx.tenantId);
      const activeCount = await tenantUserRepository.countActive(ctx.tenantId);
      if (activeCount >= limits.max_users) {
        const err = new Error(`Active user limit reached (${limits.max_users})`);
        err.status = 400;
        throw err;
      }
    }

    const payload = { ...body };
    if (payload.username != null) {
      payload.username = await assertUsernameAvailable(ctx.tenantId, payload.username, userId);
    }
    if (isSuperAdminUser(old)) {
      if (payload.role_id != null && Number(payload.role_id) !== Number(old.role_id)) {
        const err = new Error("Super Admin user role cannot be changed");
        err.status = 400;
        throw err;
      }
      payload.role_id = old.role_id;
    } else if (payload.role_id != null) {
      const targetRole = await tenantRoleRepository.findById(ctx.tenantId, payload.role_id);
      if (!targetRole) {
        const err = new Error("Role not found");
        err.status = 400;
        throw err;
      }
      if (isSuperAdminRole(targetRole)) {
        const err = new Error("Super Admin role cannot be assigned to other users");
        err.status = 400;
        throw err;
      }
    }

    await tenantUserRepository.update(ctx.tenantId, userId, payload);
    const updated = await tenantUserRepository.findById(ctx.tenantId, userId);

    if (old.status === "active" && body.status === "inactive") {
      await createActivityAlert({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        alertType: "user_deactivated",
        title: "User deactivated",
        message: `${old.name} was set to inactive.`,
        priority: "medium",
      });
    }

    await logTenantAudit({ ...ctx, action: "user_update", oldValue: old, newValue: updated });
    return updated;
  },

  async listRoles(tenantId) {
    return tenantRoleRepository.findAllByTenant(tenantId);
  },

  async getRole(tenantId, roleId) {
    const role = await tenantRoleRepository.findById(tenantId, roleId);
    if (!role) return null;
    const { matrix } = await tenantRoleRepository.getPermissionsMatrix(tenantId, roleId);
    const modules = await tenantRoleRepository.listAssignableModules(tenantId);
    return { ...role, permissions: matrix, assignable_modules: modules };
  },

  async createRole(req, body) {
    const ctx = auditCtx(req);
    if (isSuperAdminRoleName(body.role_name)) {
      const err = new Error("Super Admin is a reserved role");
      err.status = 400;
      throw err;
    }
    const modules = await tenantRoleRepository.listAssignableModules(ctx.tenantId);
    const allowed = new Set(modules.map((m) => String(m.id)));
    const filtered = {};
    for (const [mid, actions] of Object.entries(body.permissions || {})) {
      if (allowed.has(String(mid))) filtered[mid] = actions;
    }
    const id = await tenantRoleRepository.create(ctx.tenantId, { ...body, permissions: filtered });
    await createActivityAlert({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      alertType: "role_change",
      title: "Role created",
      message: `Role "${body.role_name}" was created.`,
    });
    await logTenantAudit({
      ...ctx,
      action: "role_create",
      newValue: { id, ...body, permissions: filtered },
    });
    return this.getRole(ctx.tenantId, id);
  },

  async updateRole(req, roleId, body) {
    const ctx = auditCtx(req);
    const old = await this.getRole(ctx.tenantId, roleId);
    if (!old) return null;

    let filtered;
    if (body.permissions) {
      const modules = await tenantRoleRepository.listAssignableModules(ctx.tenantId);
      const allowed = new Set(modules.map((m) => String(m.id)));
      filtered = {};
      for (const [mid, actions] of Object.entries(body.permissions)) {
        if (allowed.has(String(mid))) filtered[mid] = actions;
      }
    }

    await tenantRoleRepository.update(ctx.tenantId, roleId, { ...body, permissions: filtered });
    await createActivityAlert({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      alertType: body.permissions ? "permission_change" : "role_change",
      title: body.permissions ? "Permissions updated" : "Role updated",
      message: `Role "${old.role_name}" was updated.`,
    });
    await logTenantAudit({
      ...ctx,
      action: "role_update",
      oldValue: old,
      newValue: await this.getRole(ctx.tenantId, roleId),
    });
    return this.getRole(ctx.tenantId, roleId);
  },

  async listSessions(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const activeOnly = query.active === "true";
    const { rows, total } = await sessionRepository.findByTenant(tenantId, { limit, offset, activeOnly });
    return paginatedResponse(rows, total, page, limit);
  },

  async terminateSession(req, sessionId) {
    const ctx = auditCtx(req);
    const pool = await import("../database/db.js").then((m) => m.readDb);
    const [check] = await pool.query(
      `SELECT id FROM sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [sessionId, ctx.tenantId]
    );
    if (!check.length) return false;
    await sessionRepository.terminate(sessionId);
    await logTenantAudit({ ...ctx, action: "session_terminate", newValue: { sessionId } });
    return true;
  },

  async listAuditLogs(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await logRepository.findTenantLogs({ tenantId, limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async listAlerts(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await activityAlertRepository.findByTenant(tenantId, { limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async markAlertRead(tenantId, alertId) {
    return activityAlertRepository.markRead(tenantId, alertId);
  },

  async getSubscriptionBilling(tenantId) {
    await transactionRepository.processAutoRenewalForTenant(tenantId);
    const tenant = await tenantRepository.findById(tenantId);
    const modules = await tenantRepository.getTenantModules(tenantId);
    const limits = await tenantUserRepository.getLimits(tenantId);
    const activeUsers = await tenantUserRepository.countActive(tenantId);
    const billing = await transactionRepository.findTenantBillingById(tenantId);
    const payments = await transactionRepository.findPaymentsByTenant(tenantId);
    return {
      tenant: {
        company_name: tenant?.company_name,
        plan_name: tenant?.plan_name,
        billing_cycle: tenant?.billing_cycle,
        start_date: tenant?.start_date,
        renewal_date: tenant?.renewal_date,
        subscription_status: tenant?.subscription_status,
      },
      limits: {
        max_users: limits.max_users,
        active_users: activeUsers,
        max_warehouses: tenant?.max_warehouses,
        max_stores: tenant?.max_stores,
        max_orders_per_month: tenant?.max_orders_per_month,
      },
      billing,
      modules,
      payments,
    };
  },

  async getDashboardStats(tenantId) {
    const users = await tenantUserRepository.findAllByTenant(tenantId);
    const activeUsers = users.filter((u) => u.status === "active").length;
    const { rows: sessions } = await sessionRepository.findByTenant(tenantId, {
      limit: 100,
      offset: 0,
      activeOnly: true,
    });
    const alerts = await activityAlertRepository.findByTenant(tenantId, { limit: 5, offset: 0 });
    const failedLoginCount = await activityAlertRepository.countByType(tenantId, "failed_login");
    const { rows: auditRows } = await logRepository.findTenantLogs({ tenantId, limit: 8, offset: 0 });
    return {
      active_users: activeUsers,
      total_users: users.length,
      live_sessions: sessions.length,
      failed_login_count: failedLoginCount,
      recent_activities: auditRows,
      recent_alerts: alerts.rows,
      modules: await tenantRepository.getTenantModules(tenantId),
    };
  },
};
