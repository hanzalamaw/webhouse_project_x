import {
  DashboardIcon,
  TenantsIcon,
  ImpersonateIcon,
  ModuleIcon,
  LogsIcon,
  SubscriptionIcon,
  SupportIcon,
  HelpIcon,
} from "../../../../components/icons";

/** Shared sidebar sections — each module navConfig can extend or replace later. */
export function buildModuleNav(slug) {
  const base = `/app/m/${slug}`;
  return [
    {
      id: "all-modules",
      label: "All Modules",
      path: "/app",
      icon: ModuleIcon,
    },
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
      id: "roles-management",
      label: "Roles Management",
      path: `${base}/roles-management`,
      icon: ImpersonateIcon,
    },
    {
      id: "permissions-management",
      label: "Permissions Management",
      path: `${base}/permissions-management`,
      icon: ModuleIcon,
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
    {
      id: "help-center",
      label: "Help Center",
      path: `${base}/help-center`,
      icon: HelpIcon,
    },
  ];
}

export const MODULE_SECTION_ROUTES = [
  { path: "user-management", title: "User Management" },
  { path: "roles-management", title: "Roles Management" },
  { path: "permissions-management", title: "Permissions Management" },
  { path: "audit-logs", title: "Audit Logs" },
  { path: "sessions", title: "Sessions" },
  { path: "organization-settings", title: "Organization Settings" },
  { path: "plan-subscription", title: "Plan & Subscription" },
  { path: "activity-alerts", title: "Activity Alerts" },
  { path: "help-center", title: "Help Center" },
];
