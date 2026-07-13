import { ecommerceService } from "../services/ecommerceService.js";
import { getEcomLinkStatus } from "../services/ecommerce/ecomPush.js";

export const ecommerceController = {
  async dashboard(req, res) {
    try {
      res.json(await ecommerceService.dashboard(req.tenantId));
    } catch (error) {
      console.error("Ecommerce dashboard error:", error);
      res.status(500).json({ message: error.message || "Failed to load dashboard" });
    }
  },

  async syncLink(req, res) {
    const entityType = String(req.query.entityType || "").trim();
    const entityId = Number(req.query.entityId);
    if (!entityType || !entityId) {
      return res.status(400).json({ success: false, error: "entityType and entityId are required" });
    }
    if (!req.tenantId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const status = await getEcomLinkStatus(req.tenantId, entityType, entityId);
    res.json({ success: true, ...status });
  },
};
