import { moduleController } from "../controllers/moduleController.js";
import { subscriptionController } from "../controllers/subscriptionController.js";
import { logController } from "../controllers/logController.js";
import { sessionController } from "../controllers/sessionController.js";
import { tenantController } from "../controllers/tenantController.js";
import { transactionController } from "../controllers/transactionController.js";
import { supportTicketController } from "../controllers/supportTicketController.js";
import { createImpersonationService } from "../services/impersonationService.js";
import { createImpersonationController } from "../controllers/impersonationController.js";

export function requireWhAdmin(req, res, next) {
  if (req.userRole !== "wh_admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

export function registerWhPortalRoutes(app, verifyToken, jwtConfig = {}) {
  const auth = [verifyToken, requireWhAdmin];
  const impersonationService = createImpersonationService({
    jwtSecret: jwtConfig.jwtSecret,
    jwtExpiresIn: jwtConfig.jwtExpiresIn,
    jwtRefreshExpiresIn: jwtConfig.jwtRefreshExpiresIn,
  });
  const impersonationController = createImpersonationController(impersonationService);

  app.get("/api/modules", auth, moduleController.list);
  app.get("/api/modules/all", auth, moduleController.listAll);
  app.get("/api/modules/:id", auth, moduleController.get);
  app.post("/api/modules", auth, moduleController.create);
  app.put("/api/modules/:id", auth, moduleController.update);
  app.delete("/api/modules/:id", auth, moduleController.remove);

  app.get("/api/subscriptions", auth, subscriptionController.list);
  app.get("/api/subscriptions/:id", auth, subscriptionController.get);
  app.get("/api/subscriptions/:id/modules", auth, subscriptionController.getModules);
  app.post("/api/subscriptions", auth, subscriptionController.create);
  app.put("/api/subscriptions/:id", auth, subscriptionController.update);
  app.delete("/api/subscriptions/:id", auth, subscriptionController.remove);

  app.get("/api/logs/wh", auth, logController.listWh);
  app.get("/api/logs/tenant", auth, logController.listTenant);

  app.get("/api/sessions", auth, sessionController.list);
  app.post("/api/sessions/:id/terminate", auth, sessionController.terminate);

  app.get("/api/tenants", auth, tenantController.list);
  app.get("/api/tenants/:id", auth, tenantController.get);
  app.post("/api/tenants", auth, tenantController.create);
  app.put("/api/tenants/:id", auth, tenantController.update);
  app.put("/api/tenants/:id/full", auth, tenantController.updateFull);
  app.get("/api/tenants/:id/credentials", auth, tenantController.getCredentials);
  app.delete("/api/tenants/:id", auth, tenantController.remove);

  app.get("/api/transactions/summary", auth, transactionController.summary);
  app.get("/api/transactions/tenants", auth, transactionController.listTenants);
  app.get("/api/transactions/payments", auth, transactionController.listPayments);
  app.get("/api/transactions/tenant/:tenantId/payments", auth, transactionController.listPaymentsByTenant);
  app.post("/api/transactions/tenant/:tenantId/payments", auth, transactionController.createPayment);
  app.put("/api/transactions/payments/:id", auth, transactionController.updatePayment);
  app.delete("/api/transactions/payments/:id", auth, transactionController.deletePayment);

  app.get("/api/support-tickets", auth, supportTicketController.list);
  app.get("/api/support-tickets/:id", auth, supportTicketController.get);
  app.post("/api/support-tickets", auth, supportTicketController.create);
  app.put("/api/support-tickets/:id", auth, supportTicketController.update);
  app.delete("/api/support-tickets/:id", auth, supportTicketController.remove);

  app.post("/api/impersonate", auth, impersonationController.start);
}
