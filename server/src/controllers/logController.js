import { logService } from "../services/logService.js";

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
      res.json(await logService.listTenant(req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};
