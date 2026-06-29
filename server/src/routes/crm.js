import { crmController } from "../controllers/crmController.js";
import { tenantRouteAuth } from "../middleware/tenantRouteAuth.js";
import { createTenantPermissionMiddleware } from "../middleware/tenantPermissions.js";
import { CRM_MODULE } from "../utils/crmConstants.js";

export function registerCrmRoutes(app, verifyToken) {
  const { loadPermissions, requirePermission } = createTenantPermissionMiddleware();
  const auth = [...tenantRouteAuth(verifyToken), loadPermissions];
  const base = "/api/crm";

  const view = requirePermission(CRM_MODULE, "view");
  const create = requirePermission(CRM_MODULE, "create");
  const edit = requirePermission(CRM_MODULE, "edit");
  const del = requirePermission(CRM_MODULE, "delete");
  const exp = requirePermission(CRM_MODULE, "export");

  app.get(`${base}/dashboard`, ...auth, view, crmController.dashboard);
  app.get(`${base}/reference`, ...auth, view, crmController.reference);

  app.get(`${base}/leads`, ...auth, view, crmController.listLeads);
  app.get(`${base}/leads/export`, ...auth, exp, crmController.exportLeads);
  app.get(`${base}/leads/:id`, ...auth, view, crmController.getLead);
  app.post(`${base}/leads`, ...auth, create, crmController.createLead);
  app.post(`${base}/leads/import`, ...auth, create, crmController.importLeads);
  app.put(`${base}/leads/:id`, ...auth, edit, crmController.updateLead);
  app.post(`${base}/leads/:id/convert`, ...auth, edit, crmController.convertLead);
  app.delete(`${base}/leads/:id`, ...auth, del, crmController.deleteLead);

  app.get(`${base}/customers/lookup`, ...auth, view, crmController.lookupCustomer);
  app.get(`${base}/customers`, ...auth, view, crmController.listCustomers);
  app.get(`${base}/customers/export`, ...auth, exp, crmController.exportCustomers);
  app.get(`${base}/customers/:id`, ...auth, view, crmController.getCustomer);
  app.post(`${base}/customers`, ...auth, create, crmController.createCustomer);
  app.post(`${base}/customers/import`, ...auth, create, crmController.importCustomers);
  app.put(`${base}/customers/:id`, ...auth, edit, crmController.updateCustomer);
  app.delete(`${base}/customers/:id`, ...auth, del, crmController.deleteCustomer);

  app.post(`${base}/customers/:customerId/addresses`, ...auth, edit, crmController.createAddress);
  app.put(`${base}/customers/:customerId/addresses/:addressId`, ...auth, edit, crmController.updateAddress);
  app.delete(`${base}/customers/:customerId/addresses/:addressId`, ...auth, del, crmController.deleteAddress);

  app.post(`${base}/customers/:customerId/notes`, ...auth, create, crmController.createNote);

  app.get(`${base}/complaints`, ...auth, view, crmController.listComplaints);
  app.get(`${base}/complaints/:id`, ...auth, view, crmController.getComplaint);
  app.post(`${base}/complaints`, ...auth, create, crmController.createComplaint);
  app.put(`${base}/complaints/:id`, ...auth, edit, crmController.updateComplaint);
  app.delete(`${base}/complaints/:id`, ...auth, del, crmController.deleteComplaint);
}
