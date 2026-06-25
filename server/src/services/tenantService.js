import { tenantRepository } from "../repositories/tenantRepository.js";
import { subscriptionRepository } from "../repositories/subscriptionRepository.js";
import { transactionRepository } from "../repositories/transactionRepository.js";
import { decrypt } from "../utils/cipher.js";
import { logWhAudit } from "../utils/whAudit.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";

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

    await tenantRepository.updateFull(id, {
      ...payload,
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

    const tenantId = await tenantRepository.createFull({
      ...payload,
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
      name: user.name,
      email: user.email,
      username: user.username || user.email,
      password,
    };
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
