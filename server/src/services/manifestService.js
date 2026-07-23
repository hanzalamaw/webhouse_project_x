import { tenantPermissionService } from "./tenantPermissionService.js";
import { slugForModuleName } from "../utils/moduleRegistry.js";

function buildVersion(tenantId, userId, ctx) {
  const moduleKey = (ctx.enabled_modules || []).slice().sort().join(",");
  return `${tenantId}:${userId}:${ctx.role_name || ""}:${moduleKey}`;
}

export const manifestService = {
  /**
   * Unified entitlement manifest for a tenant user.
   * Modules/nav are already filtered to enabled + viewable.
   */
  async buildManifest(tenantId, userId, options = {}) {
    const ctx = await tenantPermissionService.resolveForUser(tenantId, userId, options);
    const rows = ctx.enabledModuleRows || [];

    const modules = rows
      .filter((row) => tenantPermissionService.canViewModule(ctx, row.module_name))
      .map((row) => ({
        module_id: row.module_id,
        module_name: row.module_name,
        slug: slugForModuleName(row.module_name),
        is_enabled: true,
      }));

    const nav = modules
      .filter((m) => m.slug)
      .map((m) => ({ module_name: m.module_name, slug: m.slug }));

    return {
      modules,
      permissions: ctx.permissions || {},
      nav,
      role_name: ctx.role_name || null,
      is_super_admin: Boolean(ctx.is_super_admin),
      version: buildVersion(tenantId, userId, ctx),
    };
  },

  async enrichUserWithManifest(user, tenantId, options = {}) {
    const manifest = await this.buildManifest(tenantId, user.id, options);
    return {
      ...user,
      is_super_admin: manifest.is_super_admin,
      role_name: manifest.role_name,
      permissions: manifest.permissions,
      manifest,
    };
  },
};
