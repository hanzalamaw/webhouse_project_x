import jwt from "jsonwebtoken";
import crypto from "crypto";
import { verifyPassword } from "../utils/cipher.js";

const toUserPayload = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.email,
  status: user.status,
  portal: "wh_admin",
});

export function registerAuthRoutes(app, db, { JWT_SECRET, JWT_EXPIRES_IN, verifyToken }) {
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const normalized = String(username).trim().toLowerCase();
    if (!normalized.startsWith("w.")) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const [rows] = await db.execute(
      "SELECT * FROM wh_admin_users WHERE LOWER(email) = ? AND status = 'active' LIMIT 1",
      [normalized]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const sessionId = crypto.randomBytes(32).toString("hex");
    const refreshToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 12);

    await db.execute(
      `INSERT INTO user_sessions (session_id, admin_user_id, ip_address, user_agent, refresh_token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, user.id, req.ip, req.get("user-agent"), refreshToken, expiresAt]
    );

    await db.execute("UPDATE wh_admin_users SET last_login_at = NOW() WHERE id = ?", [user.id]);

    const token = jwt.sign(
      { id: user.id, role: "wh_admin", sessionId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token, refreshToken, user: toUserPayload(user) });
  });

  app.post("/api/refresh", async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: "refreshToken is required" });

    const [rows] = await db.execute(
      `SELECT us.session_id, us.admin_user_id, us.expires_at, us.is_active
       FROM user_sessions us
       JOIN wh_admin_users u ON u.id = us.admin_user_id
       WHERE us.refresh_token = ? LIMIT 1`,
      [refreshToken]
    );
    const session = rows[0];
    if (!session || !session.is_active || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const token = jwt.sign(
      { id: session.admin_user_id, role: "wh_admin", sessionId: session.session_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({ token });
  });

  app.post("/api/logout", verifyToken, async (req, res) => {
    await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [req.sessionId]);
    res.json({ ok: true });
  });

  app.get("/api/me", verifyToken, async (req, res) => {
    const [rows] = await db.execute("SELECT * FROM wh_admin_users WHERE id = ? LIMIT 1", [req.userId]);
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    res.json({ user: toUserPayload(rows[0]) });
  });
}
