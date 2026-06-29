import { Outlet, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { FiscalYearProvider } from "../../context/FiscalYearContext";
import TenantSidebar from "./TenantSidebar";
import { getModuleBySlug } from "../../portals/tenant-portal/modules/registry";
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
  const fullScreen = Boolean(getModuleBySlug(moduleSlug)?.fullScreen);

  if (fullScreen) {
    return (
      <FiscalYearProvider>
        <div className="wh-layout wh-layout--fullscreen">
          <Outlet />
        </div>
      </FiscalYearProvider>
    );
  }

  return (
    <FiscalYearProvider>
      <div className="wh-layout">
        <div className="wh-layout-wrapper">
          <TenantSidebar moduleSlug={moduleSlug} />
          <div className="wh-layout-main">
            <main className="wh-layout-content">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </FiscalYearProvider>
  );
}
