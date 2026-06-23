import { tenantService } from "../services/tenantService.js";
import { getClientIp } from "../utils/whAudit.js";
import { tryParseEntityId } from "../utils/ids.js";

function auditCtx(req) {
  return { adminUserId: req.userId, ip: getClientIp(req) };
}

export const tenantController = {
  async list(req, res) {
    try {
      res.json(await tenantService.list(req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async get(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid tenant id" });
      const row = await tenantService.getById(id);
      if (!row) return res.status(404).json({ message: "Tenant not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async create(req, res) {
    try {
      const row = await tenantService.createFull(req.body, auditCtx(req));
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async update(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid tenant id" });
      const row = await tenantService.update(id, req.body, auditCtx(req));
      if (!row) return res.status(404).json({ message: "Tenant not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async getCredentials(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid tenant id" });
      const row = await tenantService.getSuperAdminCredentials(id);
      if (!row) return res.status(404).json({ message: "Super admin not found for this tenant" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async remove(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid tenant id" });
      const ok = await tenantService.remove(id, auditCtx(req));
      if (!ok) return res.status(404).json({ message: "Tenant not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};
