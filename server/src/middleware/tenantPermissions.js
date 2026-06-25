import { tenantPermissionService } from "../services/tenantPermissionService.js";

export const ADMIN_MODULE = "Admin";

export function createTenantPermissionMiddleware() {
  const loadPermissions = async (req, res, next) => {
    if (req.userRole !== "tenant") return next();
    try {
      req.tenantPermCtx = await tenantPermissionService.resolveForUser(req.tenantId, req.userId, {
        impersonating: Boolean(req.impersonatedBy),
      });
      next();
    } catch (e) {
      res.status(500).json({ message: e.message || "Failed to resolve permissions" });
    }
  };

  const requirePermission = (moduleName, action) => (req, res, next) => {
    if (req.userRole !== "tenant") return next();
    if (tenantPermissionService.canAccess(req.tenantPermCtx, moduleName, action)) return next();
    return res.status(403).json({ message: "Insufficient permissions" });
  };

  return { loadPermissions, requirePermission };
}
