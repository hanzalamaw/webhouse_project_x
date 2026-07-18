import { logWhAudit, getClientIp } from "../utils/whAudit.js";
import { getRequestAuditMeta } from "../utils/clientIp.js";
import { auditContext } from "../utils/auditContext.js";
import { describeImpersonationApiAction } from "../utils/describeAuditAction.js";
import { sanitizeAuditRow } from "../utils/auditRowSnapshot.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Paths that already write dedicated tenant/WH audits via services or moduleWriteAudit. */
const SERVICE_AUDITED_PREFIXES = [
  "/api/tenant/",
  "/api/crm/",
  "/api/inventory/",
  "/api/finance/",
  "/api/pos/",
  "/api/orders/",
];

const BODY_OMIT = new Set([
  "password",
  "password_hash",
  "access_token",
  "refresh_token",
  "token",
  "api_secret",
  "api_key",
]);

function sanitizeRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const cleaned = {};
  for (const [key, value] of Object.entries(body)) {
    if (BODY_OMIT.has(key)) continue;
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = sanitizeAuditRow(value);
    } else {
      cleaned[key] = value;
    }
  }
  return Object.keys(cleaned).length ? cleaned : null;
}

/** Attach impersonation context and log WH audit for modules without dedicated audit writers. */
export function impersonationAudit(req, res, next) {
  const meta = getRequestAuditMeta(req);
  const store = {
    impersonatedBy: req.impersonatedBy ?? null,
    ip: meta.ipAddress ?? getClientIp(req),
    ipAddress: meta.ipAddress,
    deviceInfo: meta.deviceInfo,
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
        const summary = describeImpersonationApiAction(req.method, req.path);
        const body = sanitizeRequestBody(req.body);
        logWhAudit({
          adminUserId: req.impersonatedBy,
          action: summary,
          oldValue: req.method === "DELETE" && body ? { tenant_id: req.tenantId, ...body } : { tenant_id: req.tenantId, user_id: req.userId },
          newValue: {
            tenant_id: req.tenantId,
            user_id: req.userId,
            summary,
            ...(req.method !== "DELETE" && body ? body : {}),
          },
          ipAddress: store.ip,
        }).catch(() => {});
      });
    }

    return next();
  });
}
