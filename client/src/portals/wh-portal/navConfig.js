import {
  DashboardIcon,
  TenantsIcon,
  SupportIcon,
  ImpersonateIcon,
  LogoutIcon,
  MoonIcon,
  ChevronIcon,
  SubscriptionIcon,
  ModuleIcon,
  LogsIcon,
} from "../../components/icons";

const BASE = "/webhouse-portal";

export const MENU_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: `${BASE}/dashboard`,
    icon: DashboardIcon,
  },
  {
    id: "tenants",
    label: "Tenant Management",
    icon: TenantsIcon,
    children: [
      { id: "create-tenant", label: "Create Tenant", path: `${BASE}/tenants/create` },
      { id: "manage-tenant", label: "Manage Tenant", path: `${BASE}/tenants/manage` },
      { id: "sessions", label: "Sessions", path: `${BASE}/tenants/sessions` },
      { id: "transactions", label: "Transaction", path: `${BASE}/tenants/transactions` },
    ],
  },
  {
    id: "subscription",
    label: "Subscription",
    icon: SubscriptionIcon,
    children: [
      { id: "sub-create", label: "Create", path: `${BASE}/subscriptions/create` },
      { id: "sub-manage", label: "Manage", path: `${BASE}/subscriptions/manage` },
    ],
  },
  {
    id: "module",
    label: "Modules",
    path: `${BASE}/modules`,
    icon: ModuleIcon,
  },
  {
    id: "support",
    label: "Support Tickets",
    icon: SupportIcon,
    children: [
      { id: "create-ticket", label: "Create", path: `${BASE}/support/create` },
      { id: "manage-tickets", label: "Manage", path: `${BASE}/support/manage` },
    ],
  },
  {
    id: "impersonation",
    label: "Impersonation",
    path: `${BASE}/impersonation`,
    icon: ImpersonateIcon,
  },
  {
    id: "logs",
    label: "Logs",
    path: `${BASE}/logs`,
    icon: LogsIcon,
  },
];

export const FOOTER_ITEMS = {
  logout: { label: "Log Out", icon: LogoutIcon },
  nightMode: { label: "Night Mode", icon: MoonIcon },
};

export { ChevronIcon };
