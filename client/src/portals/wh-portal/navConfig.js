import {
  DashboardIcon,
  TenantsIcon,
  SupportIcon,
  ImpersonateIcon,
  HelpIcon,
  LogoutIcon,
  MoonIcon,
  ChevronIcon,
} from "../../components/icons";

export const MENU_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    icon: DashboardIcon,
  },
  {
    id: "tenants",
    label: "Tenant Management",
    icon: TenantsIcon,
    children: [
      { id: "create-tenant", label: "Create Tenant", path: "/tenants/create" },
      { id: "manage-tenant", label: "Manage Tenant", path: "/tenants/manage" },
      { id: "transactions", label: "Transaction", path: "/tenants/transactions" },
    ],
  },
  {
    id: "support",
    label: "Support Tickets",
    icon: SupportIcon,
    children: [
      { id: "create-ticket", label: "Create", path: "/support/create" },
      { id: "manage-tickets", label: "Manage", path: "/support/manage" },
    ],
  },
  {
    id: "impersonation",
    label: "Impersonation",
    path: "/impersonation",
    icon: ImpersonateIcon,
  },
];

export const FOOTER_ITEMS = {
  help: { label: "Help Center", icon: HelpIcon },
  logout: { label: "Log Out", icon: LogoutIcon },
  nightMode: { label: "Night Mode", icon: MoonIcon },
};

export { ChevronIcon };
