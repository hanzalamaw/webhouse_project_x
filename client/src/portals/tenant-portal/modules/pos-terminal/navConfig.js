import { DashboardIcon, ModuleIcon, ProductIcon } from "../../../../components/icons";
import { MODULE_BASE } from "./constants";

export function getNavItems() {
  return [
    { id: "all-modules", label: "All Modules", path: "/app", icon: ModuleIcon },
    { id: "checkout", label: "Checkout", path: `${MODULE_BASE}/checkout`, icon: ProductIcon },
    { id: "pos-admin", label: "POS Settings", path: "/app/m/pos/dashboard", icon: DashboardIcon },
  ];
}
