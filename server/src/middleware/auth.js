import jwt from "jsonwebtoken";

/**
 * Returns middleware that verifies JWT and attaches userId, userRole, sessionId to req.
 * @param {object} db - MySQL pool
 * @param {string} JWT_SECRET
 */
export const createVerifyToken = (db, JWT_SECRET) => {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1] || req.headers["x-access-token"];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      if (decoded.sessionId) {
        const [sessions] = await db.execute(
          "SELECT is_active, expires_at FROM user_sessions WHERE session_id = ?",
          [decoded.sessionId]
        );

        if (sessions.length === 0 || !sessions[0].is_active) {
          return res.status(401).json({ message: "Session has been terminated" });
        }

        if (new Date(sessions[0].expires_at) < new Date()) {
          await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [decoded.sessionId]);
          return res.status(401).json({ message: "Session has expired" });
        }

        await db.execute(
          "UPDATE user_sessions SET last_activity_at = NOW() WHERE session_id = ?",
          [decoded.sessionId]
        );
      }

      req.userId = decoded.id;
      req.userRole = decoded.role;
      req.sessionId = decoded.sessionId;
      next();
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
};
