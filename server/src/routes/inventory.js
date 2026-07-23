import { inventoryController } from "../controllers/inventoryController.js";
import { tenantRouteAuth } from "../middleware/tenantRouteAuth.js";
import { createTenantPermissionMiddleware } from "../middleware/tenantPermissions.js";
import { INVENTORY_MODULE } from "../utils/inventoryConstants.js";

export function registerInventoryRoutes(app, verifyToken) {
  const { loadPermissions, requirePermission } = createTenantPermissionMiddleware();
  const auth = [...tenantRouteAuth(verifyToken), loadPermissions];
  const base = "/api/inventory";

  const view = requirePermission(INVENTORY_MODULE, "view");
  const create = requirePermission(INVENTORY_MODULE, "create");
  const edit = requirePermission(INVENTORY_MODULE, "edit");
  const del = requirePermission(INVENTORY_MODULE, "delete");
  const exp = requirePermission(INVENTORY_MODULE, "export");

  app.get(`${base}/dashboard`, ...auth, view, inventoryController.dashboard);
  app.get(`${base}/reference`, ...auth, view, inventoryController.reference);

  app.get(`${base}/categories`, ...auth, view, inventoryController.listCategories);
  app.get(`${base}/categories/:id`, ...auth, view, inventoryController.getCategory);
  app.post(`${base}/categories`, ...auth, create, inventoryController.createCategory);
  app.put(`${base}/categories/:id`, ...auth, edit, inventoryController.updateCategory);
  app.delete(`${base}/categories/:id`, ...auth, del, inventoryController.removeCategory);

  app.get(`${base}/products`, ...auth, view, inventoryController.listProducts);
  app.get(`${base}/products/export`, ...auth, exp, inventoryController.exportProducts);
  app.post(`${base}/products/import`, ...auth, create, inventoryController.importProducts);
  app.get(`${base}/products/:id`, ...auth, view, inventoryController.getProduct);
  app.post(`${base}/products`, ...auth, create, inventoryController.createProduct);
  app.put(`${base}/products/:id`, ...auth, edit, inventoryController.updateProduct);
  app.delete(`${base}/products/:id`, ...auth, del, inventoryController.removeProduct);

  app.get(`${base}/warehouses`, ...auth, view, inventoryController.listWarehouses);
  app.get(`${base}/warehouses/:id`, ...auth, view, inventoryController.getWarehouse);
  app.post(`${base}/warehouses`, ...auth, create, inventoryController.createWarehouse);
  app.put(`${base}/warehouses/:id`, ...auth, edit, inventoryController.updateWarehouse);
  app.delete(`${base}/warehouses/:id`, ...auth, del, inventoryController.removeWarehouse);

  app.get(`${base}/stock-movements`, ...auth, view, inventoryController.listMovements);
  app.post(`${base}/stock-movements/stock-in`, ...auth, create, inventoryController.stockIn);
  app.post(`${base}/stock-movements/stock-in/bulk`, ...auth, create, inventoryController.bulkStockIn);
  app.post(`${base}/stock-movements/stock-out`, ...auth, create, inventoryController.stockOut);
  app.post(`${base}/stock-movements/stock-out/bulk`, ...auth, create, inventoryController.bulkStockOut);

  app.get(`${base}/stock-transfers`, ...auth, view, inventoryController.listTransfers);
  app.post(`${base}/stock-transfers`, ...auth, create, inventoryController.createTransfer);
  app.post(`${base}/stock-transfers/bulk`, ...auth, create, inventoryController.bulkCreateTransfer);
  app.post(`${base}/stock-transfers/:id/complete`, ...auth, edit, inventoryController.completeTransfer);
  app.post(`${base}/stock-transfers/:id/cancel`, ...auth, edit, inventoryController.cancelTransfer);
}
