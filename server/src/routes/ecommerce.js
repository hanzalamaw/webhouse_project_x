import { requireTenant } from "../middleware/tenantAuth.js";
import { shopifyRouter, createShopifyInstallHandler } from "./shopify.js";
import { darazRouter, createDarazInstallHandler } from "./daraz.js";
import { ecommerceController } from "../controllers/ecommerceController.js";

export function registerEcommerceRoutes(app, verifyToken) {
  const auth = [verifyToken, requireTenant];

  app.get("/api/ecommerce/dashboard", auth, ecommerceController.dashboard);

  app.get("/api/shopify/oauth/install", auth, createShopifyInstallHandler());
  app.get("/api/daraz/oauth/install", auth, createDarazInstallHandler());

  app.use("/api/shopify", (req, res, next) => {
    const publicPaths = ["/oauth/status", "/oauth/callback"];
    if (publicPaths.some((p) => req.path === p || req.path.startsWith(p))) {
      return next();
    }
    return verifyToken(req, res, () => requireTenant(req, res, next));
  }, shopifyRouter);

  app.use("/api/daraz", (req, res, next) => {
    const publicPaths = ["/oauth/status", "/oauth/callback"];
    if (publicPaths.some((p) => req.path === p || req.path.startsWith(p))) {
      return next();
    }
    return verifyToken(req, res, () => requireTenant(req, res, next));
  }, darazRouter);
}
