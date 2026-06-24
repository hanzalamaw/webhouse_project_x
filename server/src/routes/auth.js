import jwt from "jsonwebtoken";
import crypto from "crypto";
import { verifyPassword } from "../utils/cipher.js";
import { sessionRepository } from "../repositories/sessionRepository.js";

const toWhUserPayload = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.email,
  status: user.status,
  portal: "wh_admin",
});

const toTenantUserPayload = (user, tenant) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username || user.email,
  status: user.status,
  portal: "tenant",
  tenant_id: tenant.id,
  tenant_name: tenant.company_name,
  login_portal: tenant.login_portal,
});

async function whAdminLogin(db, normalized, password, JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN) {
  const [rows] = await db.execute(
    "SELECT * FROM wh_admin_users WHERE LOWER(email) = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1",
    [normalized]
  );
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password)) return null;

  await db.execute("UPDATE wh_admin_users SET last_login_at = NOW() WHERE id = ?", [user.id]);

  const token = jwt.sign({ id: user.id, role: "wh_admin" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(
    { id: user.id, role: "wh_admin", type: "refresh" },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );

  return { token, refreshToken, user: toWhUserPayload(user) };
}

async function tenantLogin(
  db,
  username,
  password,
  portal,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  ip,
  deviceInfo
) {
  const normalized = String(username).trim().toLowerCase();
  const [rows] = await db.execute(
    `SELECT u.*, t.id AS tid, t.company_name, t.login_portal, t.status AS tenant_status
     FROM users u
     JOIN wh_tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL
     WHERE LOWER(u.username) = ? AND u.status = 'active' AND u.deleted_at IS NULL
     LIMIT 1`,
    [normalized]
  );
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password)) return null;
  if (row.tenant_status !== "active") return { error: "Tenant account is not active" };
  if (row.login_portal !== portal) return { error: "This account cannot log in from this portal" };

  await db.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [row.id]);

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const sessionId = await sessionRepository.create({
    sessionToken,
    ipAddress: ip,
    deviceInfo,
    tenantId: row.tid,
    userId: row.id,
  });

  const tenant = { id: row.tid, company_name: row.company_name, login_portal: row.login_portal };
  const user = { id: row.id, name: row.name, email: row.email, username: row.username, status: row.status };

  const token = jwt.sign(
    { id: user.id, role: "tenant", tenantId: tenant.id, sessionId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  const refreshToken = jwt.sign(
    { id: user.id, role: "tenant", tenantId: tenant.id, sessionId, type: "refresh" },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );

  return { token, refreshToken, user: toTenantUserPayload(user, tenant) };
}

async function assertTenantSessionActive(sessionId) {
  if (!sessionId) return false;
  return sessionRepository.isActive(sessionId);
}

export function registerAuthRoutes(app, db, { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, verifyToken }) {
  const requireActiveTenantSession = async (req, res, next) => {
    if (req.userRole !== "tenant") return next();
    const active = await assertTenantSessionActive(req.sessionId);
    if (!active) {
      return res.status(401).json({ message: "Session terminated" });
    }
    next();
  };

  const whLoginHandler = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const normalized = String(username).trim().toLowerCase();
    if (!normalized.startsWith("w.")) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const result = await whAdminLogin(db, normalized, password, JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN);
    if (!result) return res.status(401).json({ message: "Invalid credentials" });
    res.json(result);
  };

  app.post("/api/login", whLoginHandler);
  app.post("/api/wh/login", whLoginHandler);

  app.post("/api/tenant/login", async (req, res) => {
    const { username, password, portal } = req.body;
    if (!username || !password || !portal) {
      return res.status(400).json({ message: "username, password, and portal are required." });
    }
    if (!["erp1", "erp2", "erp3"].includes(portal)) {
      return res.status(400).json({ message: "Invalid portal" });
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "0.0.0.0";
    const deviceInfo = req.headers["user-agent"] || null;
    const result = await tenantLogin(
      db,
      username,
      password,
      portal,
      JWT_SECRET,
      JWT_EXPIRES_IN,
      JWT_REFRESH_EXPIRES_IN,
      ip,
      deviceInfo
    );
    if (!result) return res.status(401).json({ message: "Invalid credentials" });
    if (result.error) return res.status(403).json({ message: result.error });
    res.json(result);
  });

  app.post("/api/refresh", async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: "refreshToken is required" });

    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      if (decoded.type !== "refresh") {
        return res.status(401).json({ message: "Invalid refresh token" });
      }

      if (decoded.role === "wh_admin") {
        const [rows] = await db.execute(
          "SELECT id FROM wh_admin_users WHERE id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1",
          [decoded.id]
        );
        if (!rows.length) return res.status(401).json({ message: "Invalid refresh token" });
        const token = jwt.sign({ id: decoded.id, role: "wh_admin" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        return res.json({ token });
      }

      if (decoded.role === "tenant") {
        const [rows] = await db.execute(
          "SELECT id FROM users WHERE id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1",
          [decoded.id]
        );
        if (!rows.length) return res.status(401).json({ message: "Invalid refresh token" });
        if (!decoded.sessionId || !(await assertTenantSessionActive(decoded.sessionId))) {
          return res.status(401).json({ message: "Session terminated" });
        }
        const token = jwt.sign(
          { id: decoded.id, role: "tenant", tenantId: decoded.tenantId, sessionId: decoded.sessionId },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );
        return res.json({ token });
      }

      return res.status(401).json({ message: "Invalid refresh token" });
    } catch {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
  });

  app.post("/api/logout", verifyToken, async (req, res) => {
    if (req.userRole === "tenant" && req.sessionId) {
      await sessionRepository.terminate(req.sessionId);
    }
    res.json({ ok: true });
  });

  app.get("/api/me", verifyToken, async (req, res) => {
    if (req.userRole !== "wh_admin") return res.status(403).json({ message: "Forbidden" });
    const [rows] = await db.execute(
      "SELECT * FROM wh_admin_users WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    res.json({ user: toWhUserPayload(rows[0]) });
  });

  app.get("/api/tenant/me", verifyToken, requireActiveTenantSession, async (req, res) => {
    if (req.userRole !== "tenant") return res.status(403).json({ message: "Forbidden" });
    const [rows] = await db.execute(
      `SELECT u.*, t.company_name, t.login_portal
       FROM users u
       JOIN wh_tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    const row = rows[0];
    res.json({
      user: toTenantUserPayload(row, {
        id: row.tenant_id,
        company_name: row.company_name,
        login_portal: row.login_portal,
      }),
    });
  });
}
