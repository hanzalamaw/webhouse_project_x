import { tenantRouteAuth } from "../middleware/tenantRouteAuth.js";
import { createTenantPermissionMiddleware } from "../middleware/tenantPermissions.js";
import { shopifyRouter, createShopifyInstallHandler } from "./shopify.js";
import { darazRouter, createDarazInstallHandler } from "./daraz.js";
import { ecommerceController } from "../controllers/ecommerceController.js";
import { ECOMMERCE_MODULE } from "../utils/ecommerceConstants.js";

function runStack(stack) {
  return (req, res, next) => {
    let i = 0;
    const dispatch = (err) => {
      if (err) return next(err);
      const mw = stack[i++];
      if (!mw) return next();
      try {
        mw(req, res, dispatch);
      } catch (e) {
        next(e);
      }
    };
    dispatch();
  };
}

export function registerEcommerceRoutes(app, verifyToken) {
  const { loadPermissions, requirePermission } = createTenantPermissionMiddleware();
  const auth = [...tenantRouteAuth(verifyToken), loadPermissions];
  const view = requirePermission(ECOMMERCE_MODULE, "view");
  const edit = requirePermission(ECOMMERCE_MODULE, "edit");

  app.get("/api/ecommerce/dashboard", ...auth, view, ecommerceController.dashboard);
  app.get("/api/ecommerce/sync/link", ...auth, view, ecommerceController.syncLink);

  app.get("/api/shopify/oauth/install", ...auth, edit, createShopifyInstallHandler());
  app.get("/api/daraz/oauth/install", ...auth, edit, createDarazInstallHandler());

  const publicPaths = ["/oauth/status", "/oauth/callback"];

  const protectChannel = (req, res, next) => {
    if (publicPaths.some((p) => req.path === p || req.path.startsWith(p))) {
      return next();
    }
    const action = req.method === "GET" || req.method === "HEAD" ? "view" : "edit";
    return runStack([...auth, requirePermission(ECOMMERCE_MODULE, action)])(req, res, next);
  };

  app.use("/api/shopify", protectChannel, shopifyRouter);
  app.use("/api/daraz", protectChannel, darazRouter);
}
