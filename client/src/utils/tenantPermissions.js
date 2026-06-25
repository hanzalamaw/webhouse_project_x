import { TENANT_MODULE_DEFINITIONS } from "../portals/tenant-portal/modules/registry";

export function moduleNameFromSlug(slug) {
  const mod = TENANT_MODULE_DEFINITIONS.find((m) => m.slug === slug);
  return mod?.name || null;
}

export function hasPermission(user, moduleName, action) {
  if (!user || !moduleName || !action) return false;
  if (user.impersonating || user.is_super_admin) return true;

  const granted = new Set(user.permissions?.[moduleName] || []);
  if (granted.has(action)) return true;
  if (granted.has("manage")) return true;
  return false;
}

export function canViewModule(user, moduleName) {
  return hasPermission(user, moduleName, "view");
}

export function canViewModuleSlug(user, moduleSlug) {
  const moduleName = moduleNameFromSlug(moduleSlug);
  return moduleName ? canViewModule(user, moduleName) : false;
}
