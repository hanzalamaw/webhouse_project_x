import {
  DashboardIcon,
  SubscriptionIcon,
  LogsIcon,
  TransferIcon,
  ProductIcon,
  WarehouseIcon,
} from "../../../../components/icons";
import { MODULE_BASE } from "./constants";

export function getNavItems() {
  return [
    { id: "dashboard", label: "Dashboard", path: `${MODULE_BASE}/dashboard`, icon: DashboardIcon },
    { id: "customer-payments", label: "Customer Payments", path: `${MODULE_BASE}/customer-payments`, icon: SubscriptionIcon },
    { id: "vendor-bills", label: "Vendor Bills & Payments", path: `${MODULE_BASE}/vendor-bills`, icon: TransferIcon },
    { id: "expenses", label: "Expenses", path: `${MODULE_BASE}/expenses`, icon: ProductIcon },
    { id: "recurring-expenses", label: "Recurring Expenses", path: `${MODULE_BASE}/recurring-expenses`, icon: LogsIcon },
    { id: "bank-accounts", label: "Bank Accounts", path: `${MODULE_BASE}/bank-accounts`, icon: WarehouseIcon },
    { id: "transactions", label: "Transactions", path: `${MODULE_BASE}/transactions`, icon: LogsIcon },
  ];
}
