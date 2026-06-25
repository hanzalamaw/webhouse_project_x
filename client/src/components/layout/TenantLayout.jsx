import { Outlet, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../Button";
import TenantSidebar from "./TenantSidebar";
import "./MainLayout.css";

function moduleSlugFromPath(pathname) {
  const match = String(pathname || "").match(/^\/app\/m\/([^/]+)/);
  return match?.[1] ?? null;
}

export default function TenantLayout() {
  const location = useLocation();
  const moduleSlug = useMemo(
    () => moduleSlugFromPath(location.pathname),
    [location.pathname]
  );
  const { user, logout } = useAuth();

  return (
    <div className="wh-layout">
      <div className="wh-layout-wrapper">
        <TenantSidebar moduleSlug={moduleSlug} />
        <div className="wh-layout-main">
          <main className="wh-layout-content">
            {user?.impersonating && (
              <div className="wh-impersonation-banner">
                <span>
                  You are impersonating <strong>{user.tenant_name}</strong> (admin support session).
                </span>
                <Button type="button" variant="secondary" className="wh-btn--sm" onClick={logout}>
                  End session
                </Button>
              </div>
            )}
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
