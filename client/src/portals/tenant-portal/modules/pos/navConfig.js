import {
  DashboardIcon,
  ModuleIcon,
  TenantsIcon,
  ProductIcon,
  LogsIcon,
  SubscriptionIcon,
} from "../../../../components/icons";
import { MODULE_BASE } from "./constants";

export function getNavItems() {
  return [
    { id: "all-modules", label: "All Modules", path: "/app", icon: ModuleIcon },
    { id: "dashboard", label: "Dashboard", path: `${MODULE_BASE}/dashboard`, icon: DashboardIcon },
    { id: "outlets", label: "Outlets", path: `${MODULE_BASE}/outlets`, icon: TenantsIcon },
    { id: "terminals", label: "Terminals", path: `${MODULE_BASE}/terminals`, icon: ProductIcon },
    { id: "sales", label: "Sales", path: `${MODULE_BASE}/sales`, icon: LogsIcon },
    { id: "registers", label: "Cash Registers", path: `${MODULE_BASE}/registers`, icon: SubscriptionIcon },
  ];
}
