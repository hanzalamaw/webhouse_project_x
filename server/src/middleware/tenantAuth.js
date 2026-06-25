export function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res.status(403).json({ message: "Tenant context required" });
  }
  next();
}
