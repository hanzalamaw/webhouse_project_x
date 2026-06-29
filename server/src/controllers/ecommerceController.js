import { ecommerceService } from "../services/ecommerceService.js";

export const ecommerceController = {
  async dashboard(req, res) {
    try {
      res.json(await ecommerceService.dashboard(req.tenantId));
    } catch (error) {
      console.error("Ecommerce dashboard error:", error);
      res.status(500).json({ message: error.message || "Failed to load dashboard" });
    }
  },
};
