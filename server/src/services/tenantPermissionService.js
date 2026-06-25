import { PERMISSION_ACTIONS } from "../utils/permissionRules.js";
import { isSuperAdminRoleName } from "../utils/tenantRoles.js";
import { tenantPermissionRepository } from "../repositories/tenantPermissionRepository.js";
import { tenantRepository } from "../repositories/tenantRepository.js";

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

export const tenantPermissionService = {
  async resolveForUser(tenantId, userId, { impersonating = false } = {}) {
    const enabledModules = (await tenantRepository.getTenantModules(tenantId)).filter((m) => m.is_enabled);

    if (impersonating) {
      return {
        is_super_admin: true,
        permissions: permissionsFromEnabledModules(enabledModules),
      };
    }

    const role = await tenantPermissionRepository.findUserRole(tenantId, userId);
    if (!role?.role_id) {
      return { is_super_admin: false, permissions: {} };
    }

    if (isSuperAdminRoleName(role.role_name)) {
      return {
        is_super_admin: true,
        role_name: role.role_name,
        permissions: permissionsFromEnabledModules(enabledModules),
      };
    }

    const rows = await tenantPermissionRepository.findPermissionsByRole(role.role_id);
    return {
      is_super_admin: false,
      role_name: role.role_name,
      permissions: buildMatrix(rows),
    };
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
    if (ctx.is_super_admin) return true;
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
