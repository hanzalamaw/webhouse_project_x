import { supportTicketRepository } from "../repositories/supportTicketRepository.js";
import { logWhAudit } from "../utils/whAudit.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";

export const supportTicketService = {
  async list(query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await supportTicketRepository.findAll({
      limit,
      offset,
      status: query.status || null,
      tenantId: query.tenant_id ? Number(query.tenant_id) : null,
    });
    return paginatedResponse(rows, total, page, limit);
  },

  async getById(id) {
    return supportTicketRepository.findById(id);
  },

  async create(payload, audit) {
    if (!payload.subject?.trim()) throw new Error("Subject is required");
    if (!payload.description?.trim()) throw new Error("Description is required");
    if (!payload.tenant_id) throw new Error("Tenant is required");
    const id = await supportTicketRepository.create({
      subject: payload.subject.trim(),
      description: payload.description.trim(),
      status: payload.status || "open",
      tenantId: Number(payload.tenant_id),
    });
    const created = await supportTicketRepository.findById(id);
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "support_ticket_create",
      oldValue: null,
      newValue: created,
      ipAddress: audit.ip,
    });
    return created;
  },

  async update(id, payload, audit) {
    const old = await supportTicketRepository.findById(id);
    if (!old) return null;
    await supportTicketRepository.update(id, {
      subject: payload.subject?.trim() || old.subject,
      description: payload.description?.trim() || old.description,
      status: payload.status || old.status,
    });
    const updated = await supportTicketRepository.findById(id);
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "support_ticket_update",
      oldValue: old,
      newValue: updated,
      ipAddress: audit.ip,
    });
    return updated;
  },

  async remove(id, audit) {
    const old = await supportTicketRepository.findById(id);
    if (!old) return false;
    const ok = await supportTicketRepository.softDelete(id);
    if (!ok) return false;
    await logWhAudit({
      adminUserId: audit.adminUserId,
      action: "support_ticket_delete",
      oldValue: old,
      newValue: null,
      ipAddress: audit.ip,
    });
    return true;
  },
};
