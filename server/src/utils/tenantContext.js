import { AsyncLocalStorage } from "node:async_hooks";

/** @typedef {{ tenantId: number, userId: number | null, impersonatedBy: number | null, crossTenant: boolean }} TenantContextStore */

export const tenantContext = new AsyncLocalStorage();

/**
 * Returns the active tenant context set by auth middleware.
 * @returns {TenantContextStore | null}
 */
export function getTenantContext() {
  return tenantContext.getStore() ?? null;
}

/**
 * Tenant id from verified JWT/session context only — never from request input.
 * @returns {number | null}
 */
export function getTenantId() {
  return getTenantContext()?.tenantId ?? null;
}

/**
 * Fail closed when tenant context is required but missing.
 * @returns {number}
 */
export function requireTenantId() {
  const tenantId = getTenantId();
  if (!tenantId) {
    throw new Error("Tenant context required");
  }
  return tenantId;
}

/**
 * Resolve tenant id: prefer explicit arg (from req.tenantId) but verify it matches context when enforced.
 * @param {number | string | null | undefined} tenantId
 * @param {{ allowMismatch?: boolean }} [opts]
 * @returns {number}
 */
export function resolveTenantId(tenantId, opts = {}) {
  const ctx = getTenantContext();
  const parsed = tenantId != null ? Number(tenantId) : null;

  if (ctx && !ctx.crossTenant) {
    if (!ctx.tenantId) {
      throw new Error("Tenant context required");
    }
    if (parsed != null && parsed !== ctx.tenantId && !opts.allowMismatch) {
      throw new Error("Tenant id mismatch with authenticated context");
    }
    return ctx.tenantId;
  }

  if (!parsed) {
    throw new Error("Tenant context required");
  }
  return parsed;
}
