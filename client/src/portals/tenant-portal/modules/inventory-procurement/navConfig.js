import {
  DashboardIcon,
  ProductIcon,
  WarehouseIcon,
  ProcurementIcon,
  LogsIcon,
} from "../../../../components/icons";
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
      id: "products",
      label: "Products",
      icon: ProductIcon,
      children: [
        { id: "create-product", label: "Create New Product", path: `${MODULE_BASE}/products/create` },
        { id: "manage-products", label: "Manage Products", path: `${MODULE_BASE}/products/manage` },
        { id: "categories", label: "Categories", path: `${MODULE_BASE}/products/categories` },
        { id: "import-export", label: "Bulk Import/Export", path: `${MODULE_BASE}/products/import-export` },
      ],
    },
    {
      id: "warehouses",
      label: "Warehouses",
      path: `${MODULE_BASE}/warehouses`,
      icon: WarehouseIcon,
    },
    {
      id: "procurement",
      label: "Procurement",
      icon: ProcurementIcon,
      children: [
        { id: "stock-in", label: "Stock In", path: `${MODULE_BASE}/procurement/stock-in` },
        { id: "stock-out", label: "Stock Out", path: `${MODULE_BASE}/procurement/stock-out` },
        { id: "transfers", label: "Stock Transfers", path: `${MODULE_BASE}/procurement/transfers` },
        { id: "movement-history", label: "Stock Movement History", path: `${MODULE_BASE}/procurement/movement-history` },
      ],
    },
  ];
}
