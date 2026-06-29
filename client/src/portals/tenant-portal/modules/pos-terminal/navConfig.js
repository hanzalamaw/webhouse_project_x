import { DashboardIcon, ProductIcon } from "../../../../components/icons";
import { MODULE_BASE } from "./constants";

export function getNavItems() {
  return [
    { id: "checkout", label: "Checkout", path: `${MODULE_BASE}/checkout`, icon: ProductIcon },
    { id: "pos-admin", label: "POS Settings", path: "/app/m/pos/dashboard", icon: DashboardIcon },
  ];
}
