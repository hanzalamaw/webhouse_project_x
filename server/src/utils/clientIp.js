/** Best-effort client IP for session/audit logging behind proxies. */
export function extractClientIp(req) {
  const candidates = [
    req.headers["x-client-ip"],
    req.headers["x-real-ip"],
    req.headers["cf-connecting-ip"],
    req.headers["true-client-ip"],
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim(),
    req.ip,
    req.socket?.remoteAddress,
  ];

  for (const raw of candidates) {
    const ip = normalizeIp(raw);
    if (ip) return ip;
  }

  return null;
}

function normalizeIp(ip) {
  if (ip == null || ip === "") return null;
  const value = String(ip).trim();
  if (!value) return null;
  if (value.startsWith("::ffff:")) return value.slice(7);
  if (value === "0.0.0.0") return null;
  return value;
}
