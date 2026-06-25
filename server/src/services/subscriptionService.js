import { subscriptionRepository } from "../repositories/subscriptionRepository.js";
import { tenantRepository } from "../repositories/tenantRepository.js";
import { logWhAudit } from "../utils/whAudit.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";

export const subscriptionService = {
  async list(query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await subscriptionRepository.findAll({ limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async getById(id) {
    const plan = await subscriptionRepository.findById(id);
    if (!plan) return null;
    const modules = await subscriptionRepository.getModulesForPlan(id);
    return { ...plan, modules };
  },

  async create({ planName, planPrice, loginPortal, moduleIds }, audit) {
    const id = await subscriptionRepository.create({
      planName,
      planPrice,
      loginPortal: loginPortal || "erp1",
      moduleIds: moduleIds || [],
    });
    const plan = await this.getById(id);
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "subscription_create",
      oldValue: null,
      newValue: plan,
      ipAddress: audit.ip,
    });
    return plan;
  },

  async update(id, { planName, planPrice, loginPortal, moduleIds }, audit) {
    const old = await this.getById(id);
    if (!old) return null;
    await subscriptionRepository.update(id, {
      planName,
      planPrice,
      loginPortal: loginPortal || old.login_portal,
      moduleIds: moduleIds || [],
    });
    if (loginPortal && loginPortal !== old.login_portal) {
      await tenantRepository.syncLoginPortalForPlan(id, loginPortal);
    }
    await tenantRepository.syncModulesForPlanTenants(id);
    const updated = await this.getById(id);
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "subscription_update",
      oldValue: old,
      newValue: updated,
      ipAddress: audit.ip,
    });
    return updated;
  },

  async remove(id, audit) {
    const old = await subscriptionRepository.findById(id);
    if (!old) return false;
    const ok = await subscriptionRepository.softDelete(id);
    if (!ok) return false;
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "subscription_delete",
      oldValue: old,
      newValue: null,
      ipAddress: audit.ip,
    });
    return true;
  },

  async getPlanModules(planId) {
    return subscriptionRepository.getModulesForPlan(planId);
  },
};
