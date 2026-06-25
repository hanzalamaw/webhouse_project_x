import AdminDashboard from "./admin/pages/Dashboard";
import { getNavItems as getAdminNav } from "./admin/navConfig";
import AdminUserManagement from "./admin/pages/UserManagement";
import AdminRolesAndPermissions from "./admin/pages/RolesAndPermissions";
import AdminAuditLogs from "./admin/pages/AuditLogs";
import AdminSessions from "./admin/pages/Sessions";
import AdminOrganizationSettings from "./admin/pages/OrganizationSettings";
import AdminPlanSubscription from "./admin/pages/PlanSubscription";
import AdminActivityAlerts from "./admin/pages/ActivityAlerts";
import AdminHelpCenter from "./admin/pages/HelpCenter";

import LogisticsDashboard from "./logistics-partners/pages/Dashboard";
import { getNavItems as getLogisticsNav } from "./logistics-partners/navConfig";

import OrderManagementDashboard from "./order-management/pages/Dashboard";
import { getNavItems as getOrderManagementNav } from "./order-management/navConfig";

import PosDashboard from "./pos/pages/Dashboard";
import { getNavItems as getPosNav } from "./pos/navConfig";

import CrmDashboard from "./crm/pages/Dashboard";
import { getNavItems as getCrmNav } from "./crm/navConfig";

import EcommerceDashboard from "./ecommerce/pages/Dashboard";
import { getNavItems as getEcommerceNav } from "./ecommerce/navConfig";

import FinanceDashboard from "./finance/pages/Dashboard";
import { getNavItems as getFinanceNav } from "./finance/navConfig";

import InventoryDashboard from "./inventory-procurement/pages/Dashboard";
import { getNavItems as getInventoryNav } from "./inventory-procurement/navConfig";
import { INVENTORY_ROUTES } from "./inventory-procurement/routes.jsx";

import { MODULE_SECTION_ROUTES } from "./shared/buildModuleNav";

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

/** Canonical tenant-facing modules (fixed set of 8). */
export const TENANT_MODULE_DEFINITIONS = [
  {
    slug: "admin",
    name: "Admin",
    letter: "A",
    aliases: [],
    Dashboard: AdminDashboard,
    getNavItems: getAdminNav,
    sections: [
      { path: "user-management", title: "User Management", Component: AdminUserManagement },
      { path: "roles-and-permissions", title: "Roles & Permissions", Component: AdminRolesAndPermissions },
      { path: "audit-logs", title: "Audit Logs", Component: AdminAuditLogs },
      { path: "sessions", title: "Sessions", Component: AdminSessions },
      { path: "organization-settings", title: "Organization Settings", Component: AdminOrganizationSettings },
      { path: "plan-subscription", title: "Plan & Subscription", Component: AdminPlanSubscription },
      { path: "activity-alerts", title: "Activity Alerts", Component: AdminActivityAlerts },
      { path: "help-center", title: "Help Center", Component: AdminHelpCenter },
    ],
  },
  {
    slug: "logistics-partners",
    name: "Logistics Partners",
    letter: "L",
    aliases: ["Logistics", "Logistics Partners Management"],
    Dashboard: LogisticsDashboard,
    getNavItems: getLogisticsNav,
  },
  {
    slug: "order-management",
    name: "Order Management",
    letter: "O",
    aliases: ["Orders"],
    Dashboard: OrderManagementDashboard,
    getNavItems: getOrderManagementNav,
  },
  {
    slug: "pos",
    name: "POS",
    letter: "P",
    aliases: [],
    Dashboard: PosDashboard,
    getNavItems: getPosNav,
  },
  {
    slug: "crm",
    name: "CRM",
    letter: "C",
    aliases: [],
    Dashboard: CrmDashboard,
    getNavItems: getCrmNav,
  },
  {
    slug: "ecommerce",
    name: "E-Commerce Integration",
    letter: "E",
    aliases: [],
    Dashboard: EcommerceDashboard,
    getNavItems: getEcommerceNav,
  },
  {
    slug: "finance",
    name: "Finance & Accounting",
    letter: "F",
    aliases: [],
    Dashboard: FinanceDashboard,
    getNavItems: getFinanceNav,
  },
  {
    slug: "inventory-procurement",
    name: "Inventory & Procurement",
    letter: "I",
    aliases: ["Inventory"],
    Dashboard: InventoryDashboard,
    getNavItems: getInventoryNav,
    routes: INVENTORY_ROUTES,
  },
];

export { MODULE_SECTION_ROUTES };

export function moduleBasePath(slug) {
  return `/app/m/${slug}`;
}

export function getModuleBySlug(slug) {
  return TENANT_MODULE_DEFINITIONS.find((m) => m.slug === slug) || null;
}

export function moduleMatchesAssignment(definition, assignedModuleName) {
  const assigned = normalizeName(assignedModuleName);
  if (normalizeName(definition.name) === assigned) return true;
  return (definition.aliases || []).some((alias) => normalizeName(alias) === assigned);
}

/** Keep only hardcoded modules that the tenant has been assigned (by module name). */
export function filterAssignedModules(assignedFromApi) {
  const assigned = assignedFromApi || [];
  return TENANT_MODULE_DEFINITIONS.filter((def) =>
    assigned.some((row) => moduleMatchesAssignment(def, row.module_name))
  );
}

export function getTenantMenuItems(moduleSlug) {
  const mod = getModuleBySlug(moduleSlug);
  if (!mod) return [];
  return mod.getNavItems();
}
