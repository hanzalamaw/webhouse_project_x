import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/Button";
import { useAuth } from "../../../context/AuthContext";
import { moduleBasePath, TENANT_MODULE_DEFINITIONS } from "../modules/registry";
import { useTenantModules } from "../hooks/useTenantModules";
import heroImage from "../../../assets/Main top-right Image.png";
import adminImage from "../../../assets/Admin.png";
import logisticsImage from "../../../assets/Logistics Partners.png";
import orderImage from "../../../assets/Order Management.png";
import posImage from "../../../assets/POS.png";
import crmImage from "../../../assets/CRM.png";
import ecommerceImage from "../../../assets/E-Commerce Integration.png";
import financeImage from "../../../assets/Finance & Accounting.png";
import inventoryImage from "../../../assets/Inventory & Procurement.png";
import "./ModuleHub.css";

const MODULE_IMAGES = {
  admin: adminImage,
  "logistics-partners": logisticsImage,
  "order-management": orderImage,
  pos: posImage,
  crm: crmImage,
  ecommerce: ecommerceImage,
  finance: financeImage,
  "inventory-procurement": inventoryImage,
};

const MODULE_DESCRIPTIONS = {
  admin: "Users, roles, permissions and organization settings.",
  "logistics-partners": "Courier integrations, tracking and pickup management.",
  "order-management": "Create, process and manage customer orders.",
  pos: "In-store sales, terminals and cash management.",
  crm: "Leads, customers and communication records.",
  ecommerce: "Connect Shopify, WooCommerce and marketplaces.",
  finance: "Expenses, transactions and financial reporting.",
  "inventory-procurement": "Products, warehouses and stock operations.",
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function getDisplayName(user) {
  const name = user?.name || user?.username || "";
  return name.split(" ")[0] || "there";
}

function getModuleNumber(slug) {
  const index = TENANT_MODULE_DEFINITIONS.findIndex((m) => m.slug === slug);
  return index >= 0 ? index + 1 : null;
}

export default function ModuleHub() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { visible, loading, error } = useTenantModules();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return visible;
    return visible.filter((mod) => {
      const description = MODULE_DESCRIPTIONS[mod.slug] || "";
      return (
        mod.name.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query)
      );
    });
  }, [visible, search]);

  return (
    <div className="wh-module-hub">
      {user?.impersonating && (
        <div className="wh-impersonation-banner wh-module-hub__banner">
          <span>
            You are impersonating <strong>{user.tenant_name}</strong> (admin support session).
          </span>
          <Button type="button" variant="secondary" className="wh-btn--sm" onClick={logout}>
            End session
          </Button>
        </div>
      )}

      <div className="wh-module-hub__center">
        <div className="wh-module-hub__inner">
        <header className="wh-module-hub__header">
          <div className="wh-module-hub__intro">
            <p className="wh-module-hub__greeting">
              <span className="wh-module-hub__greeting-icon" aria-hidden>
                <svg viewBox="0 0 14 14" fill="none">
                  <path d="M7 0L14 7L7 14L0 7L7 0Z" fill="currentColor" />
                </svg>
              </span>
              {getGreeting()}, {getDisplayName(user)} 👋
            </p>
            <h1 className="wh-module-hub__title">Select a Module</h1>
            <p className="wh-module-hub__subtitle">
              Everything you need to run your business from one place.
            </p>
            <div className="wh-module-hub__search">
              <span className="wh-module-hub__search-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </span>
              <input
                type="search"
                className="wh-module-hub__search-input"
                placeholder="Search modules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search modules"
              />
            </div>
          </div>
          <div className="wh-module-hub__hero" aria-hidden>
            <img src={heroImage} alt="" className="wh-module-hub__hero-img" />
          </div>
        </header>

        {error && <p className="wh-field__error">{error}</p>}
        {loading && <p className="wh-module-hub__status">Loading modules…</p>}

        {!loading && !error && visible.length === 0 && (
          <p className="wh-module-hub__status">No modules are enabled for your organization yet.</p>
        )}

        {!loading && visible.length > 0 && filtered.length === 0 && (
          <p className="wh-module-hub__status">No modules match your search.</p>
        )}

        {!loading && filtered.length > 0 && (
          <div className="wh-module-grid">
            {filtered.map((mod) => {
              const number = getModuleNumber(mod.slug);
              return (
                <button
                  key={mod.slug}
                  type="button"
                  className="wh-module-card"
                  onClick={() => navigate(`${moduleBasePath(mod.slug)}/dashboard`)}
                >
                  <img
                    src={MODULE_IMAGES[mod.slug]}
                    alt=""
                    className="wh-module-card__image"
                  />
                  <div className="wh-module-card__content">
                    <h2 className="wh-module-card__title">
                      {number}. {mod.name}
                    </h2>
                    <p className="wh-module-card__desc">
                      {MODULE_DESCRIPTIONS[mod.slug]}
                    </p>
                  </div>
                  <span className="wh-module-card__arrow" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <footer className="wh-module-hub__footer">
          <span className="wh-module-hub__footer-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2 4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 2.18 6 2.25v4.66c0 4.16-2.84 8.02-6 9.01-3.16-.99-6-3.85-6-9.01V6.43l6-2.25z" />
            </svg>
          </span>
          Secure. Scalable. Built for Growth.
        </footer>
        </div>
      </div>
    </div>
  );
}
