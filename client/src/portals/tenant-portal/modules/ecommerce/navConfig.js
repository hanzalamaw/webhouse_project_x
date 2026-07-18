import { DashboardIcon } from "../../../../components/icons";
import { MODULE_BASE } from "./constants";

export function getNavItems() {
  return [
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
