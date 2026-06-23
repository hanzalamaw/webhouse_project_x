import { logRepository } from "../repositories/logRepository.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";

export const logService = {
  async listWh(query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await logRepository.findWhLogs({ limit, offset });
    const data = rows.map((r) => ({
      ...r,
      old_value: parseJson(r.old_value),
      new_value: parseJson(r.new_value),
    }));
    return paginatedResponse(data, total, page, limit);
  },

  async listTenant(query) {
    const tenantId = Number(query.tenant_id);
    if (!tenantId) {
      return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } };
    }
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await logRepository.findTenantLogs({ tenantId, limit, offset });
    const data = rows.map((r) => ({
      ...r,
      old_value: parseJson(r.old_value),
      new_value: parseJson(r.new_value),
    }));
    return paginatedResponse(data, total, page, limit);
  },
};

function parseJson(val) {
  if (val == null) return null;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}
