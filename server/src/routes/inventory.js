import { inventoryController } from "../controllers/inventoryController.js";
import { requireTenant } from "../middleware/tenantAuth.js";

export function registerInventoryRoutes(app, verifyToken) {
  const auth = [verifyToken, requireTenant];
  const base = "/api/inventory";

  app.get(`${base}/dashboard`, auth, inventoryController.dashboard);
  app.get(`${base}/reference`, auth, inventoryController.reference);

  app.get(`${base}/categories`, auth, inventoryController.listCategories);
  app.get(`${base}/categories/:id`, auth, inventoryController.getCategory);
  app.post(`${base}/categories`, auth, inventoryController.createCategory);
  app.put(`${base}/categories/:id`, auth, inventoryController.updateCategory);
  app.delete(`${base}/categories/:id`, auth, inventoryController.removeCategory);

  app.get(`${base}/products`, auth, inventoryController.listProducts);
  app.get(`${base}/products/export`, auth, inventoryController.exportProducts);
  app.post(`${base}/products/import`, auth, inventoryController.importProducts);
  app.get(`${base}/products/:id`, auth, inventoryController.getProduct);
  app.post(`${base}/products`, auth, inventoryController.createProduct);
  app.put(`${base}/products/:id`, auth, inventoryController.updateProduct);
  app.delete(`${base}/products/:id`, auth, inventoryController.removeProduct);

  app.get(`${base}/warehouses`, auth, inventoryController.listWarehouses);
  app.get(`${base}/warehouses/:id`, auth, inventoryController.getWarehouse);
  app.post(`${base}/warehouses`, auth, inventoryController.createWarehouse);
  app.put(`${base}/warehouses/:id`, auth, inventoryController.updateWarehouse);
  app.delete(`${base}/warehouses/:id`, auth, inventoryController.removeWarehouse);

  app.get(`${base}/stock-movements`, auth, inventoryController.listMovements);
  app.post(`${base}/stock-movements/stock-in`, auth, inventoryController.stockIn);
  app.post(`${base}/stock-movements/stock-in/bulk`, auth, inventoryController.bulkStockIn);
  app.post(`${base}/stock-movements/stock-out`, auth, inventoryController.stockOut);
  app.post(`${base}/stock-movements/stock-out/bulk`, auth, inventoryController.bulkStockOut);

  app.get(`${base}/stock-transfers`, auth, inventoryController.listTransfers);
  app.post(`${base}/stock-transfers`, auth, inventoryController.createTransfer);
  app.post(`${base}/stock-transfers/bulk`, auth, inventoryController.bulkCreateTransfer);
  app.post(`${base}/stock-transfers/:id/complete`, auth, inventoryController.completeTransfer);
  app.post(`${base}/stock-transfers/:id/cancel`, auth, inventoryController.cancelTransfer);
}
