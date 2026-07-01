import { orderController } from "../controllers/orderController.js";
import { tenantRouteAuth } from "../middleware/tenantRouteAuth.js";
import { createTenantPermissionMiddleware } from "../middleware/tenantPermissions.js";
import { ORDER_MODULE } from "../utils/orderConstants.js";

export function registerOrderRoutes(app, verifyToken) {
  const { loadPermissions, requirePermission } = createTenantPermissionMiddleware();
  const auth = [...tenantRouteAuth(verifyToken), loadPermissions];
  const base = "/api/orders";

  const view = requirePermission(ORDER_MODULE, "view");
  const create = requirePermission(ORDER_MODULE, "create");
  const edit = requirePermission(ORDER_MODULE, "edit");
  const del = requirePermission(ORDER_MODULE, "delete");
  const exp = requirePermission(ORDER_MODULE, "export");

  app.get(`${base}/dashboard`, ...auth, view, orderController.dashboard);
  app.get(`${base}/reference`, ...auth, view, orderController.reference);
  app.get(`${base}/warehouse-products`, ...auth, view, orderController.warehouseProducts);
  app.post(`${base}/field-options`, ...auth, create, orderController.addFieldOption);
  app.get(`${base}/export`, ...auth, exp, orderController.exportOrders);
  app.post(`${base}/import`, ...auth, create, orderController.importOrders);

  app.get(`${base}/assignments/list`, ...auth, view, orderController.listAssignments);
  app.post(`${base}/assignments`, ...auth, create, orderController.createAssignment);
  app.put(`${base}/assignments/:id`, ...auth, edit, orderController.updateAssignment);
  app.delete(`${base}/assignments/:id`, ...auth, del, orderController.deleteAssignment);

  app.get(`${base}/payments/summary`, ...auth, view, orderController.paymentSummary);
  app.get(`${base}/payments/transactions`, ...auth, view, orderController.listPaymentTransactions);
  app.get(`${base}/payments/order/:orderId`, ...auth, view, orderController.listPaymentsForOrder);
  app.get(`${base}/payments/list`, ...auth, view, orderController.listPayments);
  app.post(`${base}/payments`, ...auth, create, orderController.createPayment);
  app.put(`${base}/payments/:id`, ...auth, edit, orderController.updatePayment);
  app.delete(`${base}/payments/:id`, ...auth, del, orderController.deletePayment);

  app.get(`${base}/cancellations/list`, ...auth, view, orderController.listCancellations);
  app.post(`${base}/cancellations`, ...auth, create, orderController.createCancellation);

  app.get(`${base}/returns/list`, ...auth, view, orderController.listReturns);
  app.post(`${base}/returns`, ...auth, create, orderController.createReturn);
  app.put(`${base}/returns/:id`, ...auth, edit, orderController.updateReturn);

  app.get(`${base}/exchanges/list`, ...auth, view, orderController.listExchanges);
  app.post(`${base}/exchanges`, ...auth, create, orderController.createExchange);
  app.put(`${base}/exchanges/:id`, ...auth, edit, orderController.updateExchange);

  app.get(`${base}/refunds/list`, ...auth, view, orderController.listRefunds);
  app.post(`${base}/refunds`, ...auth, create, orderController.createRefund);
  app.put(`${base}/refunds/:id`, ...auth, edit, orderController.updateRefund);

  app.get(`${base}`, ...auth, view, orderController.listOrders);
  app.get(`${base}/:id`, ...auth, view, orderController.getOrder);
  app.post(`${base}`, ...auth, create, orderController.createOrder);
  app.put(`${base}/:id`, ...auth, edit, orderController.updateOrder);
  app.delete(`${base}/:id`, ...auth, del, orderController.deleteOrder);
}
