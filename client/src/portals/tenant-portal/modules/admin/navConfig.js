import {
  DashboardIcon,
  TenantsIcon,
  ImpersonateIcon,
  LogsIcon,
  SubscriptionIcon,
  SupportIcon,
} from "../../../../components/icons";

const base = "/app/m/admin";

/** Flat menu aligned with Admin module spec. */
export function getNavItems() {
  return [
    { id: "dashboard", label: "Dashboard", path: `${base}/dashboard`, icon: DashboardIcon },
    { id: "user-management", label: "User Management", path: `${base}/user-management`, icon: TenantsIcon },
    {
      id: "roles-and-permissions",
      label: "Roles & Permissions",
      path: `${base}/roles-and-permissions`,
      icon: ImpersonateIcon,
    },
    { id: "audit-logs", label: "Audit Logs", path: `${base}/audit-logs`, icon: LogsIcon },
    { id: "sessions", label: "Sessions", path: `${base}/sessions`, icon: ImpersonateIcon },
    {
      id: "organization-settings",
      label: "Organization Settings",
      path: `${base}/organization-settings`,
      icon: TenantsIcon,
    },
    {
      id: "plan-subscription",
      label: "Plan & Subscription",
      path: `${base}/plan-subscription`,
      icon: SubscriptionIcon,
    },
    { id: "activity-alerts", label: "Activity Alerts", path: `${base}/activity-alerts`, icon: SupportIcon },
  ];
}
