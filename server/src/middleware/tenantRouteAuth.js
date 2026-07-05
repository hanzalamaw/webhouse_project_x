import { requireTenant } from "./tenantAuth.js";
import { impersonationAudit } from "./impersonationAudit.js";
import { establishTenantContext } from "./tenantContext.js";
import { stripTenantIdFromRequest } from "./stripTenantInput.js";

export function tenantRouteAuth(verifyToken) {
  return [verifyToken, establishTenantContext, requireTenant, stripTenantIdFromRequest, impersonationAudit];
}
