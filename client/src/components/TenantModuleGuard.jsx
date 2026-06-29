import { Navigate } from "react-router-dom";
import { useTenantModules } from "../portals/tenant-portal/hooks/useTenantModules";
import { useAuth } from "../context/AuthContext";
import { canViewModuleSlug } from "../utils/tenantPermissions";

export default function TenantModuleGuard({ moduleSlug, children }) {
  const { visible, loading: modulesLoading } = useTenantModules();
  const { user, loading: authLoading } = useAuth();

  if (modulesLoading || authLoading) return null;

  const assigned = visible.some((mod) => mod.slug === moduleSlug);
  const permitted = canViewModuleSlug(user, moduleSlug);

  if (!assigned || !permitted) return <Navigate to="/app" replace />;

  return children;
}
