import jwt from "jsonwebtoken";

/**
 * Returns middleware that verifies JWT and attaches userId, userRole, sessionId, tenantId to req.
 * @param {string} JWT_SECRET
 */
export const createVerifyToken = (JWT_SECRET) => {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1] || req.headers["x-access-token"];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      if (decoded.type === "refresh") {
        return res.status(401).json({ message: "Invalid token" });
      }

      req.userId = decoded.id;
      req.userRole = decoded.role;
      req.sessionId = decoded.sessionId ?? null;
      req.tenantId = decoded.tenantId ?? null;
      next();
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
};
