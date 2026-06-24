import { Outlet, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../Button";
import TenantSidebar from "./TenantSidebar";
import "./MainLayout.css";

export default function TenantLayout() {
  const { moduleId } = useParams();
  const { user, logout } = useAuth();

  return (
    <div className="wh-layout">
      <div className="wh-layout-wrapper">
        <TenantSidebar moduleId={moduleId} />
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
