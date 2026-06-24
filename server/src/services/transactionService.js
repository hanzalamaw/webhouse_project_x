import { transactionRepository } from "../repositories/transactionRepository.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";

export const transactionService = {
  async getSummary() {
    return transactionRepository.getSummary();
  },

  async listPayments(query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await transactionRepository.findAllPayments({ limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async updatePayment(id, body) {
    return transactionRepository.updatePayment(id, body);
  },
};
