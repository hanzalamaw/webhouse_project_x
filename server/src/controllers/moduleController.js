import { moduleService } from "../services/moduleService.js";
import { getClientIp } from "../utils/whAudit.js";
import { tryParseEntityId } from "../utils/ids.js";
function auditCtx(req) {
  return { adminUserId: req.userId, ip: getClientIp(req) };
}

export const moduleController = {
  async list(req, res) {
    try {
      const result = await moduleService.list(req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listAll(req, res) {
    try {
      const data = await moduleService.getAll();
      res.json({ data });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async get(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid module id" });
      const row = await moduleService.getById(id);
      if (!row) return res.status(404).json({ message: "Module not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async create(req, res) {
    try {
      const { module_name } = req.body;
      if (!module_name?.trim()) return res.status(400).json({ message: "module_name is required" });
      const row = await moduleService.create({ moduleName: module_name.trim() }, auditCtx(req));
      res.status(201).json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async update(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid module id" });
      const { module_name } = req.body;
      if (!module_name?.trim()) return res.status(400).json({ message: "module_name is required" });
      const row = await moduleService.update(id, { moduleName: module_name.trim() }, auditCtx(req));
      if (!row) return res.status(404).json({ message: "Module not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async remove(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid module id" });
      const ok = await moduleService.remove(id, auditCtx(req));
      if (!ok) return res.status(404).json({ message: "Module not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};
