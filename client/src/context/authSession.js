const IMPERSONATION_SESSION_KEY = "wh_impersonation_session";
const SESSION_STARTED_KEY = "wh_session_started_at";
const SESSION_ACTIVITY_KEY = "wh_session_last_activity_at";

function nowMs() {
  return Date.now();
}

export function readSessionTimestamps() {
  try {
    return {
      sessionStartedAt: Number(localStorage.getItem(SESSION_STARTED_KEY)) || null,
      lastActivityAt: Number(localStorage.getItem(SESSION_ACTIVITY_KEY)) || null,
    };
  } catch {
    return { sessionStartedAt: null, lastActivityAt: null };
  }
}

export function touchSessionActivity() {
  const ts = String(nowMs());
  try {
    localStorage.setItem(SESSION_ACTIVITY_KEY, ts);
  } catch {
    /* ignore */
  }
}

export function clearSessionTimestamps() {
  try {
    localStorage.removeItem(SESSION_STARTED_KEY);
    localStorage.removeItem(SESSION_ACTIVITY_KEY);
  } catch {
    /* ignore */
  }
}

export function readImpersonationSession() {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.user && parsed?.token) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function readPrimarySession() {
  try {
    const savedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!savedUser || !token) return null;
    return {
      user: JSON.parse(savedUser),
      token,
      refreshToken: localStorage.getItem("refreshToken"),
    };
  } catch {
    /* ignore */
  }
  return null;
}

/** Impersonation tab session takes priority over the primary browser session. */
export function readStoredSession() {
  return readImpersonationSession() || readPrimarySession();
}

export function persistSession(userData, token, refreshToken = null) {
  if (userData?.impersonating) {
    sessionStorage.setItem(
      IMPERSONATION_SESSION_KEY,
      JSON.stringify({ user: userData, token, refreshToken })
    );
    return;
  }

  sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
  const ts = String(nowMs());
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(userData));
  localStorage.setItem(SESSION_STARTED_KEY, ts);
  localStorage.setItem(SESSION_ACTIVITY_KEY, ts);
  if (refreshToken != null) localStorage.setItem("refreshToken", refreshToken);
}

export function clearStoredSession(userHint) {
  if (userHint?.impersonating || readImpersonationSession()) {
    sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
    return "impersonation";
  }

  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
  clearSessionTimestamps();
  return "primary";
}

export function getActiveToken() {
  return readStoredSession()?.token ?? null;
}

export function getActiveRefreshToken() {
  const imp = readImpersonationSession();
  if (imp) return imp.refreshToken;
  return localStorage.getItem("refreshToken");
}

export function updateActiveToken(token) {
  const imp = readImpersonationSession();
  if (imp) {
    sessionStorage.setItem(IMPERSONATION_SESSION_KEY, JSON.stringify({ ...imp, token }));
    return;
  }
  localStorage.setItem("token", token);
  touchSessionActivity();
}

export function updateActiveUser(userData) {
  const imp = readImpersonationSession();
  if (imp) {
    sessionStorage.setItem(IMPERSONATION_SESSION_KEY, JSON.stringify({ ...imp, user: userData }));
    return;
  }
  localStorage.setItem("user", JSON.stringify(userData));
}

export function mergeTenantUserFromApi(apiUser, storedUser) {
  if (!storedUser?.impersonating) return apiUser;
  return {
    ...apiUser,
    impersonating: true,
    impersonated_by: storedUser.impersonated_by,
    tenant_name: apiUser.tenant_name || storedUser.tenant_name,
  };
}
