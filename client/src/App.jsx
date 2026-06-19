import { useEffect } from "react";

import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";

import { ThemeProvider } from "./context/ThemeContext";

import { API_BASE } from "./config/api";

import MainLayout from "./components/layout/MainLayout";

import Login from "./portals/wh-portal/pages/Login";

import Dashboard from "./portals/wh-portal/pages/Dashboard";

import CreateTenant from "./portals/wh-portal/pages/tenants/CreateTenant";

import ManageTenant from "./portals/wh-portal/pages/tenants/ManageTenant";

import Transaction from "./portals/wh-portal/pages/tenants/Transaction";

import CreateTicket from "./portals/wh-portal/pages/support/CreateTicket";

import ManageTickets from "./portals/wh-portal/pages/support/ManageTickets";

import Impersonation from "./portals/wh-portal/pages/Impersonation";



const ProtectedRoute = ({ children }) => {

  const { user, loading } = useAuth();

  const location = useLocation();

  if (loading) return null;

  if (!user) {

    const redirect = encodeURIComponent(location.pathname || "/dashboard");

    return <Navigate to={`/login?redirect=${redirect}`} replace />;

  }

  return children;

};



function clearSessionAndRedirectToLogin() {

  localStorage.removeItem("token");

  localStorage.removeItem("refreshToken");

  localStorage.removeItem("user");

  window.location.href = "/login";

}



function AuthFetchInterceptor() {

  const { user } = useAuth();

  useEffect(() => {

    if (!user) return;

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {

      const res = await originalFetch.apply(this, args);

      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";

      const isApi = url.includes("/api/");

      const isAuthEndpoint = /\/api\/(login|refresh)/.test(url);

      if (res.status === 401 && isApi && !isAuthEndpoint) {

        const refreshToken = localStorage.getItem("refreshToken");

        if (!refreshToken) {

          clearSessionAndRedirectToLogin();

          return res;

        }

        try {

          const refreshRes = await originalFetch(`${API_BASE}/refresh`, {

            method: "POST",

            headers: { "Content-Type": "application/json" },

            body: JSON.stringify({ refreshToken }),

          });

          if (!refreshRes.ok) {

            clearSessionAndRedirectToLogin();

            return res;

          }

          const data = await refreshRes.json().catch(() => ({}));

          if (!data?.token) {

            clearSessionAndRedirectToLogin();

            return res;

          }

          localStorage.setItem("token", data.token);

          const newHeaders = { ...(args[1]?.headers || {}), Authorization: `Bearer ${data.token}` };

          return originalFetch(args[0], { ...args[1], headers: newHeaders });

        } catch {

          clearSessionAndRedirectToLogin();

          return res;

        }

      }

      return res;

    };

    return () => {

      window.fetch = originalFetch;

    };

  }, [user]);

  return null;

}



function AppRoutes() {

  const { user } = useAuth();



  return (

    <Routes>

      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />

      <Route

        element={

          <ProtectedRoute>

            <MainLayout />

          </ProtectedRoute>

        }

      >

        <Route index element={<Navigate to="/dashboard" replace />} />

        <Route path="dashboard" element={<Dashboard />} />

        <Route path="tenants/create" element={<CreateTenant />} />

        <Route path="tenants/manage" element={<ManageTenant />} />

        <Route path="tenants/transactions" element={<Transaction />} />

        <Route path="support/create" element={<CreateTicket />} />

        <Route path="support/manage" element={<ManageTickets />} />

        <Route path="impersonation" element={<Impersonation />} />

      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />

    </Routes>

  );

}



function App() {

  return (

    <ThemeProvider>

      <AuthProvider>

        <Router>

          <AuthFetchInterceptor />

          <AppRoutes />

        </Router>

      </AuthProvider>

    </ThemeProvider>

  );

}



export default App;

