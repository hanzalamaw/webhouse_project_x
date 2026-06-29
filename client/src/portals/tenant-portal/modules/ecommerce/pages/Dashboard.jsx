import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { BarChart, DonutChart, HBars, CHART_COLORS } from "../../../../../components/charts";
import { StatusBadge } from "../../../../../components/Badge";
import { formatDateTime } from "../../../../../utils/dateTime";
import { MODULE_BASE } from "../constants";
import { Kpi, Panel } from "../components/DashboardWidgets";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function lastNDays(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ key, label: DAY_LABELS[d.getDay()], total: 0, success: 0, failed: 0 });
  }
  return out;
}

export default function EcommerceDashboard() {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    apiFetch("/ecommerce/dashboard", {}, authFetch)
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
  const stores = data?.stores || [];
  const recentLogs = data?.recent_sync_logs || [];
  const syncByStatus = data?.sync_by_status || [];
  const entityByPlatform = data?.entity_by_platform || [];
  const syncTrend = data?.sync_trend || [];

  const dash = (n) => (loading ? "—" : n ?? 0);
  const num = (n) => (loading ? "—" : Number(n || 0).toLocaleString());

  const connectedStores = stores.filter((s) => s.status === "connected");

  const syncTrendSeries = useMemo(() => {
    const buckets = lastNDays(7);
    const index = new Map(buckets.map((b) => [b.key, b]));
    for (const row of syncTrend) {
      const key = row.day_key instanceof Date ? row.day_key.toISOString().slice(0, 10) : String(row.day_key).slice(0, 10);
      const bucket = index.get(key);
      if (!bucket) continue;
      bucket.total = Number(row.total) || 0;
      bucket.success = Number(row.success_count) || 0;
      bucket.failed = Number(row.failed_count) || 0;
    }
    return buckets.map((b) => ({ label: b.label, value: b.total }));
  }, [syncTrend]);

  const syncStatusSegments = useMemo(
    () =>
      syncByStatus
        .map((row, i) => ({
          label: row.status,
          value: Number(row.count) || 0,
          color: CHART_COLORS[i % CHART_COLORS.length],
        }))
        .filter((s) => s.value > 0),
    [syncByStatus],
  );

  const platformBars = useMemo(
    () =>
      entityByPlatform.map((row, i) => ({
        label: row.platform === "shopify" ? "Shopify" : row.platform === "daraz" ? "Daraz" : row.platform,
        value: Number(row.orders) + Number(row.products) + Number(row.customers),
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [entityByPlatform],
  );

  const entitySegments = useMemo(() => {
    const orders = Number(stats.synced_orders) || 0;
    const products = Number(stats.synced_products) || 0;
    const customers = Number(stats.synced_customers) || 0;
    return [
      { label: "Orders", value: orders, color: "var(--color-accent)" },
      { label: "Products", value: products, color: "var(--color-success)" },
      { label: "Customers", value: customers, color: "var(--color-warning)" },
    ].filter((s) => s.value > 0);
  }, [stats]);

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
        title="E-Commerce Integration"
        description="Overview of connected stores, synced marketplace data, and integration activity."
        actions={
          <Link to={`${MODULE_BASE}/integrations`} className="wh-btn wh-btn--primary">
            Manage integrations
          </Link>
        }
      />

      {loadError && <p className="wh-field__error">{loadError}</p>}

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <Kpi
            label="Connected Stores"
            value={dash(stats.connected_stores)}
            hint={`${dash(stats.shopify_stores)} Shopify · ${dash(stats.daraz_stores)} Daraz`}
            tone="accent"
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Synced Orders"
            value={num(stats.synced_orders)}
            hint={`${dash(stats.external_orders)} external order links`}
            tone="success"
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Synced Products"
            value={num(stats.synced_products)}
            hint="From all connected stores"
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Synced Customers"
            value={num(stats.synced_customers)}
            hint="Buyers from marketplaces"
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <Kpi
            label="Sync Events (24h)"
            value={dash(stats.sync_logs_24h)}
            hint={`${dash(stats.total_sync_logs)} all time`}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Failed Syncs (7d)"
            value={dash(stats.failed_syncs_7d)}
            hint="Includes partial syncs"
            tone={Number(stats.failed_syncs_7d) > 0 ? "danger" : "default"}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Webhooks Active"
            value={dash(stats.webhooks_active)}
            hint="Shopify live sync"
            tone={Number(stats.webhooks_active) > 0 ? "success" : "warning"}
          />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Last Synced"
            value={stats.last_synced_at ? formatDateTime(stats.last_synced_at) : "—"}
            hint="Most recent store activity"
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-6">
          <Panel title="Sync Activity" subtitle="Events over the last 7 days">
            {syncTrendSeries.some((d) => d.value > 0) ? (
              <BarChart data={syncTrendSeries} formatValue={(v) => String(v)} />
            ) : (
              <p className="wh-panel__empty">No sync activity in the last 7 days.</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-3">
          <Panel title="Synced Entities">
            {entitySegments.length ? (
              <DonutChart
                segments={entitySegments}
                centerValue={
                  (Number(stats.synced_orders) || 0) +
                  (Number(stats.synced_products) || 0) +
                  (Number(stats.synced_customers) || 0)
                }
                centerLabel="records"
              />
            ) : (
              <p className="wh-panel__empty">No synced data yet. Connect a store to begin.</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-3">
          <Panel title="Sync Status (30d)">
            {syncStatusSegments.length ? (
              <DonutChart
                segments={syncStatusSegments}
                centerValue={syncStatusSegments.reduce((a, s) => a + s.value, 0)}
                centerLabel="events"
              />
            ) : (
              <p className="wh-panel__empty">No sync logs yet.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-6">
          <Panel
            title="Connected Stores"
            subtitle="Marketplace connections for this tenant"
            flush
            action={
              <Link to={`${MODULE_BASE}/integrations`} className="wh-link">
                Manage
              </Link>
            }
          >
            {connectedStores.length === 0 ? (
              <p className="wh-panel__empty">
                No stores connected.{" "}
                <Link to={`${MODULE_BASE}/integrations`} className="wh-link">
                  Connect Shopify or Daraz
                </Link>
              </p>
            ) : (
              <div className="wh-mini-list">
                {connectedStores.map((store) => (
                  <div key={store.id} className="wh-mini-row">
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{store.store_name}</div>
                      <div className="wh-mini-row__sub">
                        {store.platform} · {store.store_url} ·{" "}
                        {store.last_synced_at ? formatDateTime(store.last_synced_at) : "Never synced"}
                      </div>
                    </div>
                    <span className="wh-mini-row__value">
                      {store.order_count}o · {store.product_count}p · {store.customer_count}c
                    </span>
                    <StatusBadge status={store.initial_sync_status || store.status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-6">
          <Panel title="Records by Platform" subtitle="Synced entity totals per marketplace">
            {platformBars.length ? (
              <HBars data={platformBars} formatValue={(v) => v.toLocaleString()} />
            ) : (
              <p className="wh-panel__empty">No platform data yet.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <Panel
            title="Recent Sync Log"
            subtitle="Latest integration events across all stores"
            flush
            action={
              <Link to={`${MODULE_BASE}/integrations`} className="wh-link">
                View integrations
              </Link>
            }
          >
            {recentLogs.length === 0 ? (
              <p className="wh-panel__empty">No sync events recorded yet.</p>
            ) : (
              <div className="wh-mini-list">
                {recentLogs.map((log, i) => (
                  <div key={`${log.synced_at}-${i}`} className="wh-mini-row">
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{log.sync_type}</div>
                      <div className="wh-mini-row__sub">
                        {log.store_name} ({log.platform}) · {formatDateTime(log.synced_at)}
                      </div>
                    </div>
                    <StatusBadge status={log.status} />
                    {log.message && (
                      <span className="wh-mini-row__value" style={{ flex: "1 1 100%", fontWeight: 400 }}>
                        {log.message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Quick Actions">
            <ul className="wh-list">
              <li>
                <Link to={`${MODULE_BASE}/integrations`} className="wh-link">
                  Connect Shopify
                </Link>
              </li>
              <li>
                <Link to={`${MODULE_BASE}/integrations`} className="wh-link">
                  Connect Daraz
                </Link>
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
