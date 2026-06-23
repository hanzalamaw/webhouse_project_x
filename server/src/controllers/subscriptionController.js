import { subscriptionService } from "../services/subscriptionService.js";
import { getClientIp } from "../utils/whAudit.js";
import { tryParseEntityId } from "../utils/ids.js";

function auditCtx(req) {
  return { adminUserId: req.userId, ip: getClientIp(req) };
}

export const subscriptionController = {
  async list(req, res) {
    try {
      res.json(await subscriptionService.list(req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async get(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid plan id" });
      const row = await subscriptionService.getById(id);
      if (!row) return res.status(404).json({ message: "Plan not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getModules(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid plan id" });
      const modules = await subscriptionService.getPlanModules(id);
      res.json({ data: modules });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async create(req, res) {
    try {
      const { plan_name, plan_price, login_portal, module_ids } = req.body;
      if (!plan_name?.trim()) return res.status(400).json({ message: "plan_name is required" });
      if (plan_price == null) return res.status(400).json({ message: "plan_price is required" });
      if (!login_portal || !["erp1", "erp2", "erp3"].includes(login_portal)) {
        return res.status(400).json({ message: "login_portal must be erp1, erp2, or erp3" });
      }
      const row = await subscriptionService.create(
        {
          planName: plan_name.trim(),
          planPrice: plan_price,
          loginPortal: login_portal,
          moduleIds: module_ids || [],
        },
        auditCtx(req)
      );
      res.status(201).json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async update(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid plan id" });
      const { plan_name, plan_price, login_portal, module_ids } = req.body;
      const row = await subscriptionService.update(
        id,
        {
          planName: plan_name?.trim(),
          planPrice: plan_price,
          loginPortal: login_portal,
          moduleIds: module_ids,
        },
        auditCtx(req)
      );
      if (!row) return res.status(404).json({ message: "Plan not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async remove(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid plan id" });
      const ok = await subscriptionService.remove(id, auditCtx(req));
      if (!ok) return res.status(404).json({ message: "Plan not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};
