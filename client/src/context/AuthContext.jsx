import { createContext, useState, useContext, useEffect, useCallback, useRef } from "react";
import { API_BASE } from "../config/api";
import { ImpersonationGhostIndicator } from "../components/ImpersonationGhostIndicator";
import { isTokenExpired, isStoredAuthExpired } from "../utils/authToken";
import {
  readStoredSession,
  persistSession,
  clearStoredSession,
  getActiveToken,
  getActiveRefreshToken,
  updateActiveToken,
  updateActiveUser,
  mergeTenantUserFromApi,
  readImpersonationSession,
  readSessionTimestamps,
  touchSessionActivity,
} from "./authSession";
import { isLocalSessionExpired } from "../utils/sessionPolicy";

const AuthContext = createContext(null);

function getLoginPath(user) {
  if (user?.portal === "tenant") {
    const portal = user.login_portal || "erp1";
    return `/${portal}`;
  }
  return "/webhouse-portal";
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionEpochRef = useRef(0);

  const bumpSessionEpoch = () => {
    sessionEpochRef.current += 1;
    return sessionEpochRef.current;
  };

  const clearSessionAndLogout = useCallback((portalOrUser) => {
    bumpSessionEpoch();
    const userSnapshot = portalOrUser?.portal ? portalOrUser : user;
    clearStoredSession(userSnapshot);
    setUser(null);
    setLoading(false);
    window.location.href = getLoginPath(userSnapshot);
  }, [user]);

  const refreshAccessToken = useCallback(async (refreshToken) => {
    if (!refreshToken || isTokenExpired(refreshToken)) return null;
    try {
      const refreshRes = await fetch(`${API_BASE}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!refreshRes.ok) return null;
      const data = await refreshRes.json().catch(() => ({}));
      return data?.token || null;
    } catch {
      return null;
    }
  }, []);

  const resolveAccessToken = useCallback(async (storedUser) => {
    const session = readStoredSession();
    if (!session || isStoredAuthExpired(session)) {
      return null;
    }

    const { sessionStartedAt, lastActivityAt } = readSessionTimestamps();
    if (isLocalSessionExpired(sessionStartedAt, lastActivityAt, storedUser)) {
      return null;
    }

    let accessToken = session.token;
    if (isTokenExpired(accessToken)) {
      const refreshed = await refreshAccessToken(session.refreshToken);
      if (!refreshed) return null;
      updateActiveToken(refreshed);
      accessToken = refreshed;
    }

    return accessToken;
  }, [refreshAccessToken]);

  const authFetch = useCallback(async (url, options = {}) => {
    const epoch = sessionEpochRef.current;
    const session = readStoredSession();
    if (!session?.user || isStoredAuthExpired(session)) {
      clearSessionAndLogout(session?.user);
      return new Response(null, { status: 401 });
    }

    let token = getActiveToken();
    if (!token || isTokenExpired(token)) {
      const refreshed = await refreshAccessToken(getActiveRefreshToken());
      if (!refreshed) {
        clearSessionAndLogout(session.user);
        return new Response(null, { status: 401 });
      }
      updateActiveToken(refreshed);
      token = refreshed;
    }

    touchSessionActivity();
    const headers = { ...options.headers, Authorization: `Bearer ${token}` };
    let res = await fetch(url, { ...options, headers });

    if (epoch !== sessionEpochRef.current) return res;

    if (res.status === 401) {
      const refreshToken = getActiveRefreshToken();
      if (!refreshToken || isTokenExpired(refreshToken)) {
        clearSessionAndLogout(session.user);
        return res;
      }
      const refreshed = await refreshAccessToken(refreshToken);
      if (epoch !== sessionEpochRef.current) return res;
      if (!refreshed) {
        clearSessionAndLogout(session.user);
        return res;
      }
      updateActiveToken(refreshed);
      res = await fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${refreshed}` },
      });
      if (res.status === 401) {
        clearSessionAndLogout(session.user);
      }
    }
    return res;
  }, [clearSessionAndLogout, refreshAccessToken]);

  const validateStoredSession = useCallback(async () => {
    const epoch = bumpSessionEpoch();
    const session = readStoredSession();
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }

    const { user: storedUser } = session;
    if (isStoredAuthExpired(session)) {
      clearSessionAndLogout(storedUser);
      return;
    }

    const accessToken = await resolveAccessToken(storedUser);
    if (epoch !== sessionEpochRef.current) return;
    if (!accessToken) {
      clearSessionAndLogout(storedUser);
      return;
    }

    const mePath = storedUser.portal === "tenant" ? `${API_BASE}/tenant/me` : `${API_BASE}/me`;

    try {
      const res = await fetch(mePath, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (epoch !== sessionEpochRef.current) return;

      if (!res.ok) {
        clearSessionAndLogout(storedUser);
        return;
      }

      const data = await res.json();
      if (epoch !== sessionEpochRef.current) return;
      if (!data?.user) {
        clearSessionAndLogout(storedUser);
        return;
      }

      const merged = mergeTenantUserFromApi(data.user, storedUser);
      setUser(merged);
      updateActiveUser(merged);
      touchSessionActivity();
    } catch {
      if (epoch === sessionEpochRef.current) {
        clearSessionAndLogout(storedUser);
      }
      return;
    } finally {
      if (epoch === sessionEpochRef.current) {
        setLoading(false);
      }
    }
  }, [clearSessionAndLogout, resolveAccessToken]);

  useEffect(() => {
    validateStoredSession();

    const onFocus = () => {
      const session = readStoredSession();
      if (!session?.user) return;
      if (isStoredAuthExpired(session)) {
        clearSessionAndLogout(session.user);
        return;
      }
      const { sessionStartedAt, lastActivityAt } = readSessionTimestamps();
      if (isLocalSessionExpired(sessionStartedAt, lastActivityAt, session.user)) {
        clearSessionAndLogout(session.user);
        return;
      }
      const token = getActiveToken();
      if (!token || isTokenExpired(token)) {
        validateStoredSession();
      }
    };

    const onActivity = () => touchSessionActivity();

    const sessionCheck = () => {
      const session = readStoredSession();
      if (!session?.user) return;
      if (isStoredAuthExpired(session)) {
        clearSessionAndLogout(session.user);
        return;
      }
      const { sessionStartedAt, lastActivityAt } = readSessionTimestamps();
      if (isLocalSessionExpired(sessionStartedAt, lastActivityAt, session.user)) {
        clearSessionAndLogout(session.user);
      }
    };

    const idleCheck = window.setInterval(sessionCheck, 60_000);

    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(idleCheck);
      activityEvents.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.removeEventListener("focus", onFocus);
    };
    // Validate stored session once on app load only (login manages its own state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (userData, token, refreshToken = null) => {
    bumpSessionEpoch();
    persistSession(userData, token, refreshToken);
    setUser(userData);
    setLoading(false);
  };

  const logout = async () => {
    const impersonation = readImpersonationSession();
    const activeUser = impersonation?.user ?? user;
    const token = getActiveToken();
    bumpSessionEpoch();
    try {
      await fetch(`${API_BASE}/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (error) {
      console.error("Logout API call failed:", error);
    }

    if (impersonation) {
      clearStoredSession({ impersonating: true });
      setUser(null);
      if (window.opener && !window.opener.closed) {
        window.close();
        return;
      }
      window.location.href = "/webhouse-portal";
      return;
    }

    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    setUser(null);
    window.location.href = getLoginPath(activeUser);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, authFetch }}>
      {children}
      {user?.impersonating && user?.portal === "tenant" && (
        <ImpersonationGhostIndicator tenantName={user.tenant_name} onEnd={logout} />
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
