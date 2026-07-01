import {
  DashboardIcon,
  ProductIcon,
  SubscriptionIcon,
  SupportIcon,
  LogsIcon,
  TransferIcon,
  WarehouseIcon,
} from "../../../../components/icons";
import { MODULE_BASE } from "./constants";

export function getNavItems() {
  return [
    { id: "dashboard", label: "Dashboard", path: `${MODULE_BASE}/dashboard`, icon: DashboardIcon },
    {
      id: "orders",
      label: "Orders",
      icon: ProductIcon,
      children: [
        { id: "orders-manage", label: "Manage Orders", path: `${MODULE_BASE}/orders/manage` },
        { id: "orders-create", label: "Create Order", path: `${MODULE_BASE}/orders/create` },
        { id: "assignments", label: "Assignments", path: `${MODULE_BASE}/assignments/manage` },
        { id: "printing", label: "Invoice & Printing", path: `${MODULE_BASE}/printing` },
        { id: "import-export", label: "Import / Export", path: `${MODULE_BASE}/import-export` },
      ],
    },
    {
      id: "payments",
      label: "Payments",
      icon: SubscriptionIcon,
      children: [
        { id: "payments-manage", label: "Open Payment", path: `${MODULE_BASE}/payments/manage` },
      ],
    },
    {
      id: "after-sales",
      label: "After Sales",
      icon: TransferIcon,
      children: [
        { id: "cancellations", label: "Cancellations", path: `${MODULE_BASE}/cancellations/manage` },
        { id: "returns", label: "Returns", path: `${MODULE_BASE}/returns/manage` },
        { id: "exchanges", label: "Exchanges", path: `${MODULE_BASE}/exchanges/manage` },
        { id: "refunds", label: "Refunds", path: `${MODULE_BASE}/refunds/manage` },
      ],
    },
  ];
}
