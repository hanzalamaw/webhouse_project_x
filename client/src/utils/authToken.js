export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenExpired(token, skewMs = 0) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now() + skewMs;
}

export function isStoredAuthExpired(session) {
  if (!session?.token) return true;
  if (!session.refreshToken) return true;
  if (isTokenExpired(session.refreshToken)) return true;
  return false;
}
