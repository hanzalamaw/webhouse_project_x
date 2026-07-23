import jwt from "jsonwebtoken";
import crypto from "crypto";
import { verifyPassword } from "../utils/cipher.js";
import { readDb, writeDb } from "../database/db.js";
import { sessionRepository } from "../repositories/sessionRepository.js";
import { createActivityAlert } from "../utils/activityAlerts.js";
import { manifestService } from "../services/manifestService.js";
import { extractClientIp } from "../utils/clientIp.js";
import { establishTenantContext } from "../middleware/tenantContext.js";

/** Pre-auth and WH-admin auth queries bypass tenant guard (no JWT tenant context yet). */
const SKIP = { skipTenantGuard: true, skipWriteAudit: true };

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

async function whAdminLogin(normalized, password, JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN) {
  const [rows] = await readDb.query(
    "SELECT * FROM wh_admin_users WHERE LOWER(email) = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1",
    [normalized],
    SKIP
  );
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password)) return null;

  await writeDb.query(
    "UPDATE wh_admin_users SET last_login_at = NOW() WHERE id = ?",
    [user.id],
    SKIP
  );

  const token = jwt.sign({ id: user.id, role: "wh_admin" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(
    { id: user.id, role: "wh_admin", type: "refresh" },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );

  return { token, refreshToken, user: toWhUserPayload(user) };
}

async function tenantLogin(
  username,
  password,
  portal,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  ip,
  deviceInfo,
  { forceLogoutOthers = false } = {}
) {
  const normalized = String(username).trim().toLowerCase();
  const plaintextPassword = String(password ?? "");
  const [rows] = await readDb.query(
    `SELECT u.*, t.id AS tid, t.company_name, t.login_portal, t.status AS tenant_status
     FROM users u
     INNER JOIN wh_tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL
     WHERE t.login_portal = ?
       AND LOWER(u.username) = ?
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [portal, normalized],
    SKIP
  );
  const row = rows[0];
  if (!row) {
    return {
      authError: "USER_NOT_FOUND",
      message: "No account found with that username on this portal.",
    };
  }

  if (!verifyPassword(plaintextPassword, row.password)) {
    await createActivityAlert({
      tenantId: row.tid,
      userId: row.id,
      alertType: "failed_login",
      title: "Failed login attempt",
      message: `Failed login for ${normalized} from ${ip || "unknown IP"}.`,
      priority: "high",
      ipAddress: ip || null,
      deviceInfo: deviceInfo || null,
    });
    return { authError: "WRONG_PASSWORD", message: "Incorrect password." };
  }

  if (row.tenant_status !== "active") {
    return {
      authError: "TENANT_INACTIVE",
      message: "This company account is not active. Contact your administrator.",
    };
  }

  if (row.status !== "active") {
    return {
      authError: "USER_INACTIVE",
      message: "Your account is inactive. Contact your administrator.",
    };
  }

  await writeDb.query(
    "UPDATE users SET last_login_at = NOW() WHERE id = ? AND tenant_id = ?",
    [row.id, row.tid],
    SKIP
  );

  const existingSession = await sessionRepository.findActiveForUser(row.id, row.tid);
  if (existingSession && !forceLogoutOthers) {
    return {
      conflict: true,
      existingSession: {
        id: existingSession.id,
        ip_address: existingSession.ip_address,
        device_info: existingSession.device_info,
        login_at: existingSession.login_at,
      },
    };
  }
  if (existingSession && forceLogoutOthers) {
    await sessionRepository.terminateAllForUser(row.id, null, row.tid);
  }

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

async function assertTenantSessionActive(sessionId, tenantId = null) {
  if (!sessionId) return false;
  return sessionRepository.isActive(sessionId, tenantId);
}

export function registerAuthRoutes(app, _db, { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, verifyToken }) {
  const requireActiveTenantSession = async (req, res, next) => {
    if (req.userRole !== "tenant") return next();
    const active = await assertTenantSessionActive(req.sessionId, req.tenantId);
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

    const result = await whAdminLogin(normalized, password, JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN);
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

    const ip = extractClientIp(req);
    const deviceInfo = req.headers["user-agent"] || null;
    const result = await tenantLogin(
      username,
      password,
      portal,
      JWT_SECRET,
      JWT_EXPIRES_IN,
      JWT_REFRESH_EXPIRES_IN,
      ip,
      deviceInfo,
      { forceLogoutOthers: Boolean(req.body.forceLogoutOthers) }
    );
    if (!result) return res.status(401).json({ message: "Invalid credentials" });
    if (result.authError) {
      return res.status(401).json({ message: result.message, code: result.authError });
    }
    if (result.error) return res.status(403).json({ message: result.error });
    if (result.conflict) {
      return res.status(409).json({
        message: "You are already logged in on another device.",
        code: "SESSION_CONFLICT",
        existingSession: result.existingSession,
      });
    }
    result.user = await manifestService.enrichUserWithManifest(result.user, result.user.tenant_id);
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
        const [rows] = await readDb.query(
          "SELECT id FROM wh_admin_users WHERE id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1",
          [decoded.id],
          SKIP
        );
        if (!rows.length) return res.status(401).json({ message: "Invalid refresh token" });
        const token = jwt.sign({ id: decoded.id, role: "wh_admin" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        return res.json({ token });
      }

      if (decoded.role === "tenant") {
        if (!decoded.tenantId) {
          return res.status(401).json({ message: "Invalid refresh token" });
        }
        const [rows] = await readDb.query(
          "SELECT id FROM users WHERE id = ? AND tenant_id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1",
          [decoded.id, decoded.tenantId],
          SKIP
        );
        if (!rows.length) return res.status(401).json({ message: "Invalid refresh token" });
        if (!decoded.sessionId || !(await assertTenantSessionActive(decoded.sessionId, decoded.tenantId))) {
          return res.status(401).json({ message: "Session terminated" });
        }
        const tokenPayload = {
          id: decoded.id,
          role: "tenant",
          tenantId: decoded.tenantId,
          sessionId: decoded.sessionId,
        };
        if (decoded.impersonatedBy) tokenPayload.impersonatedBy = decoded.impersonatedBy;
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        return res.json({ token });
      }

      return res.status(401).json({ message: "Invalid refresh token" });
    } catch {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
  });

  app.post("/api/logout", verifyToken, async (req, res) => {
    if (req.userRole === "tenant" && req.sessionId) {
      await sessionRepository.terminate(req.sessionId, req.tenantId);
    }
    res.json({ ok: true });
  });

  app.get("/api/me", verifyToken, async (req, res) => {
    if (req.userRole !== "wh_admin") return res.status(403).json({ message: "Forbidden" });
    const [rows] = await readDb.query(
      "SELECT * FROM wh_admin_users WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [req.userId],
      SKIP
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    res.json({ user: toWhUserPayload(rows[0]) });
  });

  app.get("/api/tenant/me", verifyToken, establishTenantContext, requireActiveTenantSession, async (req, res) => {
    if (req.userRole !== "tenant") return res.status(403).json({ message: "Forbidden" });
    const [rows] = await readDb.query(
      `SELECT u.*, t.company_name, t.login_portal
       FROM users u
       JOIN wh_tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL
       WHERE u.id = ? AND u.tenant_id = ? AND u.deleted_at IS NULL LIMIT 1`,
      [req.userId, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    const row = rows[0];
    const userPayload = toTenantUserPayload(row, {
      id: row.tenant_id,
      company_name: row.company_name,
      login_portal: row.login_portal,
    });
    if (req.impersonatedBy) {
      userPayload.impersonating = true;
      userPayload.impersonated_by = req.impersonatedBy;
    }
    const enriched = await manifestService.enrichUserWithManifest(userPayload, row.tenant_id, {
      impersonating: Boolean(req.impersonatedBy),
    });
    res.json({ user: enriched });
  });

  app.get("/api/tenant/manifest", verifyToken, establishTenantContext, requireActiveTenantSession, async (req, res) => {
    if (req.userRole !== "tenant") return res.status(403).json({ message: "Forbidden" });
    const manifest = await manifestService.buildManifest(req.tenantId, req.userId, {
      impersonating: Boolean(req.impersonatedBy),
    });
    res.json({ data: manifest });
  });

  app.get("/api/tenant/modules", verifyToken, establishTenantContext, requireActiveTenantSession, async (req, res) => {
    if (req.userRole !== "tenant") return res.status(403).json({ message: "Forbidden" });
    const manifest = await manifestService.buildManifest(req.tenantId, req.userId, {
      impersonating: Boolean(req.impersonatedBy),
    });
    res.json({ data: manifest.modules });
  });
}
