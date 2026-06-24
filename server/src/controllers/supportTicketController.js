import { supportTicketService } from "../services/supportTicketService.js";
import { getClientIp } from "../utils/whAudit.js";
import { tryParseEntityId } from "../utils/ids.js";

function auditCtx(req) {
  return { adminUserId: req.userId, ip: getClientIp(req) };
}

export const supportTicketController = {
  async list(req, res) {
    try {
      res.json(await supportTicketService.list(req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async get(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid ticket id" });
      const row = await supportTicketService.getById(id);
      if (!row) return res.status(404).json({ message: "Ticket not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async create(req, res) {
    try {
      const row = await supportTicketService.create(req.body, auditCtx(req));
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async update(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid ticket id" });
      const row = await supportTicketService.update(id, req.body, auditCtx(req));
      if (!row) return res.status(404).json({ message: "Ticket not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async remove(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid ticket id" });
      const ok = await supportTicketService.remove(id, auditCtx(req));
      if (!ok) return res.status(404).json({ message: "Ticket not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};
