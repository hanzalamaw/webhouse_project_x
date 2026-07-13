import { Navigate } from "react-router-dom";
import { useTenantModules } from "../portals/tenant-portal/hooks/useTenantModules";
import { useAuth } from "../context/AuthContext";
import { canViewModuleSlug } from "../utils/tenantPermissions";
import TenantRouteLoading from "./TenantRouteLoading";

export default function TenantModuleGuard({ moduleSlug, children }) {
  const { visible, loading: modulesLoading } = useTenantModules();
  const { user, loading: authLoading } = useAuth();

  if ((authLoading && !user) || modulesLoading) {
    return <TenantRouteLoading label="Opening module…" />;
  }

  const assigned = visible.some((mod) => mod.slug === moduleSlug);
  const permitted = canViewModuleSlug(user, moduleSlug);

  if (!assigned || !permitted) return <Navigate to="/app" replace />;

  return children;
}
