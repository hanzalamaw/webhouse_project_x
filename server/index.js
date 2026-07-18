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
import { processPendingShopifyDeletes } from "./src/jobs/processPendingShopifyDeletes.js";
import { PURGE_AFTER_DAYS } from "./src/utils/softDeletePolicy.js";
import { SHOPIFY_PENDING_DELETE_DAYS } from "./src/utils/shopifyDeferredDelete.js";

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

const SHOPIFY_POLL_INTERVAL_MS = Number(process.env.SHOPIFY_POLL_INTERVAL_MS) || 5 * 60 * 1000;

/** ms until next local midnight (start of day). */
function msUntilNextLocalMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** Run retention once per day at local midnight — no short poll loop. */
function scheduleDailyRetention(run) {
  const arm = () => {
    const delay = msUntilNextLocalMidnight();
    const when = new Date(Date.now() + delay).toLocaleString();
    console.log(`[retention] next daily purge at ${when} (ERP ${PURGE_AFTER_DAYS}d / Shopify ${SHOPIFY_PENDING_DELETE_DAYS}d)`);
    setTimeout(async () => {
      try {
        await run();
      } catch (err) {
        console.error("[retention] daily job failed:", err?.message || err);
      }
      arm();
    }, delay);
  };
  arm();
}

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

  const runDailyRetention = async () => {
    console.log("[retention] starting daily delete purge…");
    try {
      const { total, tables, errors } = await purgeSoftDeleted();
      if (total > 0) {
        console.log(`Purged ${total} soft-deleted ERP row(s) older than ${PURGE_AFTER_DAYS} days`, tables);
      }
      const errKeys = Object.keys(errors || {});
      if (errKeys.length) {
        console.warn("ERP purge completed with errors on some tables:", errors);
      }
    } catch (err) {
      console.error("ERP soft-delete purge failed:", err?.message || err);
      if (err?.stack) console.error(err.stack);
    }

    try {
      const result = await processPendingShopifyDeletes();
      if (result.processed > 0) {
        console.log(
          `[shopify-deferred-delete] processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed}`,
        );
      }
    } catch (err) {
      console.error("[shopify-deferred-delete] failed:", err?.message || err);
    }
  };

  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Run after server is listening so DB is fully ready
  server.on("listening", () => {
    // Catch up any rows already past delete_after / deleted_at (e.g. server was
    // down at midnight, or dates were backdated). Then arm for next local midnight.
    setTimeout(() => {
      runDailyRetention().catch((err) => {
        console.error("[retention] startup catch-up failed:", err?.message || err);
      });
    }, 5000);
    scheduleDailyRetention(runDailyRetention);
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
