import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { DashboardFilter } from "../../../../../components/DashboardFilter";
import { EMPTY_DASHBOARD_FILTER, filterRowsByDashboard } from "../../../../../utils/dashboardFilter";
import { useFiscalYear } from "../../../../../context/FiscalYearContext";
import { BarChart, DonutChart, HBars, CHART_COLORS } from "../../../../../components/charts";
import { StatusBadge } from "../../../../../components/Badge";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import { MOVEMENT_LABELS, MODULE_BASE } from "../constants";
import { ProductIcon, WarehouseIcon, ProcurementIcon, LogsIcon } from "../../../../../components/icons";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function compactPKR(n) {
  if (n >= 1_000_000) return `Rs.${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `Rs.${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `Rs.${Math.round(n)}`;
}

function lastNMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: MONTH_SHORT[d.getMonth()], stockIn: 0, stockOut: 0 });
  }
  return out;
}

function buildMovementSeries(trendRows) {
  const buckets = lastNMonths(6);
  const index = new Map(buckets.map((b) => [b.key, b]));
  for (const row of trendRows || []) {
    const bucket = index.get(row.month_key);
    if (!bucket) continue;
    const qty = Number(row.total_qty) || 0;
    if (row.movement_type === "stock_in" || row.movement_type === "initial_stock") {
      bucket.stockIn += qty;
    } else if (row.movement_type === "stock_out") {
      bucket.stockOut += qty;
    }
  }
  return buckets;
}

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

export default function InventoryDashboard() {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dashFilter, setDashFilter] = useState({ ...EMPTY_DASHBOARD_FILTER });
  const fiscalYearStart = useFiscalYear();

  useEffect(() => {
    apiFetch("/inventory/dashboard", {}, authFetch)
      .then((res) => {
        setData(res);
        setLoadError("");
      })
      .catch((e) => {
        setData(null);
        setLoadError(e.message || "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  }, [authFetch]);

  const stats = data?.stats || {};
  const movements = data?.recent_movements || [];
  const transfers = data?.recent_transfers || [];

  const filteredMovements = useMemo(
    () => filterRowsByDashboard(movements, "created_at", dashFilter, fiscalYearStart),
    [movements, dashFilter, fiscalYearStart]
  );
  const filteredTransfers = useMemo(
    () => filterRowsByDashboard(transfers, "created_at", dashFilter, fiscalYearStart),
    [transfers, dashFilter, fiscalYearStart]
  );
  const movementTrend = data?.movement_trend || [];
  const movementsByType = data?.movements_by_type || [];
  const stockByCategory = data?.stock_by_category || [];
  const stockByWarehouse = data?.stock_by_warehouse || [];
  const topProducts = data?.top_products || [];
  const lowStockProducts = data?.low_stock_products || [];

  const dash = (n) => (loading ? "—" : n ?? 0);
  const money = (n) => (loading ? "—" : formatPKR(n));
  const num = (n) => (loading ? "—" : Number(n || 0).toLocaleString());

  const stockInSeries = useMemo(() => {
    const buckets = buildMovementSeries(movementTrend);
    return buckets.map((b) => ({ label: b.label, value: b.stockIn }));
  }, [movementTrend]);

  const stockOutSeries = useMemo(() => {
    const buckets = buildMovementSeries(movementTrend);
    return buckets.map((b) => ({ label: b.label, value: b.stockOut }));
  }, [movementTrend]);

  const movementTypeSegments = useMemo(
    () =>
      movementsByType
        .map((row, i) => ({
          label: MOVEMENT_LABELS[row.movement_type] || row.movement_type,
          value: Number(row.count) || 0,
          color: CHART_COLORS[i % CHART_COLORS.length],
        }))
        .filter((s) => s.value > 0),
    [movementsByType]
  );

  const productStatusSegments = useMemo(() => {
    const active = Number(stats.active_products) || 0;
    const inactive = Number(stats.inactive_products) || 0;
    return [
      { label: "Active", value: active, color: "var(--color-success)" },
      { label: "Inactive", value: inactive, color: "var(--text-muted)" },
    ].filter((s) => s.value > 0);
  }, [stats]);

  const transferStatusSegments = useMemo(() => {
    const pending = Number(stats.pending_transfers) || 0;
    const completed = Number(stats.completed_transfers) || 0;
    const cancelled = Number(stats.cancelled_transfers) || 0;
    return [
      { label: "Pending", value: pending, color: "var(--color-warning)" },
      { label: "Completed", value: completed, color: "var(--color-success)" },
      { label: "Cancelled", value: cancelled, color: "var(--text-muted)" },
    ].filter((s) => s.value > 0);
  }, [stats]);

  const categoryBars = useMemo(
    () =>
      stockByCategory.map((row) => ({
        label: row.label || "Uncategorized",
        value: Number(row.total_qty) || 0,
      })),
    [stockByCategory]
  );

  const warehouseBars = useMemo(
    () =>
      stockByWarehouse.map((row, i) => ({
        label: row.label,
        value: Number(row.total_qty) || 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [stockByWarehouse]
  );

  const warehouseValueBars = useMemo(
    () =>
      stockByWarehouse.map((row, i) => ({
        label: row.label,
        value: Number(row.value_cost) || 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [stockByWarehouse]
  );

  const stockHealthPct = useMemo(() => {
    const total = Number(stats.product_count) || 0;
    const low = Number(stats.low_stock_count) || 0;
    const out = Number(stats.out_of_stock_count) || 0;
    const healthy = Math.max(0, total - low - out);
    if (!total) return 100;
    return Math.round((healthy / total) * 100);
  }, [stats]);

  const quickLinks = useMemo(
    () => [
      { label: "Create Product", path: `${MODULE_BASE}/products/create` },
      { label: "Stock In", path: `${MODULE_BASE}/procurement/stock-in/create` },
      { label: "Stock Out", path: `${MODULE_BASE}/procurement/stock-out/create` },
      { label: "Transfers", path: `${MODULE_BASE}/procurement/transfers/create` },
      { label: "Categories", path: `${MODULE_BASE}/products/categories` },
      { label: "Warehouses", path: `${MODULE_BASE}/warehouses` },
      { label: "Movement History", path: `${MODULE_BASE}/procurement/movement-history` },
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
        title="Inventory & Procurement"
        description="Real-time overview of products, stock, warehouses, procurement activity, and transfers."
      />

      {loadError && <p className="wh-field__error">{loadError}</p>}

      <DashboardFilter
        rows={[...movements, ...transfers]}
        dateField="created_at"
        value={dashFilter}
        onChange={setDashFilter}
      />

      {/* Catalog & locations */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <Kpi
            label="Products"
            value={dash(stats.product_count)}
            hint={`${dash(stats.active_products)} active · ${dash(stats.inactive_products)} inactive`}
            tone="accent"
            icon={<ProductIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Categories"
            value={dash(stats.category_count)}
            hint={`${dash(stats.active_categories)} active`}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Warehouses"
            value={dash(stats.warehouse_count)}
            hint={`${dash(stats.active_warehouses)} active`}
            icon={<WarehouseIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Total Movements"
            value={dash(stats.total_movements)}
            hint={`${dash(stats.movements_today)} today`}
            icon={<LogsIcon />}
          />
        </div>
      </div>

      {/* Stock quantities & value */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <Kpi
            label="Total Stock"
            value={num(stats.total_stock_units)}
            hint={`${num(stats.available_units)} available`}
            tone="success"
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Reserved"
            value={num(stats.reserved_units)}
            hint="Units on hold"
            tone="warning"
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Damaged"
            value={num(stats.damaged_units)}
            hint="Unsellable units"
            tone="danger"
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Low / Out of Stock"
            value={`${dash(stats.low_stock_count)} / ${dash(stats.out_of_stock_count)}`}
            hint="≤ 5 units / zero stock"
            tone={Number(stats.out_of_stock_count) > 0 ? "danger" : "default"}
          />
        </div>
      </div>

      {/* Inventory value */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Kpi
            label="Inventory Value (Cost)"
            value={money(stats.inventory_value_cost)}
            hint="Available qty × cost price"
            icon={<ProcurementIcon />}
          />
        </div>
        <div className="wh-dash-col-4">
          <Kpi
            label="Inventory Value (Retail)"
            value={money(stats.inventory_value_retail)}
            hint="Available qty × selling total"
            tone="success"
          />
        </div>
        <div className="wh-dash-col-4">
          <Kpi
            label="Stock Health"
            value={`${stockHealthPct}%`}
            hint={`${dash(stats.low_stock_count)} low · ${dash(stats.out_of_stock_count)} out`}
            tone={stockHealthPct >= 80 ? "success" : stockHealthPct >= 50 ? "warning" : "danger"}
          />
        </div>
      </div>

      {/* 30-day procurement activity */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <Kpi
            label="Stock In (30d)"
            value={dash(stats.stock_in_30d)}
            hint={`${num(stats.stock_in_qty_30d)} units received`}
            tone="success"
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Stock Out (30d)"
            value={dash(stats.stock_out_30d)}
            hint={`${num(stats.stock_out_qty_30d)} units dispatched`}
            tone="warning"
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Transfers (30d)"
            value={dash(stats.transfers_30d)}
            hint={`${dash(stats.total_transfers)} all time`}
            icon={<ProcurementIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Transfer Movements"
            value={dash(stats.total_transfer_movements)}
            hint={`${dash(stats.pending_transfers)} pending transfers`}
          />
        </div>
      </div>

      {/* Charts row 1 — movement trends */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-6">
          <Panel title="Stock In Volume" subtitle="Units received over the last 6 months">
            <BarChart data={stockInSeries} formatValue={(v) => String(v)} />
          </Panel>
        </div>
        <div className="wh-dash-col-6">
          <Panel title="Stock Out Volume" subtitle="Units dispatched over the last 6 months">
            <BarChart data={stockOutSeries} formatValue={(v) => String(v)} />
          </Panel>
        </div>
      </div>

      {/* Charts row 2 — breakdowns */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Panel title="Movements by Type">
            {movementTypeSegments.length ? (
              <DonutChart
                segments={movementTypeSegments}
                centerValue={Number(stats.total_movements) || 0}
                centerLabel="movements"
              />
            ) : (
              <p className="wh-panel__empty">No movements recorded yet.</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Products by Status">
            {productStatusSegments.length ? (
              <DonutChart
                segments={productStatusSegments}
                centerValue={Number(stats.product_count) || 0}
                centerLabel="products"
              />
            ) : (
              <p className="wh-panel__empty">No products yet.</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Transfer Status">
            {transferStatusSegments.length ? (
              <DonutChart
                segments={transferStatusSegments}
                centerValue={Number(stats.total_transfers) || 0}
                centerLabel="transfers"
              />
            ) : (
              <p className="wh-panel__empty">No transfers yet.</p>
            )}
          </Panel>
        </div>
      </div>

      {/* Charts row 3 — stock distribution */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Panel title="Stock by Category" subtitle="Total units per category">
            {categoryBars.length ? (
              <HBars data={categoryBars} formatValue={(v) => v.toLocaleString()} />
            ) : (
              <p className="wh-panel__empty">No category data.</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Stock by Warehouse" subtitle="Total units per location">
            {warehouseBars.length ? (
              <HBars data={warehouseBars} formatValue={(v) => v.toLocaleString()} />
            ) : (
              <p className="wh-panel__empty">No warehouse data.</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Value by Warehouse" subtitle="Inventory value at cost">
            {warehouseValueBars.length ? (
              <HBars data={warehouseValueBars} formatValue={compactPKR} />
            ) : (
              <p className="wh-panel__empty">No value data.</p>
            )}
          </Panel>
        </div>
      </div>

      {/* Lists row */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Panel
            title="Recent Movements"
            subtitle="Latest stock activity"
            flush
            action={
              <Link to={`${MODULE_BASE}/procurement/movement-history`} className="wh-link">
                View all
              </Link>
            }
          >
            {filteredMovements.length === 0 ? (
              <p className="wh-panel__empty">No movements in this range.</p>
            ) : (
              <div className="wh-mini-list">
                {filteredMovements.map((m) => (
                  <div key={m.id} className="wh-mini-row">
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">
                        {m.product_name} ({m.sku})
                      </div>
                      <div className="wh-mini-row__sub">
                        {MOVEMENT_LABELS[m.movement_type] || m.movement_type} · {m.warehouse_name} ·{" "}
                        {formatDateTime(m.created_at)}
                      </div>
                    </div>
                    <span className="wh-mini-row__value">{m.qty > 0 ? `+${m.qty}` : m.qty}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel
            title="Recent Transfers"
            subtitle="Warehouse-to-warehouse"
            flush
            action={
              <Link to={`${MODULE_BASE}/procurement/transfers`} className="wh-link">
                View all
              </Link>
            }
          >
            {filteredTransfers.length === 0 ? (
              <p className="wh-panel__empty">No transfers in this range.</p>
            ) : (
              <div className="wh-mini-list">
                {filteredTransfers.map((t) => (
                  <div key={t.id} className="wh-mini-row">
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{t.product_name}</div>
                      <div className="wh-mini-row__sub">
                        {t.from_warehouse_name} → {t.to_warehouse_name} · {formatDateTime(t.created_at)}
                      </div>
                    </div>
                    <span className="wh-mini-row__value">{t.qty}</span>
                    <StatusBadge status={t.transfer_status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Quick Actions">
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

      {/* Top products & low stock */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-6">
          <Panel title="Top Products by Stock" subtitle="Highest total quantity on hand" flush>
            {topProducts.length === 0 ? (
              <p className="wh-panel__empty">No products yet.</p>
            ) : (
              <div className="wh-mini-list">
                {topProducts.map((p) => (
                  <div key={p.id} className="wh-mini-row">
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{p.product_name}</div>
                      <div className="wh-mini-row__sub">
                        {p.sku} · {p.category_name || "Uncategorized"}
                      </div>
                    </div>
                    <span className="wh-mini-row__value">{Number(p.total_qty).toLocaleString()} units</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-6">
          <Panel
            title="Low Stock Alert"
            subtitle="Products with ≤ 5 available units"
            flush
            action={
              <Link to={`${MODULE_BASE}/products/manage`} className="wh-link">
                Manage products
              </Link>
            }
          >
            {lowStockProducts.length === 0 ? (
              <p className="wh-panel__empty">All products are adequately stocked.</p>
            ) : (
              <div className="wh-mini-list">
                {lowStockProducts.map((p, i) => (
                  <div key={`${p.sku}-${i}`} className="wh-mini-row">
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{p.product_name}</div>
                      <div className="wh-mini-row__sub">
                        {p.sku} · {p.category_name || "Uncategorized"}
                      </div>
                    </div>
                    <span className="wh-mini-row__value" style={{ color: "var(--color-danger)" }}>
                      {Number(p.available_qty).toLocaleString()} left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Procurement summary footer */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-12">
          <Panel title="Procurement Summary" subtitle="Lifetime stock in vs stock out">
            <div className="wh-hbars">
              <div>
                <div className="wh-hbar__top">
                  <span className="wh-hbar__label">Stock In</span>
                  <span className="wh-hbar__val">
                    {dash(stats.total_stock_in)} events · {num(stats.total_initial_stock)} initial
                  </span>
                </div>
                <div className="wh-hbar__track">
                  <div
                    className="wh-hbar__fill"
                    style={{
                      width: `${Math.min(100, ((Number(stats.total_stock_in) || 0) / Math.max(1, (Number(stats.total_stock_in) || 0) + (Number(stats.total_stock_out) || 0))) * 100)}%`,
                      background: "var(--color-success)",
                    }}
                  />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="wh-hbar__top">
                  <span className="wh-hbar__label">Stock Out</span>
                  <span className="wh-hbar__val">{dash(stats.total_stock_out)} events</span>
                </div>
                <div className="wh-hbar__track">
                  <div
                    className="wh-hbar__fill"
                    style={{
                      width: `${Math.min(100, ((Number(stats.total_stock_out) || 0) / Math.max(1, (Number(stats.total_stock_in) || 0) + (Number(stats.total_stock_out) || 0))) * 100)}%`,
                      background: "var(--color-warning)",
                    }}
                  />
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
