import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { hasPermission, moduleNameFromSlug } from "../utils/tenantPermissions";

export function useModulePermission(moduleSlug = "admin") {
  const { user } = useAuth();
  const moduleName = useMemo(() => moduleNameFromSlug(moduleSlug), [moduleSlug]);

  const can = useMemo(
    () => (action) => (moduleName ? hasPermission(user, moduleName, action) : false),
    [user, moduleName]
  );

  return {
    can,
    moduleName,
    canView: can("view"),
    canCreate: can("create"),
    canEdit: can("edit"),
    canDelete: can("delete"),
    canExport: can("export"),
    readOnly: !hasPermission(user, moduleName, "edit") && !hasPermission(user, moduleName, "create"),
    isSuperAdmin: Boolean(user?.is_super_admin || user?.impersonating),
  };
}
