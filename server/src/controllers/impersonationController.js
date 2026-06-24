import { tryParseEntityId } from "../utils/ids.js";
import { getClientIp } from "../utils/whAudit.js";

export function createImpersonationController(impersonationService) {
  return {
    async start(req, res) {
      try {
        const tenantId = tryParseEntityId(req.body.tenant_id);
        if (!tenantId) return res.status(400).json({ message: "Valid tenant_id is required" });
        const ip = getClientIp(req);
        const deviceInfo = req.headers["user-agent"] || null;
        const result = await impersonationService.start(tenantId, req.userId, ip, deviceInfo);
        res.json(result);
      } catch (e) {
        res.status(400).json({ message: e.message });
      }
    },
  };
}
