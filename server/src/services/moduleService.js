import { moduleRepository } from "../repositories/moduleRepository.js";
import { logWhAudit } from "../utils/whAudit.js";
import { paginatedResponse } from "../utils/pagination.js";

export const moduleService = {
  async list(query) {
    const { parsePagination } = await import("../utils/pagination.js");
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await moduleRepository.findAll({ limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async getAll() {
    const { rows } = await moduleRepository.findAll({ limit: 1000, offset: 0 });
    return rows;
  },

  async getById(id) {
    return moduleRepository.findById(id);
  },

  async create({ moduleName }, audit) {
    const id = await moduleRepository.create(moduleName);
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "module_create",
      oldValue: null,
      newValue: { id, module_name: moduleName },
      ipAddress: audit.ip,
    });
    return moduleRepository.findById(id);
  },

  async update(id, { moduleName }, audit) {
    const old = await moduleRepository.findById(id);
    if (!old) return null;
    await moduleRepository.update(id, moduleName);
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "module_update",
      oldValue: old,
      newValue: { ...old, module_name: moduleName },
      ipAddress: audit.ip,
    });
    return moduleRepository.findById(id);
  },

  async remove(id, audit) {
    const old = await moduleRepository.findById(id);
    if (!old) return false;
    const ok = await moduleRepository.softDelete(id);
    if (!ok) return false;
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "module_delete",
      oldValue: old,
      newValue: null,
      ipAddress: audit.ip,
    });
    return true;
  },
};
