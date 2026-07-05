import { logService } from "../services/logService.js";
import { getClientIp } from "../utils/whAudit.js";

export const logController = {
  async listWh(req, res) {
    try {
      res.json(await logService.listWh(req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listTenant(req, res) {
    try {
      res.json(
        await logService.listTenant(req.query, req.userId, getClientIp(req))
      );
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};
