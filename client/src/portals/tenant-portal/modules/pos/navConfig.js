import {
  DashboardIcon,
  ModuleIcon,
  TenantsIcon,
  ProductIcon,
  ProcurementIcon,
  LogsIcon,
  SubscriptionIcon,
} from "../../../../components/icons";
import { MODULE_BASE } from "./constants";

export function getNavItems() {
  return [
    { id: "all-modules", label: "All Modules", path: "/app", icon: ModuleIcon },
    { id: "dashboard", label: "Dashboard", path: `${MODULE_BASE}/dashboard`, icon: DashboardIcon },
    {
      id: "stores",
      label: "Stores",
      icon: TenantsIcon,
      children: [
        { id: "create-store", label: "Create", path: `${MODULE_BASE}/stores/create` },
        { id: "manage-stores", label: "Manage", path: `${MODULE_BASE}/stores/manage` },
      ],
    },
    {
      id: "products",
      label: "Products",
      icon: ProductIcon,
      children: [
        { id: "create-product", label: "Create", path: `${MODULE_BASE}/products/create` },
        { id: "manage-products", label: "Manage", path: `${MODULE_BASE}/products/manage` },
        { id: "categories", label: "Categories", path: `${MODULE_BASE}/products/categories` },
        { id: "import-export", label: "Import / Export", path: `${MODULE_BASE}/products/import-export` },
      ],
    },
    {
      id: "procurement",
      label: "Procurement",
      icon: ProcurementIcon,
      children: [
        { id: "stock-in", label: "Stock In", path: `${MODULE_BASE}/procurement/stock-in` },
        { id: "stock-out", label: "Stock Out", path: `${MODULE_BASE}/procurement/stock-out` },
        { id: "transfers", label: "Stock Transfers", path: `${MODULE_BASE}/procurement/transfers` },
        { id: "movement-history", label: "Movement History", path: `${MODULE_BASE}/procurement/movement-history` },
      ],
    },
    { id: "sales", label: "Sales", path: `${MODULE_BASE}/sales`, icon: LogsIcon },
    { id: "registers", label: "Cash Registers", path: `${MODULE_BASE}/registers`, icon: SubscriptionIcon },
  ];
}
