import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createPool, closePool } from "./src/db/pool.js";
import { initDb } from "./src/database/db.js";
import { createVerifyToken } from "./src/middleware/auth.js";
import { registerAuthRoutes } from "./src/routes/auth.js";
import { registerDashboardRoutes } from "./src/routes/dashboard.js";
import { registerWhPortalRoutes } from "./src/routes/whPortal.js";
import { purgeSoftDeleted } from "./src/jobs/purgeSoftDeleted.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const startServer = async () => {
  const db = await createPool();
  await initDb(db);
  const connectMode = process.env.DB_CONNECT_MODE || (process.env.CLOUD_SQL_CONNECTION_NAME ? "cloud-sql" : "tcp");
  console.log(`Database pool ready (mode=${connectMode}, limit=${process.env.DB_POOL_SIZE || 5})`);

  const JWT_SECRET = process.env.JWT_SECRET || "webhouse_secret";
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
  const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
  const verifyToken = createVerifyToken(JWT_SECRET);

  registerAuthRoutes(app, db, { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, verifyToken });
  registerDashboardRoutes(app, db, verifyToken);
  registerWhPortalRoutes(app, verifyToken, {
    jwtSecret: JWT_SECRET,
    jwtExpiresIn: JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
  });

  app.get("/", (req, res) => {
    res.send("API running");
  });

  const runPurge = async () => {
    try {
      const results = await purgeSoftDeleted();
      const total = Object.values(results).reduce((a, b) => a + b, 0);
      if (total > 0) console.log(`Purged ${total} soft-deleted row(s)`);
    } catch (err) {
      console.error("Purge job failed:", err.message);
    }
  };

  runPurge();
  setInterval(runPurge, PURGE_INTERVAL_MS);

  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
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
