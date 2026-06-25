/** 1 hour idle timeout */
export const SESSION_IDLE_MS = 60 * 60 * 1000;
/** 7 day absolute session cap */
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export function isWhAdminUser(user) {
  return user?.portal === "wh_admin";
}

/** wh_admin has no idle/max client session limits */
export function sessionLimitsApply(user) {
  return user?.portal === "tenant" && !user?.impersonating;
}

export function isLocalSessionExpired(sessionStartedAt, lastActivityAt, user) {
  if (!sessionLimitsApply(user)) return false;
  const now = Date.now();
  const started = Number(sessionStartedAt) || 0;
  const lastActive = Number(lastActivityAt) || started;
  if (!started) return false;
  if (now - started > SESSION_MAX_MS) return true;
  if (now - lastActive > SESSION_IDLE_MS) return true;
  return false;
}
