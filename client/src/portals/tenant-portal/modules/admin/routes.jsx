import UserManagement from "./pages/UserManagement";
import UserView from "./pages/UserView";
import UserForm from "./pages/UserForm";
import RolesAndPermissions from "./pages/RolesAndPermissions";
import AuditLogs from "./pages/AuditLogs";
import AuditLogView from "./pages/AuditLogView";
import Sessions from "./pages/Sessions";
import OrganizationSettings from "./pages/OrganizationSettings";
import PlanSubscription from "./pages/PlanSubscription";
import ActivityAlerts from "./pages/ActivityAlerts";
import ActivityAlertView from "./pages/ActivityAlertView";
import HelpCenter from "./pages/HelpCenter";

export const ADMIN_ROUTES = [
  { path: "user-management", element: <UserManagement /> },
  { path: "user-management/view/:userId", element: <UserView /> },
  { path: "user-management/create", element: <UserForm /> },
  { path: "user-management/edit/:userId", element: <UserForm /> },
  { path: "roles-and-permissions", element: <RolesAndPermissions /> },
  { path: "audit-logs", element: <AuditLogs /> },
  { path: "audit-logs/view/:logId", element: <AuditLogView /> },
  { path: "sessions", element: <Sessions /> },
  { path: "organization-settings", element: <OrganizationSettings /> },
  { path: "plan-subscription", element: <PlanSubscription /> },
  { path: "activity-alerts", element: <ActivityAlerts /> },
  { path: "activity-alerts/view/:alertId", element: <ActivityAlertView /> },
  { path: "help-center", element: <HelpCenter /> },
];
