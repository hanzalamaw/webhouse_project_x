const IMPERSONATION_SESSION_KEY = "wh_impersonation_session";

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
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(userData));
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
  };
}
