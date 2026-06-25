import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { getTenantMenuItems, TENANT_FOOTER_ITEMS, ChevronIcon } from "../../portals/tenant-portal/navConfig";
import { HamburgerIcon } from "../icons";
import { Toggle } from "../Toggle";
import "./Sidebar.css";

const SIDEBAR_EXPANDED_KEY = "tenant_sidebar_expanded";

function readSidebarExpanded() {
  try {
    return sessionStorage.getItem(SIDEBAR_EXPANDED_KEY) !== "0";
  } catch {
    return true;
  }
}

function isPathActive(pathname, path) {
  if (path === "/app") return pathname === "/app";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isGroupActive(pathname, item) {
  if (item.path) return isPathActive(pathname, item.path);
  return item.children?.some((c) => isPathActive(pathname, c.path));
}

export default function TenantSidebar({ moduleSlug }) {
  const [isExpanded, setIsExpanded] = useState(readSidebarExpanded);
  const [openGroups, setOpenGroups] = useState({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const drawerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();

  const menuItems = useMemo(() => getTenantMenuItems(moduleSlug), [moduleSlug]);
  const logoutRedirect = `/${user?.login_portal || "erp1"}`;

  useEffect(() => {
    const next = {};
    for (const item of menuItems) {
      if (item.children?.some((c) => isPathActive(location.pathname, c.path))) {
        next[item.id] = true;
      }
    }
    if (Object.keys(next).length) {
      setOpenGroups((prev) => ({ ...prev, ...next }));
    }
  }, [location.pathname, menuItems]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SIDEBAR_EXPANDED_KEY, isExpanded ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [isExpanded]);

  useEffect(() => {
    const width = isMobile ? 0 : isExpanded ? 220 : 64;
    document.documentElement.style.setProperty("--wh-sidebar-width", `${width}px`);
    return () => {
      document.documentElement.style.removeProperty("--wh-sidebar-width");
    };
  }, [isExpanded, isMobile]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setMobileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (isMobile) document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, isMobile]);

  const handleLogout = async () => {
    await logout();
    navigate(logoutRedirect);
  };

  const handleNavigate = (path) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const toggleGroup = (id) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNavItem = (item, nested = false) => {
    const Icon = item.icon;
    const active = isGroupActive(location.pathname, item);
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const groupOpen = openGroups[item.id] ?? active;

    if (hasChildren) {
      return (
        <li key={item.id} className={`wh-nav-item wh-nav-item--group${active ? " active" : ""}`}>
          <button
            type="button"
            className={`wh-nav-link${active ? " active" : ""}`}
            onClick={() => (isExpanded || isMobile ? toggleGroup(item.id) : setIsExpanded(true))}
            title={!isExpanded && !isMobile ? item.label : undefined}
          >
            <span className="wh-nav-icon">{Icon && <Icon />}</span>
            {(isExpanded || isMobile) && (
              <>
                <span className="wh-nav-label">{item.label}</span>
                <span className="wh-nav-chevron">
                  <ChevronIcon direction={groupOpen ? "down" : "right"} />
                </span>
              </>
            )}
          </button>
          {(isExpanded || isMobile) && groupOpen && (
            <ul className="wh-nav-sublist">
              {item.children.map((child) => (
                <li key={child.id} className={isPathActive(location.pathname, child.path) ? "active" : ""}>
                  <button
                    type="button"
                    className={`wh-nav-sublink${isPathActive(location.pathname, child.path) ? " active" : ""}`}
                    onClick={() => handleNavigate(child.path)}
                  >
                    {child.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </li>
      );
    }

    return (
      <li key={item.id} className={`wh-nav-item${active ? " active" : ""}${nested ? " wh-nav-item--nested" : ""}`}>
        <button
          type="button"
          className={`wh-nav-link${active ? " active" : ""}`}
          onClick={() => handleNavigate(item.path)}
          title={!isExpanded && !isMobile ? item.label : undefined}
        >
          <span className="wh-nav-icon">{Icon && <Icon />}</span>
          {(isExpanded || isMobile) && <span className="wh-nav-label">{item.label}</span>}
        </button>
      </li>
    );
  };

  const profileBlock = (
    <div className="wh-sidebar-profile">
      <div className="wh-profile-avatar">
        <span>{(user?.name || "U").charAt(0).toUpperCase()}</span>
      </div>
      {(isExpanded || isMobile) && (
        <div className="wh-profile-info">
          <span className="wh-profile-name">{(user?.name || "USER").toUpperCase()}</span>
          <span className="wh-profile-role">{(user?.tenant_name || "WORKSPACE").toUpperCase()}</span>
        </div>
      )}
    </div>
  );

  const footerBlock = (
    <div className="wh-sidebar-footer">
      <button type="button" className="wh-footer-link wh-footer-link--danger" onClick={handleLogout}>
        <TENANT_FOOTER_ITEMS.logout.icon />
        {(isExpanded || isMobile) && <span>{TENANT_FOOTER_ITEMS.logout.label}</span>}
      </button>
      {(isExpanded || isMobile) ? (
        <div className="wh-footer-toggle">
          <TENANT_FOOTER_ITEMS.nightMode.icon />
          <span>{TENANT_FOOTER_ITEMS.nightMode.label}</span>
          <Toggle checked={darkMode} onChange={toggleDarkMode} />
        </div>
      ) : (
        <button type="button" className="wh-footer-link" onClick={toggleDarkMode} title="Night Mode">
          <TENANT_FOOTER_ITEMS.nightMode.icon />
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        {!mobileOpen && (
          <button className="wh-mobile-fab" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <HamburgerIcon isOpen={false} />
          </button>
        )}
        <div className={`wh-mobile-overlay${mobileOpen ? " visible" : ""}`} onClick={() => setMobileOpen(false)} />
        <aside ref={drawerRef} className={`wh-mobile-drawer${mobileOpen ? " open" : ""}`}>
          {profileBlock}
          <nav className="wh-sidebar-nav">
            <ul className="wh-nav-list">{menuItems.map((item) => renderNavItem(item))}</ul>
          </nav>
          {footerBlock}
        </aside>
      </>
    );
  }

  return (
    <aside className={`wh-sidebar${isExpanded ? " expanded" : " collapsed"}`}>
      <button
        type="button"
        className="wh-toggle-btn"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
      >
        <ChevronIcon direction={isExpanded ? "left" : "right"} />
      </button>
      <div className="wh-sidebar-top">{profileBlock}</div>
      <nav className="wh-sidebar-nav">
        <ul className="wh-nav-list">{menuItems.map((item) => renderNavItem(item))}</ul>
      </nav>
      {footerBlock}
    </aside>
  );
}
