import { tenantPortalController, createTenantPortalMiddleware } from "../controllers/tenantPortalController.js";

import { sessionRepository } from "../repositories/sessionRepository.js";

import { createTenantPermissionMiddleware, ADMIN_MODULE } from "../middleware/tenantPermissions.js";



async function assertTenantSessionActive(sessionId) {

  if (!sessionId) return false;

  return sessionRepository.isActive(sessionId);

}



export function registerTenantPortalRoutes(app, verifyToken) {

  const { requireTenant, requireSession } = createTenantPortalMiddleware({ assertTenantSessionActive });

  const { loadPermissions, requirePermission } = createTenantPermissionMiddleware();

  const guard = [verifyToken, requireTenant, requireSession, loadPermissions];

  const view = requirePermission(ADMIN_MODULE, "view");

  const create = requirePermission(ADMIN_MODULE, "create");

  const edit = requirePermission(ADMIN_MODULE, "edit");

  const del = requirePermission(ADMIN_MODULE, "delete");



  app.get("/api/tenant/organization-settings", ...guard, view, tenantPortalController.organizationGet);

  app.put("/api/tenant/organization-settings", ...guard, edit, tenantPortalController.organizationPut);



  app.get("/api/tenant/users", ...guard, view, tenantPortalController.usersList);

  app.post("/api/tenant/users", ...guard, create, tenantPortalController.usersCreate);

  app.put("/api/tenant/users/:id", ...guard, edit, tenantPortalController.usersUpdate);



  app.get("/api/tenant/roles", ...guard, view, tenantPortalController.rolesList);

  app.get("/api/tenant/roles/:id", ...guard, view, tenantPortalController.rolesGet);

  app.post("/api/tenant/roles", ...guard, create, tenantPortalController.rolesCreate);

  app.put("/api/tenant/roles/:id", ...guard, edit, tenantPortalController.rolesUpdate);



  app.get("/api/tenant/sessions", ...guard, view, tenantPortalController.sessionsList);

  app.post("/api/tenant/sessions/:id/terminate", ...guard, edit, tenantPortalController.sessionsTerminate);



  app.get("/api/tenant/audit-logs", ...guard, view, tenantPortalController.auditLogs);

  app.get("/api/tenant/activity-alerts", ...guard, view, tenantPortalController.alertsList);

  app.patch("/api/tenant/activity-alerts/:id/read", ...guard, edit, tenantPortalController.alertsMarkRead);



  app.get("/api/tenant/subscription-billing", ...guard, view, tenantPortalController.subscriptionBilling);

  app.get("/api/tenant/dashboard", ...guard, view, tenantPortalController.dashboard);

}



export { assertTenantSessionActive };

