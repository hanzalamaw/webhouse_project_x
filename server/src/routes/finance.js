import { financeController } from "../controllers/financeController.js";
import { tenantRouteAuth } from "../middleware/tenantRouteAuth.js";
import { createTenantPermissionMiddleware } from "../middleware/tenantPermissions.js";
import { FINANCE_MODULE } from "../utils/financeConstants.js";

export function registerFinanceRoutes(app, verifyToken) {
  const { loadPermissions, requirePermission } = createTenantPermissionMiddleware();
  const auth = [...tenantRouteAuth(verifyToken), loadPermissions];
  const base = "/api/finance";

  const view = requirePermission(FINANCE_MODULE, "view");
  const create = requirePermission(FINANCE_MODULE, "create");
  const edit = requirePermission(FINANCE_MODULE, "edit");
  const del = requirePermission(FINANCE_MODULE, "delete");

  app.get(`${base}/dashboard`, ...auth, view, financeController.dashboard);

  app.get(`${base}/customer-payments`, ...auth, view, financeController.listCustomerPayments);
  app.get(`${base}/customer-payments/:id`, ...auth, view, financeController.getCustomerPayment);

  app.get(`${base}/vendor-bills`, ...auth, view, financeController.listVendorBills);
  app.get(`${base}/vendor-bills/:id`, ...auth, view, financeController.getVendorBill);
  app.post(`${base}/vendor-bills`, ...auth, create, financeController.createVendorBill);
  app.put(`${base}/vendor-bills/:id`, ...auth, edit, financeController.updateVendorBill);
  app.delete(`${base}/vendor-bills/:id`, ...auth, del, financeController.deleteVendorBill);
  app.get(`${base}/vendor-bills/:billId/payments`, ...auth, view, financeController.listVendorPayments);
  app.post(`${base}/vendor-bills/:billId/payments`, ...auth, create, financeController.addVendorPayment);

  app.get(`${base}/expenses/reference`, ...auth, view, financeController.expenseReference);
  app.post(`${base}/expense-categories`, ...auth, create, financeController.createExpenseCategory);
  app.post(`${base}/expense-categories/:categoryId/sub-categories`, ...auth, create, financeController.createExpenseSubCategory);
  app.get(`${base}/expenses`, ...auth, view, financeController.listExpenses);
  app.get(`${base}/expenses/:id`, ...auth, view, financeController.getExpense);
  app.post(`${base}/expenses`, ...auth, create, financeController.createExpense);
  app.put(`${base}/expenses/:id`, ...auth, edit, financeController.updateExpense);
  app.delete(`${base}/expenses/:id`, ...auth, del, financeController.deleteExpense);

  app.get(`${base}/recurring-expenses`, ...auth, view, financeController.listRecurringExpenses);
  app.get(`${base}/recurring-expenses/:id`, ...auth, view, financeController.getRecurringExpense);
  app.post(`${base}/recurring-expenses`, ...auth, create, financeController.createRecurringExpense);
  app.put(`${base}/recurring-expenses/:id`, ...auth, edit, financeController.updateRecurringExpense);
  app.delete(`${base}/recurring-expenses/:id`, ...auth, del, financeController.deleteRecurringExpense);

  app.get(`${base}/bank-accounts`, ...auth, view, financeController.listBankAccounts);
  app.get(`${base}/bank-accounts/:id`, ...auth, view, financeController.getBankAccount);
  app.post(`${base}/bank-accounts`, ...auth, create, financeController.createBankAccount);
  app.put(`${base}/bank-accounts/:id`, ...auth, edit, financeController.updateBankAccount);
  app.delete(`${base}/bank-accounts/:id`, ...auth, del, financeController.deleteBankAccount);

  app.get(`${base}/transactions`, ...auth, view, financeController.listTransactions);
  app.get(`${base}/transactions/:id`, ...auth, view, financeController.getTransaction);
}
