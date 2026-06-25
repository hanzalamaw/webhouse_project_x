import { transactionRepository } from "../repositories/transactionRepository.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";

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

  async listPaymentsByTenant(tenantId) {
    const data = await transactionRepository.findPaymentsByTenant(tenantId);
    return { data };
  },

  async createPayment(tenantId, body) {
    return transactionRepository.createPayment(tenantId, body);
  },

  async updatePayment(id, body) {
    return transactionRepository.updatePayment(id, body);
  },

  async deletePayment(id) {
    return transactionRepository.deletePayment(id);
  },
};
