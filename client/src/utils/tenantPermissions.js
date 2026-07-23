import { TENANT_MODULE_DEFINITIONS } from "../portals/tenant-portal/modules/registry";

export function moduleNameFromSlug(slug) {
  const mod = TENANT_MODULE_DEFINITIONS.find((m) => m.slug === slug);
  return mod?.name || null;
}

function permissionMatrix(user) {
  return user?.manifest?.permissions || user?.permissions || {};
}

/** Display-only check — backend always re-enforces on API calls. */
export function hasPermission(user, moduleName, action) {
  if (!user || !moduleName || !action) return false;

  if (user.manifest?.modules?.length) {
    const entitled = user.manifest.modules.some((m) => m.module_name === moduleName);
    if (!entitled) return false;
  }

  const granted = new Set(permissionMatrix(user)[moduleName] || []);
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
