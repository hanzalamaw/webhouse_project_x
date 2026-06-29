import { logWhAudit, getClientIp } from "../utils/whAudit.js";
import { auditContext } from "../utils/auditContext.js";
import { describeImpersonationApiAction } from "../utils/describeAuditAction.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SERVICE_AUDITED_PREFIXES = ["/api/tenant/", "/api/crm/"];

/** Attach impersonation context and log WH audit for modules without dedicated audit writers. */
export function impersonationAudit(req, res, next) {
  const store = {
    impersonatedBy: req.impersonatedBy ?? null,
    ip: getClientIp(req),
    tenantId: req.tenantId ?? null,
    userId: req.userId ?? null,
  };

  return auditContext.run(store, () => {
    if (!req.impersonatedBy || !req.tenantId || !MUTATING.has(req.method)) {
      return next();
    }

    const skipGenericLog = SERVICE_AUDITED_PREFIXES.some((prefix) => req.path.startsWith(prefix));

    if (!skipGenericLog) {
      res.on("finish", () => {
        if (res.statusCode < 200 || res.statusCode >= 400) return;
        logWhAudit({
          adminUserId: req.impersonatedBy,
          action: describeImpersonationApiAction(req.method, req.path),
          newValue: {
            tenant_id: req.tenantId,
            user_id: req.userId,
            summary: describeImpersonationApiAction(req.method, req.path),
          },
          ipAddress: store.ip,
        }).catch(() => {});
      });
    }

    return next();
  });
}
