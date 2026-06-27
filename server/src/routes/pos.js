import { posController } from "../controllers/posController.js";
import { requireTenant } from "../middleware/tenantAuth.js";
import { createTenantPermissionMiddleware } from "../middleware/tenantPermissions.js";
import { POS_MODULE, POS_TERMINAL_MODULE } from "../utils/posConstants.js";

export function registerPosRoutes(app, verifyToken) {
  const { loadPermissions, requirePermission } = createTenantPermissionMiddleware();
  const auth = [verifyToken, requireTenant, loadPermissions];
  const base = "/api/pos";

  const view = requirePermission(POS_MODULE, "view");
  const create = requirePermission(POS_MODULE, "create");
  const edit = requirePermission(POS_MODULE, "edit");
  const del = requirePermission(POS_MODULE, "delete");

  const terminalView = requirePermission(POS_TERMINAL_MODULE, "view");
  const terminalCreate = requirePermission(POS_TERMINAL_MODULE, "create");

  app.get(`${base}/dashboard`, ...auth, view, posController.dashboard);
  app.get(`${base}/reference`, ...auth, view, posController.reference);

  app.get(`${base}/outlets`, ...auth, view, posController.listOutlets);
  app.post(`${base}/outlets`, ...auth, create, posController.createOutlet);
  app.put(`${base}/outlets/:id`, ...auth, edit, posController.updateOutlet);
  app.delete(`${base}/outlets/:id`, ...auth, del, posController.deleteOutlet);

  app.get(`${base}/terminals`, ...auth, view, posController.listTerminals);
  app.post(`${base}/terminals`, ...auth, create, posController.createTerminal);
  app.put(`${base}/terminals/:id`, ...auth, edit, posController.updateTerminal);
  app.delete(`${base}/terminals/:id`, ...auth, del, posController.deleteTerminal);

  app.get(`${base}/sales`, ...auth, view, posController.listSales);
  app.get(`${base}/sales/:id`, ...auth, view, posController.getSale);

  app.get(`${base}/registers`, ...auth, view, posController.listRegisters);

  app.post(`${base}/terminal/connect`, ...auth, terminalView, posController.connectTerminal);
  app.get(`${base}/terminal/:terminalId/session`, ...auth, terminalView, posController.getTerminalSession);
  app.post(`${base}/terminal/:terminalId/shift-off`, ...auth, terminalView, posController.closeShift);
  app.post(`${base}/terminal/sales`, ...auth, terminalCreate, posController.createTerminalSale);
}
