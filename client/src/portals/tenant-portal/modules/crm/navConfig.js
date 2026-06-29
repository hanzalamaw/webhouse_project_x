import {
  DashboardIcon,
  TenantsIcon,
  SupportIcon,
  LogsIcon,
} from "../../../../components/icons";
import { MODULE_BASE } from "./constants";

/** Flat menu aligned with Admin module layout. */
export function getNavItems() {
  return [
    { id: "dashboard", label: "Dashboard", path: `${MODULE_BASE}/dashboard`, icon: DashboardIcon },
    { id: "leads", label: "Leads", path: `${MODULE_BASE}/leads/manage`, icon: LogsIcon },
    { id: "customers", label: "Customers", path: `${MODULE_BASE}/customers/manage`, icon: TenantsIcon },
    {
      id: "import-export",
      label: "Import / Export",
      path: `${MODULE_BASE}/import-export`,
      icon: LogsIcon,
    },
    {
      id: "complaints",
      label: "Complaints & Support",
      path: `${MODULE_BASE}/complaints/manage`,
      icon: SupportIcon,
    },
  ];
}
