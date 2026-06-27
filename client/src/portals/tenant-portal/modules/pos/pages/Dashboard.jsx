import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { StatusBadge } from "../../../../../components/Badge";
import { HBars } from "../../../../../components/charts";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import { MODULE_BASE } from "../constants";
import { TenantsIcon, ProductIcon, LogsIcon, SubscriptionIcon } from "../../../../../components/icons";

function Kpi({ label, value, hint, tone = "default", icon }) {
  return (
    <div className={`wh-kpi wh-kpi--${tone}`}>
      <div className="wh-kpi__top">
        <span className="wh-kpi__label">{label}</span>
        {icon && <span className="wh-kpi__icon">{icon}</span>}
      </div>
      <span className="wh-kpi__value">{value}</span>
      {hint && <span className="wh-kpi__hint">{hint}</span>}
    </div>
  );
}

function Panel({ title, subtitle, children, flush, action }) {
  return (
    <div className="wh-panel">
      <div className="wh-panel__head">
        <div>
          <h3 className="wh-panel__title">{title}</h3>
          {subtitle && <p className="wh-panel__subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={`wh-panel__body${flush ? " wh-panel__body--flush" : ""}`}>{children}</div>
    </div>
  );
}

export default function PosDashboard() {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch("/pos/dashboard", {}, authFetch),
      fetchAllTableRows("/pos/sales", authFetch).catch(() => []),
    ])
      .then(([res, saleRows]) => {
        if (!active) return;
        setData(res);
        setSales(saleRows);
        setError("");
      })
      .catch((e) => {
        if (!active) return;
        setData(null);
        setSales([]);
        setError(e.message || "Failed to load dashboard");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [authFetch]);

  const stats = data?.stats || {};
  const dash = (n) => (loading ? "—" : n ?? 0);
  const money = (n) => (loading ? "—" : formatPKR(n));

  const salesByStore = useMemo(() => {
    const map = new Map();
    for (const s of sales) {
      const key = s.outlet_name || "Unknown";
      map.set(key, (map.get(key) || 0) + Number(s.payable_amount || 0));
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [sales]);

  const quickLinks = useMemo(
    () => [
      { label: "Manage stores", path: `${MODULE_BASE}/stores/manage` },
      { label: "Create store", path: `${MODULE_BASE}/stores/create` },
      { label: "View sales", path: `${MODULE_BASE}/sales` },
      { label: "Cash registers", path: `${MODULE_BASE}/registers` },
      { label: "Open POS Terminal", path: "/app/m/pos-terminal/checkout" },
      { label: "Manage products", path: `${MODULE_BASE}/products/manage` },
      { label: "Create product", path: `${MODULE_BASE}/products/create` },
    ],
    []
  );

  if (loading) {
    return (
      <div className="wh-page wh-page--wide">
        <p className="wh-muted">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="POS"
        description="Stores, terminals, register shifts, and in-store sales. Products come from Inventory & Procurement."
      />

      {error && <p className="wh-field__error">{error}</p>}

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <Kpi
            label="Sales today"
            value={dash(stats.sales_today)}
            hint="Completed transactions today"
            tone="accent"
            icon={<LogsIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Revenue today"
            value={money(stats.revenue_today)}
            hint="Payable amount collected"
            tone="success"
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Open registers"
            value={dash(stats.open_registers)}
            hint="Active cashier shifts"
            tone="warning"
            icon={<SubscriptionIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Total sales"
            value={dash(stats.total_sales)}
            hint="All time"
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <Kpi
            label="Stores"
            value={dash(stats.outlet_count)}
            hint="Store locations"
            icon={<TenantsIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Terminals"
            value={dash(stats.terminal_count)}
            hint="Registered devices"
            icon={<ProductIcon />}
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <Panel
            title="Recent sales"
            subtitle="Latest checkout transactions"
            flush
            action={
              <Link to={`${MODULE_BASE}/sales`} className="wh-link">
                View all
              </Link>
            }
          >
            {(data?.recent_sales || []).length ? (
              <div className="wh-mini-list">
                {data.recent_sales.map((s) => (
                  <div className="wh-mini-row" key={s.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{s.sale_no}</div>
                      <div className="wh-mini-row__sub">
                        {s.outlet_name} · {s.terminal_name} · {s.cashier_name}
                      </div>
                      <div className="wh-mini-row__sub">{formatDateTime(s.created_at)}</div>
                    </div>
                    <span className="wh-mini-row__value">{formatPKR(s.payable_amount)}</span>
                    <StatusBadge status={s.payment_status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No sales yet. Complete a sale in POS Terminal.</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Revenue by store" subtitle="All-time payable amount">
            {salesByStore.length ? (
              <HBars data={salesByStore} formatValue={formatPKR} />
            ) : (
              <p className="wh-panel__empty">No sales data yet.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Panel title="Quick actions">
            <ul className="wh-list">
              {quickLinks.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="wh-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
