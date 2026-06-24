import {
  DashboardIcon,
  TenantsIcon,
  ImpersonateIcon,
  ModuleIcon,
  LogsIcon,
  SubscriptionIcon,
  SupportIcon,
  HelpIcon,
  LogoutIcon,
  MoonIcon,
  ChevronIcon,
} from "../../components/icons";

export function moduleBasePath(moduleId) {
  return `/app/m/${moduleId}`;
}

export function getTenantMenuItems(moduleId) {
  const base = moduleBasePath(moduleId);
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

export const TENANT_FOOTER_ITEMS = {
  logout: { label: "Log Out", icon: LogoutIcon },
  nightMode: { label: "Night Mode", icon: MoonIcon },
};

export { ChevronIcon };
