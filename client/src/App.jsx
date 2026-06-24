import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import MainLayout from "./components/layout/MainLayout";
import Login from "./portals/wh-portal/pages/Login";
import Dashboard from "./portals/wh-portal/pages/Dashboard";
import CreateTenant from "./portals/wh-portal/pages/tenants/CreateTenant";
import ManageTenant from "./portals/wh-portal/pages/tenants/ManageTenant";
import Sessions from "./portals/wh-portal/pages/tenants/Sessions";
import Transaction from "./portals/wh-portal/pages/tenants/Transaction";
import CreateTicket from "./portals/wh-portal/pages/support/CreateTicket";
import ManageTickets from "./portals/wh-portal/pages/support/ManageTickets";
import Impersonation from "./portals/wh-portal/pages/Impersonation";
import ImpersonationHandoff from "./portals/wh-portal/pages/ImpersonationHandoff";
import CreateModule from "./portals/wh-portal/pages/modules/CreateModule";
import ManageModules from "./portals/wh-portal/pages/modules/ManageModules";
import CreateSubscription from "./portals/wh-portal/pages/subscriptions/CreateSubscription";
import ManageSubscriptions from "./portals/wh-portal/pages/subscriptions/ManageSubscriptions";
import Logs from "./portals/wh-portal/pages/logs/Logs";
import ErpLogin from "./portals/tenant-portal/pages/ErpLogin";
import ModuleHub from "./portals/tenant-portal/pages/ModuleHub";
import ModulePlaceholder from "./portals/tenant-portal/pages/ModulePlaceholder";
import TenantLayout from "./components/layout/TenantLayout";

const WhProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (user?.portal === "tenant") return <Navigate to="/app" replace />;
  if (!user || user.portal !== "wh_admin") {
    const redirect = encodeURIComponent(location.pathname || "/webhouse-portal/dashboard");
    return <Navigate to={`/webhouse-portal?redirect=${redirect}`} replace />;
  }
  return children;
};

const TenantProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.portal === "wh_admin") return <Navigate to="/webhouse-portal/dashboard" replace />;
  if (!user || user.portal !== "tenant") {
    return <Navigate to="/erp1" replace />;
  }
  return children;
};

function WhLoginGate() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (user?.portal === "wh_admin") {
    const params = new URLSearchParams(location.search);
    const redirect = params.get("redirect") || "/webhouse-portal/dashboard";
    return <Navigate to={redirect} replace />;
  }
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/webhouse-portal" replace />} />
      <Route path="/login" element={<Navigate to="/webhouse-portal" replace />} />
      <Route path="/webhouse-portal" element={<WhLoginGate />} />
      <Route path="/webhouse-portal/impersonate/session" element={<ImpersonationHandoff />} />
      <Route path="/erp1" element={<ErpLogin portal="erp1" />} />
      <Route path="/erp2" element={<ErpLogin portal="erp2" />} />
      <Route path="/erp3" element={<ErpLogin portal="erp3" />} />

      <Route
        element={
          <WhProtectedRoute>
            <MainLayout />
          </WhProtectedRoute>
        }
      >
        <Route path="/webhouse-portal/dashboard" element={<Dashboard />} />
        <Route path="/webhouse-portal/subscriptions/create" element={<CreateSubscription />} />
        <Route path="/webhouse-portal/subscriptions/manage" element={<ManageSubscriptions />} />
        <Route path="/webhouse-portal/modules" element={<ManageModules />} />
        <Route path="/webhouse-portal/modules/manage" element={<Navigate to="/webhouse-portal/modules" replace />} />
        <Route path="/webhouse-portal/modules/create" element={<CreateModule />} />
        <Route path="/webhouse-portal/logs" element={<Logs />} />
        <Route path="/webhouse-portal/tenants/create" element={<CreateTenant />} />
        <Route path="/webhouse-portal/tenants/edit/:tenantId" element={<CreateTenant />} />
        <Route path="/webhouse-portal/tenants/manage" element={<ManageTenant />} />
        <Route path="/webhouse-portal/tenants/sessions" element={<Sessions />} />
        <Route path="/webhouse-portal/tenants/transactions" element={<Transaction />} />
        <Route path="/webhouse-portal/support/create" element={<CreateTicket />} />
        <Route path="/webhouse-portal/support/manage" element={<ManageTickets />} />
        <Route path="/webhouse-portal/impersonation" element={<Impersonation />} />
      </Route>

      <Route
        element={
          <TenantProtectedRoute>
            <Outlet />
          </TenantProtectedRoute>
        }
      >
        <Route path="/app" element={<ModuleHub />} />
        <Route path="/app/m/:moduleId" element={<TenantLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ModulePlaceholder title="Dashboard" />} />
          <Route path="user-management" element={<ModulePlaceholder title="User Management" />} />
          <Route path="roles-management" element={<ModulePlaceholder title="Roles Management" />} />
          <Route path="permissions-management" element={<ModulePlaceholder title="Permissions Management" />} />
          <Route path="audit-logs" element={<ModulePlaceholder title="Audit Logs" />} />
          <Route path="sessions" element={<ModulePlaceholder title="Sessions" />} />
          <Route path="organization-settings" element={<ModulePlaceholder title="Organization Settings" />} />
          <Route path="plan-subscription" element={<ModulePlaceholder title="Plan & Subscription" />} />
          <Route path="activity-alerts" element={<ModulePlaceholder title="Activity Alerts" />} />
          <Route path="help-center" element={<ModulePlaceholder title="Help Center" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/webhouse-portal" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
