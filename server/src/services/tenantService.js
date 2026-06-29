import { tenantRepository } from "../repositories/tenantRepository.js";
import { subscriptionRepository } from "../repositories/subscriptionRepository.js";
import { transactionRepository } from "../repositories/transactionRepository.js";
import { decrypt } from "../utils/cipher.js";
import { logWhAudit } from "../utils/whAudit.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";
import { assertUsernameAvailable, validateUsernameFormat } from "../utils/usernamePolicy.js";

const VALID_PORTALS = ["erp1", "erp2", "erp3"];

export const tenantService = {
  async list(query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await tenantRepository.findAll({ limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async getById(id) {
    const tenant = await tenantRepository.findById(id);
    if (!tenant) return null;
    const modules = await tenantRepository.getTenantModules(id);
    const organization = await tenantRepository.getOrganizationSettings(id);
    const payment = await tenantRepository.getLatestPayment(id);
    const super_admin = await tenantRepository.getSuperAdminUser(id);
    return { ...tenant, modules, organization, payment, super_admin };
  },

  async updateFull(id, payload, audit) {
    const old = await this.getById(id);
    if (!old) return null;

    const plan = await subscriptionRepository.findById(payload.subscription_plan_id);
    if (!plan) throw new Error("Subscription plan not found");

    const loginPortal = plan.login_portal;
    if (!loginPortal || !VALID_PORTALS.includes(loginPortal)) {
      throw new Error("Subscription plan has no valid ERP login portal");
    }

    let superAdmin = payload.super_admin;
    if (superAdmin?.username) {
      const existingSuperAdmin = await tenantRepository.getSuperAdminUser(id);
      const username = await assertUsernameAvailable(
        id,
        superAdmin.username,
        existingSuperAdmin?.id
      );
      superAdmin = { ...superAdmin, username };
    }

    await tenantRepository.updateFull(id, {
      ...payload,
      super_admin: superAdmin,
      login_portal: loginPortal,
    });
    await transactionRepository.processAutoRenewalForTenant(id);
    await transactionRepository.syncSubscriptionDues(id);
    const updated = await this.getById(id);
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "tenant_update_full",
      oldValue: old,
      newValue: updated,
      ipAddress: audit.ip,
    });
    return updated;
  },

  async createFull(payload, audit) {
    const plan = await subscriptionRepository.findById(payload.subscription_plan_id);
    if (!plan) throw new Error("Subscription plan not found");

    const loginPortal = plan.login_portal;
    if (!loginPortal || !VALID_PORTALS.includes(loginPortal)) {
      throw new Error("Subscription plan has no valid ERP login portal");
    }

    let superAdmin = payload.super_admin;
    if (superAdmin?.username) {
      const username = validateUsernameFormat(superAdmin.username);
      superAdmin = { ...superAdmin, username };
    }

    const tenantId = await tenantRepository.createFull({
      ...payload,
      super_admin: superAdmin,
      login_portal: loginPortal,
    });
    const created = await this.getById(tenantId);
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "tenant_create",
      oldValue: null,
      newValue: created,
      ipAddress: audit.ip,
    });
    return created;
  },

  async update(id, data, audit) {
    const old = await this.getById(id);
    if (!old) return null;
    const { login_portal: _ignored, ...safe } = data;
    await tenantRepository.update(id, safe);
    const updated = await this.getById(id);
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "tenant_update",
      oldValue: old,
      newValue: updated,
      ipAddress: audit.ip,
    });
    return updated;
  },

  async getSuperAdminCredentials(id) {
    const tenant = await tenantRepository.findById(id);
    if (!tenant) return null;
    const user = await tenantRepository.getSuperAdminUser(id);
    if (!user) return null;
    let password = null;
    try {
      password = decrypt(user.password);
    } catch {
      password = null;
    }
    return {
      tenant_id: id,
      company_name: tenant.company_name,
      owner_name: tenant.owner_name,
      owner_email: tenant.owner_email,
      owner_phone: tenant.owner_phone,
      industry: tenant.industry,
      status: tenant.status,
      login_portal: tenant.login_portal,
      plan_name: tenant.plan_name,
      billing_cycle: tenant.billing_cycle,
      total_amount: tenant.total_amount,
      amount_due: tenant.amount_due,
      max_users: tenant.max_users,
      max_warehouses: tenant.max_warehouses,
      max_stores: tenant.max_stores,
      max_orders_per_month: tenant.max_orders_per_month,
      name: user.name,
      email: user.email,
      username: user.username || user.email,
      password,
    };
  },

  async getAccountDetails(id) {
    const tenantFull = await this.getById(id);
    if (!tenantFull) return null;
    const credentials = await this.getSuperAdminCredentials(id);
    const { modules, organization, payment, super_admin, ...tenant } = tenantFull;
    return { tenant, credentials, modules: modules || [], organization, payment };
  },

  async remove(id, audit) {
    const old = await tenantRepository.findById(id);
    if (!old) return false;
    const ok = await tenantRepository.softDelete(id);
    if (!ok) return false;
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "tenant_delete",
      oldValue: old,
      newValue: null,
      ipAddress: audit.ip,
    });
    return true;
  },
};
