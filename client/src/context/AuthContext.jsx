import { createContext, useState, useContext, useEffect, useCallback, useRef } from "react";
import { API_BASE } from "../config/api";
import { isTokenExpired } from "../utils/authToken";

const AuthContext = createContext(null);

function getLoginPath(user) {
  if (user?.portal === "tenant") {
    const portal = user.login_portal || "erp1";
    return `/${portal}`;
  }
  return "/webhouse-portal";
}

function readStoredSession() {
  try {
    const savedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!savedUser || !token) return null;
    return { user: JSON.parse(savedUser), token };
  } catch {
    return null;
  }
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
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    setUser(null);
    window.location.href = getLoginPath(userSnapshot);
  }, [user]);

  const ensureFreshTokens = useCallback((storedUser) => {
    const token = localStorage.getItem("token");
    const refreshToken = localStorage.getItem("refreshToken");
    if (!token || !refreshToken) {
      clearSessionAndLogout(storedUser);
      return false;
    }
    if (isTokenExpired(refreshToken)) {
      clearSessionAndLogout(storedUser);
      return false;
    }
    return true;
  }, [clearSessionAndLogout]);

  const authFetch = useCallback(async (url, options = {}) => {
    const epoch = sessionEpochRef.current;
    const token = localStorage.getItem("token");
    const headers = { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    let res = await fetch(url, { ...options, headers });

    if (epoch !== sessionEpochRef.current) return res;

    if (res.status === 401) {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken || isTokenExpired(refreshToken)) {
        clearSessionAndLogout();
        return res;
      }
      const refreshRes = await fetch(`${API_BASE}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (epoch !== sessionEpochRef.current) return res;
      if (!refreshRes.ok) {
        clearSessionAndLogout();
        return res;
      }
      const data = await refreshRes.json().catch(() => ({}));
      if (!data?.token) {
        clearSessionAndLogout();
        return res;
      }
      localStorage.setItem("token", data.token);
      res = await fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${data.token}` },
      });
    }
    return res;
  }, [clearSessionAndLogout]);

  const validateStoredSession = useCallback(async () => {
    const epoch = bumpSessionEpoch();
    const session = readStoredSession();
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }

    const { user: storedUser, token } = session;
    if (!ensureFreshTokens(storedUser)) return;

    setUser(storedUser);

    const mePath = storedUser.portal === "tenant" ? `${API_BASE}/tenant/me` : `${API_BASE}/me`;

    const tryMe = (accessToken) =>
      fetch(mePath, { headers: { Authorization: `Bearer ${accessToken}` } });

    try {
      let res = await tryMe(token);

      if (epoch !== sessionEpochRef.current) return;

      if (res.status === 401) {
        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken || isTokenExpired(refreshToken)) {
          clearSessionAndLogout(storedUser);
          return;
        }
        const refreshRes = await fetch(`${API_BASE}/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (epoch !== sessionEpochRef.current) return;
        if (!refreshRes.ok) {
          clearSessionAndLogout(storedUser);
          return;
        }
        const data = await refreshRes.json().catch(() => ({}));
        if (!data?.token) {
          clearSessionAndLogout(storedUser);
          return;
        }
        localStorage.setItem("token", data.token);
        res = await tryMe(data.token);
        if (epoch !== sessionEpochRef.current) return;
      }

      if (!res.ok) {
        if (localStorage.getItem("token") === token) {
          clearSessionAndLogout(storedUser);
        }
        return;
      }

      const data = await res.json();
      if (epoch !== sessionEpochRef.current) return;
      if (data?.user) {
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
      }
    } catch {
      if (epoch === sessionEpochRef.current && localStorage.getItem("token") === token) {
        clearSessionAndLogout(storedUser);
      }
    } finally {
      if (epoch === sessionEpochRef.current) {
        setLoading(false);
      }
    }
  }, [clearSessionAndLogout, ensureFreshTokens]);

  useEffect(() => {
    validateStoredSession();

    const onFocus = () => {
      const session = readStoredSession();
      if (!session) return;
      if (!ensureFreshTokens(session.user)) return;
      if (isTokenExpired(localStorage.getItem("token"))) {
        validateStoredSession();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // Validate stored session once on app load only (login manages its own state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (userData, token, refreshToken = null) => {
    bumpSessionEpoch();
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    if (refreshToken != null) localStorage.setItem("refreshToken", refreshToken);
    setUser(userData);
    setLoading(false);
  };

  const logout = async () => {
    const token = localStorage.getItem("token");
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
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    setUser(null);
    window.location.href = getLoginPath(user);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
