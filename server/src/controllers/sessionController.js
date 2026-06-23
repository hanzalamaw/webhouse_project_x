import { sessionService } from "../services/sessionService.js";
import { getClientIp } from "../utils/whAudit.js";

function auditCtx(req) {
  return { adminUserId: req.userId, ip: getClientIp(req) };
}

export const sessionController = {
  async list(req, res) {
    try {
      res.json(await sessionService.list(req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async terminate(req, res) {
    try {
      const ok = await sessionService.terminate(req.params.id, auditCtx(req));
      if (!ok) return res.status(404).json({ message: "Session not found or already terminated" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};
