import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { createPool, closePool } from "./src/db/pool.js";
import { initDb } from "./src/database/db.js";
import { createVerifyToken } from "./src/middleware/auth.js";
import { registerAuthRoutes } from "./src/routes/auth.js";
import { registerDashboardRoutes } from "./src/routes/dashboard.js";
import { registerWhPortalRoutes } from "./src/routes/whPortal.js";
import { registerInventoryRoutes } from "./src/routes/inventory.js";
import { registerPosRoutes } from "./src/routes/pos.js";
import { registerCrmRoutes } from "./src/routes/crm.js";
import { registerTenantPortalRoutes } from "./src/routes/tenantPortal.js";
import { registerEcommerceRoutes } from "./src/routes/ecommerce.js";
import { registerOrderRoutes } from "./src/routes/orders.js";
import { registerFinanceRoutes } from "./src/routes/finance.js";
import { shopifyWebhookHandler } from "./src/routes/shopifyWebhooks.js";
import { purgeSoftDeleted } from "./src/jobs/purgeSoftDeleted.js";
import { runShopifyBackgroundSync } from "./src/jobs/shopifyBackgroundSync.js";

dotenv.config();

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "10mb";

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));

app.post(
  "/api/shopify/webhooks",
  express.raw({ type: "application/json" }),
  shopifyWebhookHandler,
);

app.use(cookieParser());
app.use(express.json({ limit: JSON_BODY_LIMIT }));

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SHOPIFY_POLL_INTERVAL_MS = Number(process.env.SHOPIFY_POLL_INTERVAL_MS) || 5 * 60 * 1000;

const startServer = async () => {
  const db = await createPool();
  await initDb(db);
  const connectMode = process.env.DB_CONNECT_MODE || (process.env.CLOUD_SQL_CONNECTION_NAME ? "cloud-sql" : "tcp");
  console.log(`Database pool ready (mode=${connectMode}, limit=${process.env.DB_POOL_SIZE || 5})`);

  const JWT_SECRET = process.env.JWT_SECRET || "webhouse_secret";
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
  const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "8h";
  const verifyToken = createVerifyToken(JWT_SECRET);

  registerAuthRoutes(app, db, { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, verifyToken });
  registerDashboardRoutes(app, db, verifyToken);
  registerWhPortalRoutes(app, verifyToken, {
    jwtSecret: JWT_SECRET,
    jwtExpiresIn: JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
  });
  registerInventoryRoutes(app, verifyToken);
  registerCrmRoutes(app, verifyToken);
  registerPosRoutes(app, verifyToken);
  registerTenantPortalRoutes(app, verifyToken);
  registerEcommerceRoutes(app, verifyToken);
  registerOrderRoutes(app, verifyToken);
  registerFinanceRoutes(app, verifyToken);

  app.get("/", (req, res) => {
    res.status(204).end();
  });

  const runPurge = async () => {
    try {
      const { total, tables, errors } = await purgeSoftDeleted();
      if (total > 0) {
        console.log(`Purged ${total} soft-deleted row(s) older than 7 days`, tables);
      }
      const errKeys = Object.keys(errors || {});
      if (errKeys.length) {
        console.warn("Purge completed with errors on some tables:", errors);
      }
    } catch (err) {
      console.error("Purge job failed:", err?.message || err);
      if (err?.stack) console.error(err.stack);
    }
  };

  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Run after server is listening so DB is fully ready
  server.on("listening", () => {
    setTimeout(runPurge, 5000);
    setInterval(runPurge, PURGE_INTERVAL_MS);
    // Pull Shopify changes into the ERP without opening the ecommerce module.
    setTimeout(() => runShopifyBackgroundSync().catch(() => {}), 15000);
    setInterval(() => runShopifyBackgroundSync().catch(() => {}), SHOPIFY_POLL_INTERVAL_MS);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received, closing server and database pool`);
    server.close();
    await closePool(db);
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

startServer().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
