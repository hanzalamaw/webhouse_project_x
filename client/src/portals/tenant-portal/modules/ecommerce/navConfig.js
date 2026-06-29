import {
  DashboardIcon,
  ModuleIcon,
} from "../../../../components/icons";
import { MODULE_BASE } from "./constants";

export function getNavItems() {
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
      path: `${MODULE_BASE}/dashboard`,
      icon: DashboardIcon,
    },
    {
      id: "integrations",
      label: "Store Integrations",
      path: `${MODULE_BASE}/integrations`,
      icon: DashboardIcon,
    },
  ];
}
