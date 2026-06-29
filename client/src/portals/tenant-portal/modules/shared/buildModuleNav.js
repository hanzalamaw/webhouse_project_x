import {
  DashboardIcon,
  TenantsIcon,
  ImpersonateIcon,
  LogsIcon,
  SubscriptionIcon,
  SupportIcon,
} from "../../../../components/icons";

/** Shared sidebar sections — each module navConfig can extend or replace later. */
export function buildModuleNav(slug) {
  const base = `/app/m/${slug}`;
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      path: `${base}/dashboard`,
      icon: DashboardIcon,
    },
    {
      id: "user-management",
      label: "User Management",
      path: `${base}/user-management`,
      icon: TenantsIcon,
    },
    {
      id: "roles-and-permissions",
      label: "Roles & Permissions",
      path: `${base}/roles-and-permissions`,
      icon: ImpersonateIcon,
    },
    {
      id: "audit-logs",
      label: "Audit Logs",
      path: `${base}/audit-logs`,
      icon: LogsIcon,
    },
    {
      id: "sessions",
      label: "Sessions",
      path: `${base}/sessions`,
      icon: ImpersonateIcon,
    },
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
    {
      id: "activity-alerts",
      label: "Activity Alerts",
      path: `${base}/activity-alerts`,
      icon: SupportIcon,
    },
  ];
}

export const MODULE_SECTION_ROUTES = [
  { path: "user-management", title: "User Management" },
  { path: "roles-and-permissions", title: "Roles & Permissions" },
  { path: "audit-logs", title: "Audit Logs" },
  { path: "sessions", title: "Sessions" },
  { path: "organization-settings", title: "Organization Settings" },
  { path: "plan-subscription", title: "Plan & Subscription" },
  { path: "activity-alerts", title: "Activity Alerts" },
  { path: "help-center", title: "Help Center" },
];
