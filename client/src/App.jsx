import { createBrowserRouter, RouterProvider, Navigate, useLocation, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import MainLayout from "./components/layout/MainLayout";
import Login from "./portals/wh-portal/pages/Login";
import Dashboard from "./portals/wh-portal/pages/Dashboard";
import CreateTenant from "./portals/wh-portal/pages/tenants/CreateTenant";
import TenantView from "./portals/wh-portal/pages/tenants/TenantView";
import ManageTenant from "./portals/wh-portal/pages/tenants/ManageTenant";
import Sessions from "./portals/wh-portal/pages/tenants/Sessions";
import Transaction from "./portals/wh-portal/pages/tenants/Transaction";
import CreateTicket from "./portals/wh-portal/pages/support/CreateTicket";
import TicketView from "./portals/wh-portal/pages/support/TicketView";
import ManageTickets from "./portals/wh-portal/pages/support/ManageTickets";
import Impersonation from "./portals/wh-portal/pages/Impersonation";
import ImpersonationHandoff from "./portals/wh-portal/pages/ImpersonationHandoff";
import CreateModule from "./portals/wh-portal/pages/modules/CreateModule";
import ManageModules from "./portals/wh-portal/pages/modules/ManageModules";
import CreateSubscription from "./portals/wh-portal/pages/subscriptions/CreateSubscription";
import SubscriptionView from "./portals/wh-portal/pages/subscriptions/SubscriptionView";
import ManageSubscriptions from "./portals/wh-portal/pages/subscriptions/ManageSubscriptions";
import Logs from "./portals/wh-portal/pages/logs/Logs";
import ErpLogin from "./portals/tenant-portal/pages/ErpLogin";
import ModuleHub from "./portals/tenant-portal/pages/ModuleHub";
import ModulePlaceholder from "./portals/tenant-portal/pages/ModulePlaceholder";
import TenantLayout from "./components/layout/TenantLayout";
import TenantModuleGuard from "./components/TenantModuleGuard";
import {
  TENANT_MODULE_DEFINITIONS,
  MODULE_SECTION_ROUTES,
} from "./portals/tenant-portal/modules/registry";

function WhProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (user?.portal === "tenant") return <Navigate to="/app" replace />;
  if (!user || user.portal !== "wh_admin") {
    const redirect = encodeURIComponent(location.pathname || "/webhouse-portal/dashboard");
    return <Navigate to={`/webhouse-portal?redirect=${redirect}`} replace />;
  }
  return children;
}

function TenantProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.portal === "wh_admin") return <Navigate to="/webhouse-portal/dashboard" replace />;
  if (!user || user.portal !== "tenant") {
    return <Navigate to="/erp1" replace />;
  }
  return children;
}

function AuthRouteLoading() {
  return (
    <div className="wh-auth-route-loading">
      <p className="wh-muted">Loading…</p>
    </div>
  );
}

function WhLoginGate() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthRouteLoading />;
  if (user?.portal === "wh_admin") {
    const params = new URLSearchParams(location.search);
    const redirect = params.get("redirect") || "/webhouse-portal/dashboard";
    return <Navigate to={redirect} replace />;
  }
  return <Login />;
}

function RootBlank() {
  return <div style={{ minHeight: "100vh", width: "100%", background: "#ffffff" }} />;
}

function buildTenantModuleRouteChildren(mod) {
  const ModDashboard = mod.Dashboard;
  const children = [
    { index: true, element: <Navigate to="dashboard" replace /> },
    { path: "dashboard", element: <ModDashboard /> },
  ];

  if (mod.routes?.length) {
    const sorted = [...mod.routes].sort((a, b) => b.path.length - a.path.length);
    for (const section of sorted) {
      children.push({ path: section.path, element: section.element });
    }
  } else {
    for (const section of mod.sections || MODULE_SECTION_ROUTES) {
      const SectionComponent = section.Component;
      children.push({
        path: section.path,
        element: SectionComponent ? (
          <SectionComponent />
        ) : (
          <ModulePlaceholder
            title={`${mod.name} — ${section.title}`}
            description="This section will be built soon."
          />
        ),
      });
    }
  }

  if (mod.slug === "admin") {
    children.push(
      { path: "roles-management", element: <Navigate to="roles-and-permissions" replace /> },
      { path: "permissions-management", element: <Navigate to="roles-and-permissions" replace /> }
    );
  }

  return children;
}

const router = createBrowserRouter([
  { path: "/", element: <RootBlank /> },
  { path: "/login", element: <Navigate to="/webhouse-portal" replace /> },
  { path: "/webhouse-portal", element: <WhLoginGate /> },
  { path: "/webhouse-portal/impersonate/session", element: <ImpersonationHandoff /> },
  { path: "/erp1", element: <ErpLogin portal="erp1" /> },
  { path: "/erp2", element: <ErpLogin portal="erp2" /> },
  { path: "/erp3", element: <ErpLogin portal="erp3" /> },
  {
    element: (
      <WhProtectedRoute>
        <MainLayout />
      </WhProtectedRoute>
    ),
    children: [
      { path: "/webhouse-portal/dashboard", element: <Dashboard /> },
      { path: "/webhouse-portal/subscriptions/create", element: <CreateSubscription /> },
      { path: "/webhouse-portal/subscriptions/edit/:planId", element: <CreateSubscription /> },
      { path: "/webhouse-portal/subscriptions/view/:planId", element: <SubscriptionView /> },
      { path: "/webhouse-portal/subscriptions/manage", element: <ManageSubscriptions /> },
      { path: "/webhouse-portal/modules", element: <ManageModules /> },
      { path: "/webhouse-portal/modules/manage", element: <Navigate to="/webhouse-portal/modules" replace /> },
      { path: "/webhouse-portal/modules/create", element: <CreateModule /> },
      { path: "/webhouse-portal/modules/edit/:moduleId", element: <CreateModule /> },
      { path: "/webhouse-portal/logs", element: <Logs /> },
      { path: "/webhouse-portal/tenants/create", element: <CreateTenant /> },
      { path: "/webhouse-portal/tenants/edit/:tenantId", element: <CreateTenant /> },
      { path: "/webhouse-portal/tenants/view/:tenantId", element: <TenantView /> },
      { path: "/webhouse-portal/tenants/manage", element: <ManageTenant /> },
      { path: "/webhouse-portal/tenants/sessions", element: <Sessions /> },
      { path: "/webhouse-portal/tenants/transactions", element: <Transaction /> },
      { path: "/webhouse-portal/support/create", element: <CreateTicket /> },
      { path: "/webhouse-portal/support/edit/:ticketId", element: <CreateTicket /> },
      { path: "/webhouse-portal/support/view/:ticketId", element: <TicketView /> },
      { path: "/webhouse-portal/support/manage", element: <ManageTickets /> },
      { path: "/webhouse-portal/impersonation", element: <Impersonation /> },
    ],
  },
  {
    element: (
      <TenantProtectedRoute>
        <Outlet />
      </TenantProtectedRoute>
    ),
    children: [
      { path: "/app", element: <ModuleHub /> },
      ...TENANT_MODULE_DEFINITIONS.map((mod) => ({
        path: `/app/m/${mod.slug}`,
        element: (
          <TenantModuleGuard moduleSlug={mod.slug}>
            <TenantLayout />
          </TenantModuleGuard>
        ),
        children: buildTenantModuleRouteChildren(mod),
      })),
    ],
  },
  { path: "*", element: <Navigate to="/webhouse-portal" replace /> },
]);

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
