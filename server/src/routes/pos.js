import { posController } from "../controllers/posController.js";
import { posInventoryController } from "../controllers/posInventoryController.js";
import { tenantRouteAuth } from "../middleware/tenantRouteAuth.js";
import { createTenantPermissionMiddleware } from "../middleware/tenantPermissions.js";
import { tenantPermissionService } from "../services/tenantPermissionService.js";
import { POS_MODULE, POS_TERMINAL_MODULE } from "../utils/posConstants.js";

export function registerPosRoutes(app, verifyToken) {
  const { loadPermissions, requirePermission } = createTenantPermissionMiddleware();
  const auth = [...tenantRouteAuth(verifyToken), loadPermissions];
  const base = "/api/pos";
  const inv = `${base}/inventory`;

  const view = requirePermission(POS_MODULE, "view");
  const create = requirePermission(POS_MODULE, "create");
  const edit = requirePermission(POS_MODULE, "edit");
  const del = requirePermission(POS_MODULE, "delete");

  const terminalView = requirePermission(POS_TERMINAL_MODULE, "view");
  const terminalCreate = requirePermission(POS_TERMINAL_MODULE, "create");
  const posOrTerminalView = (req, res, next) => {
    if (req.userRole !== "tenant") return next();
    const ctx = req.tenantPermCtx;
    if (tenantPermissionService.canAccess(ctx, POS_TERMINAL_MODULE, "view")) return next();
    if (tenantPermissionService.canAccess(ctx, POS_MODULE, "view")) return next();
    return res.status(403).json({ message: "Insufficient permissions" });
  };

  app.get(`${base}/dashboard`, ...auth, view, posController.dashboard);
  app.get(`${base}/reference`, ...auth, view, posController.reference);

  app.get(`${base}/outlets`, ...auth, view, posController.listOutlets);
  app.get(`${base}/outlets/:id/dashboard`, ...auth, view, posController.outletDashboard);
  app.post(`${base}/outlets`, ...auth, create, posController.createOutlet);
  app.put(`${base}/outlets/:id`, ...auth, edit, posController.updateOutlet);
  app.delete(`${base}/outlets/:id`, ...auth, del, posController.deleteOutlet);

  app.get(`${base}/terminals`, ...auth, view, posController.listTerminals);
  app.get(`${base}/terminals/:id/logs`, ...auth, view, posController.getTerminalLogs);
  app.post(`${base}/terminals`, ...auth, create, posController.createTerminal);
  app.put(`${base}/terminals/:id`, ...auth, edit, posController.updateTerminal);
  app.delete(`${base}/terminals/:id`, ...auth, del, posController.deleteTerminal);

  app.get(`${base}/sales`, ...auth, view, posController.listSales);
  app.get(`${base}/sales/:id`, ...auth, view, posController.getSale);

  app.get(`${base}/registers`, ...auth, view, posController.listRegisters);
  app.get(`${base}/registers/terminals`, ...auth, view, posController.listTerminalBalances);

  app.get(`${inv}/reference`, ...auth, view, posInventoryController.reference);
  app.get(`${inv}/categories`, ...auth, view, posInventoryController.listCategories);
  app.get(`${inv}/categories/:id`, ...auth, view, posInventoryController.getCategory);
  app.post(`${inv}/categories`, ...auth, create, posInventoryController.createCategory);
  app.put(`${inv}/categories/:id`, ...auth, edit, posInventoryController.updateCategory);
  app.delete(`${inv}/categories/:id`, ...auth, del, posInventoryController.removeCategory);

  app.get(`${inv}/products`, ...auth, view, posInventoryController.listProducts);
  app.get(`${inv}/products/export`, ...auth, view, posInventoryController.exportProducts);
  app.post(`${inv}/products/import`, ...auth, create, posInventoryController.importProducts);
  app.get(`${inv}/products/:id`, ...auth, view, posInventoryController.getProduct);
  app.post(`${inv}/products`, ...auth, create, posInventoryController.createProduct);
  app.put(`${inv}/products/:id`, ...auth, edit, posInventoryController.updateProduct);
  app.delete(`${inv}/products/:id`, ...auth, del, posInventoryController.removeProduct);

  app.get(`${inv}/stock-movements`, ...auth, view, posInventoryController.listMovements);
  app.post(`${inv}/stock-movements/stock-in`, ...auth, create, posInventoryController.stockIn);
  app.post(`${inv}/stock-movements/stock-in/bulk`, ...auth, create, posInventoryController.bulkStockIn);
  app.post(`${inv}/stock-movements/stock-out`, ...auth, create, posInventoryController.stockOut);
  app.post(`${inv}/stock-movements/stock-out/bulk`, ...auth, create, posInventoryController.bulkStockOut);

  app.get(`${inv}/stock-transfers`, ...auth, view, posInventoryController.listTransfers);
  app.post(`${inv}/stock-transfers`, ...auth, create, posInventoryController.createTransfer);
  app.post(`${inv}/stock-transfers/bulk`, ...auth, create, posInventoryController.bulkCreateTransfer);
  app.post(`${inv}/stock-transfers/:id/complete`, ...auth, edit, posInventoryController.completeTransfer);
  app.post(`${inv}/stock-transfers/:id/cancel`, ...auth, edit, posInventoryController.cancelTransfer);

  app.post(`${base}/terminal/connect`, ...auth, terminalView, posController.connectTerminal);
  app.get(`${base}/terminal/lookup`, ...auth, posOrTerminalView, posController.lookupTerminal);
  app.get(`${base}/terminal/:terminalId/session`, ...auth, terminalView, posController.getTerminalSession);
  app.get(`${base}/terminal/:terminalId/products`, ...auth, terminalView, posController.getTerminalProducts);
  app.post(`${base}/terminal/:terminalId/shift-off`, ...auth, terminalView, posController.closeShift);
  app.post(`${base}/terminal/sales`, ...auth, terminalCreate, posController.createTerminalSale);
  app.get(`${base}/terminal/customers/lookup`, ...auth, terminalView, posController.lookupCustomer);
  app.post(`${base}/terminal/customers`, ...auth, terminalCreate, posController.createTerminalCustomer);
}
