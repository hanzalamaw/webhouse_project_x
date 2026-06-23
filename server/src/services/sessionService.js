import { sessionRepository } from "../repositories/sessionRepository.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";
import { logWhAudit } from "../utils/whAudit.js";

export const sessionService = {
  async list(query) {
    const { page, limit, offset } = parsePagination(query);
    const activeOnly = query.active !== "false";
    const { rows, total } = await sessionRepository.findAll({ limit, offset, activeOnly });
    return paginatedResponse(rows, total, page, limit);
  },

  async terminate(id, audit) {
    const affected = await sessionRepository.terminate(id);
    if (!affected) return false;
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "session_terminate",
      oldValue: { session_id: Number(id) },
      newValue: { is_active: 0 },
      ipAddress: audit.ip,
    });
    return true;
  },
};
