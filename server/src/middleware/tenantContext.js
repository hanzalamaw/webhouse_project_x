import { tenantContext } from "../utils/tenantContext.js";
import { auditContext } from "../utils/auditContext.js";
import { getRequestAuditMeta } from "../utils/clientIp.js";
import { getClientIp } from "../utils/whAudit.js";

/**
 * Establish tenant context from verified JWT (req.tenantId) — never from body/query/headers.
 * Fail closed for tenant-role requests without tenantId.
 */
export function establishTenantContext(req, res, next) {
  const meta = getRequestAuditMeta(req);
  const auditStore = {
    impersonatedBy: req.impersonatedBy ?? null,
    ip: meta.ipAddress ?? getClientIp(req),
    ipAddress: meta.ipAddress,
    deviceInfo: meta.deviceInfo,
    tenantId: req.tenantId ?? null,
    userId: req.userId ?? null,
  };

  const isTenantRole = req.userRole === "tenant";
  if (isTenantRole && !req.tenantId) {
    return res.status(403).json({ message: "Tenant context required" });
  }

  const store = {
    tenantId: req.tenantId ?? null,
    userId: req.userId ?? null,
    impersonatedBy: req.impersonatedBy ?? null,
    crossTenant: req.userRole === "wh_admin" && !req.tenantId,
  };

  return auditContext.run(auditStore, () => tenantContext.run(store, next));
}

/**
 * WH admin cross-tenant operations (explicit :tenantId in URL) — bypasses per-query tenant guard.
 */
export function allowCrossTenantContext(req, res, next) {
  const meta = getRequestAuditMeta(req);
  const store = {
    tenantId: req.params.tenantId ? Number(req.params.tenantId) : null,
    userId: req.userId ?? null,
    impersonatedBy: null,
    crossTenant: true,
  };

  return auditContext.run(
    { ipAddress: meta.ipAddress, deviceInfo: meta.deviceInfo, userId: req.userId },
    () => tenantContext.run(store, next)
  );
}

/**
 * WH platform admin — cross-tenant reads/writes allowed; guard skipped via crossTenant flag.
 * Must run after verifyToken + requireWhAdmin.
 */
export function establishWhAdminContext(req, res, next) {
  if (req.userRole !== "wh_admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const meta = getRequestAuditMeta(req);
  const store = {
    tenantId: req.params.tenantId ? Number(req.params.tenantId) : null,
    userId: req.userId ?? null,
    impersonatedBy: null,
    crossTenant: true,
  };
  return auditContext.run(
    {
      ipAddress: meta.ipAddress,
      deviceInfo: meta.deviceInfo,
      userId: req.userId,
      whAdmin: true,
    },
    () => tenantContext.run(store, next)
  );
}

/**
 * Background jobs / scripts — no tenant enforcement.
 */
export function systemContext(next) {
  return tenantContext.run(
    { tenantId: null, userId: null, impersonatedBy: null, crossTenant: true },
    next
  );
}
