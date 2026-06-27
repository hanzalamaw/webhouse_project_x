import { logWhAudit, getClientIp } from "../utils/whAudit.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Log tenant mutations to WebHouse audit logs while an admin is impersonating. */
export function impersonationAudit(req, res, next) {
  if (!req.impersonatedBy || !req.tenantId || !MUTATING.has(req.method)) {
    return next();
  }

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    logWhAudit({
      adminUserId: req.impersonatedBy,
      action: `impersonation:${req.method} ${req.path}`,
      newValue: {
        tenant_id: req.tenantId,
        user_id: req.userId,
        method: req.method,
        path: req.originalUrl,
        body: req.body,
      },
      ipAddress: getClientIp(req),
    }).catch(() => {});
  });

  next();
}
