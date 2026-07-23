import { PERMISSION_ACTIONS } from "../utils/permissionRules.js";
import { isSuperAdminRoleName } from "../utils/tenantRoles.js";
import { tenantPermissionRepository } from "../repositories/tenantPermissionRepository.js";
import { tenantRepository } from "../repositories/tenantRepository.js";
import { permissionCache } from "../utils/permissionCache.js";

const ALL_ACTIONS = [...PERMISSION_ACTIONS, "manage"];

function normalizeActionSet(actions) {
  const set = new Set((actions || []).map(String));
  if (set.has("manage")) {
    for (const action of ALL_ACTIONS) set.add(action);
  }
  if (set.has("delete") || set.has("edit") || set.has("create") || set.has("export")) {
    set.add("view");
  }
  return [...set];
}

function permissionsFromEnabledModules(modules) {
  const permissions = {};
  for (const mod of modules) {
    if (!mod.is_enabled) continue;
    permissions[mod.module_name] = [...PERMISSION_ACTIONS, "manage"];
  }
  return permissions;
}

function buildMatrix(rows) {
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.module_name]) grouped[row.module_name] = new Set();
    grouped[row.module_name].add(row.action);
  }
  const permissions = {};
  for (const [moduleName, actions] of Object.entries(grouped)) {
    permissions[moduleName] = normalizeActionSet([...actions]);
  }
  return permissions;
}

function intersectWithEnabled(permissions, enabledNames) {
  const clipped = {};
  for (const [moduleName, actions] of Object.entries(permissions || {})) {
    if (!enabledNames.has(moduleName)) continue;
    clipped[moduleName] = actions;
  }
  return clipped;
}

function toEnabledSet(modules) {
  return new Set((modules || []).filter((m) => m.is_enabled).map((m) => m.module_name));
}

function withEnabledContext(ctx, enabledModules) {
  const enabledNames = toEnabledSet(enabledModules);
  return {
    ...ctx,
    enabled_modules: [...enabledNames],
    enabledModuleSet: enabledNames,
    enabledModuleRows: enabledModules.filter((m) => m.is_enabled),
  };
}

async function resolveForUserUncached(tenantId, userId, { impersonating = false } = {}) {
  const enabledModules = (await tenantRepository.getTenantModules(tenantId)).filter((m) => m.is_enabled);

  if (impersonating) {
    return withEnabledContext(
      {
        is_super_admin: true,
        permissions: permissionsFromEnabledModules(enabledModules),
      },
      enabledModules
    );
  }

  const role = await tenantPermissionRepository.findUserRole(tenantId, userId);
  if (!role?.role_id) {
    return withEnabledContext({ is_super_admin: false, permissions: {} }, enabledModules);
  }

  if (isSuperAdminRoleName(role.role_name)) {
    return withEnabledContext(
      {
        is_super_admin: true,
        role_name: role.role_name,
        permissions: permissionsFromEnabledModules(enabledModules),
      },
      enabledModules
    );
  }

  const rows = await tenantPermissionRepository.findPermissionsByRole(tenantId, role.role_id);
  const enabledNames = toEnabledSet(enabledModules);
  return withEnabledContext(
    {
      is_super_admin: false,
      role_name: role.role_name,
      permissions: intersectWithEnabled(buildMatrix(rows), enabledNames),
    },
    enabledModules
  );
}

export const tenantPermissionService = {
  async resolveForUser(tenantId, userId, { impersonating = false } = {}) {
    const cached = permissionCache.get(tenantId, userId, { impersonating });
    if (cached) return cached;

    const ctx = await resolveForUserUncached(tenantId, userId, { impersonating });
    return permissionCache.set(tenantId, userId, ctx, { impersonating });
  },

  toClientPayload(ctx) {
    return {
      is_super_admin: Boolean(ctx?.is_super_admin),
      role_name: ctx?.role_name || null,
      permissions: ctx?.permissions || {},
    };
  },

  canAccess(ctx, moduleName, action) {
    if (!moduleName || !action) return false;
    if (!ctx) return false;

    const enabled = ctx.enabledModuleSet || new Set(ctx.enabled_modules || []);
    if (enabled.size > 0 && !enabled.has(moduleName)) return false;
    // If enabled set is empty and we have no permissions, deny.
    if (enabled.size === 0 && !ctx.permissions?.[moduleName]) return false;

    if (ctx.is_super_admin) {
      return enabled.has(moduleName);
    }

    const granted = new Set(ctx.permissions?.[moduleName] || []);
    if (granted.has(action)) return true;
    if (granted.has("manage")) return true;
    return false;
  },

  canViewModule(ctx, moduleName) {
    return this.canAccess(ctx, moduleName, "view");
  },

  async enrichUserPayload(user, tenantId, options = {}) {
    const ctx = await this.resolveForUser(tenantId, user.id, options);
    return { ...user, ...this.toClientPayload(ctx) };
  },
};
