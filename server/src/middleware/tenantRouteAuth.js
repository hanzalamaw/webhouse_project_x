import { requireTenant } from "./tenantAuth.js";
import { impersonationAudit } from "./impersonationAudit.js";

export function tenantRouteAuth(verifyToken) {
  return [verifyToken, requireTenant, impersonationAudit];
}
