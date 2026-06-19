import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createPool } from "./src/db/pool.js";
import { createVerifyToken } from "./src/middleware/auth.js";
import { registerAuthRoutes } from "./src/routes/auth.js";
import { registerDashboardRoutes } from "./src/routes/dashboard.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const startServer = async () => {
  const db = await createPool();

  const JWT_SECRET = process.env.JWT_SECRET || "webhouse_secret";
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
  const verifyToken = createVerifyToken(db, JWT_SECRET);

  registerAuthRoutes(app, db, { JWT_SECRET, JWT_EXPIRES_IN, verifyToken });
  registerDashboardRoutes(app, db, verifyToken);

  app.get("/", (req, res) => {
    res.send("API running");
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
