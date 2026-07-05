import { stripTenantIdFromBody } from "../utils/tenantScope.js";

/** Remove tenant_id from request body/query so clients cannot override JWT tenant context. */
export function stripTenantIdFromRequest(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = stripTenantIdFromBody(req.body);
  }
  if (req.query?.tenant_id != null) {
    delete req.query.tenant_id;
  }
  if (req.query?.tenantId != null) {
    delete req.query.tenantId;
  }
  next();
}
