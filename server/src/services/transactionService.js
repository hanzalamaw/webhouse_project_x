import { transactionRepository } from "../repositories/transactionRepository.js";
import { tenantRepository } from "../repositories/tenantRepository.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";
import { tryParseEntityId } from "../utils/ids.js";
import { logWhAudit } from "../utils/whAudit.js";

export const transactionService = {
  async getSummary() {
    return transactionRepository.getSummary();
  },

  async listTenants(query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await transactionRepository.findAllTenantBilling({ limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async listPayments(query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await transactionRepository.findAllPayments({ limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async listPaymentsByTenant(rawTenantId) {
    const tenantId = tryParseEntityId(rawTenantId);
    if (!tenantId) throw Object.assign(new Error("Invalid tenant id"), { status: 400 });
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) throw Object.assign(new Error("Tenant not found"), { status: 404 });
    const data = await transactionRepository.findPaymentsByTenant(tenantId);
    return { data };
  },

  async createPayment(rawTenantId, body, { adminUserId, ipAddress } = {}) {
    const tenantId = tryParseEntityId(rawTenantId);
    if (!tenantId) throw Object.assign(new Error("Invalid tenant id"), { status: 400 });
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) throw Object.assign(new Error("Tenant not found"), { status: 404 });

    const data = await transactionRepository.createPayment(tenantId, body);

    if (adminUserId) {
      await logWhAudit({
        adminUserId,
        action: "create_tenant_payment",
        newValue: { tenant_id: tenantId, payment_id: data?.id, company_name: tenant.company_name },
        ipAddress,
      });
    }

    return data;
  },

  async updatePayment(id, body, { adminUserId, ipAddress } = {}) {
    const data = await transactionRepository.updatePayment(id, body);
    if (adminUserId && data) {
      await logWhAudit({
        adminUserId,
        action: "update_tenant_payment",
        newValue: { payment_id: id, tenant_id: data.tenant_id },
        ipAddress,
      });
    }
    return data;
  },

  async deletePayment(id, { adminUserId, ipAddress } = {}) {
    const payment = await transactionRepository.findPaymentById(id);
    await transactionRepository.deletePayment(id);
    if (adminUserId && payment) {
      await logWhAudit({
        adminUserId,
        action: "delete_tenant_payment",
        oldValue: { payment_id: id, tenant_id: payment.tenant_id },
        ipAddress,
      });
    }
  },
};
