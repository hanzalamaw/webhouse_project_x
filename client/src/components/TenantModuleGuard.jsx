import { Navigate } from "react-router-dom";
import { useTenantModules } from "../portals/tenant-portal/hooks/useTenantModules";

export default function TenantModuleGuard({ moduleSlug, children }) {
  const { visible, loading } = useTenantModules();

  if (loading) return null;

  const allowed = visible.some((mod) => mod.slug === moduleSlug);
  if (!allowed) return <Navigate to="/app" replace />;

  return children;
}
