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
import { useState } from "react";
import { DashboardFilter } from "../../../../../components/DashboardFilter";
import { EMPTY_DASHBOARD_FILTER } from "../../../../../utils/dashboardFilter";

function PlaceholderDashboard({ title, description }) {
  const [dashFilter, setDashFilter] = useState({ ...EMPTY_DASHBOARD_FILTER });
  return (
    <div className="wh-page wh-page--wide">
      <DashboardFilter rows={[]} value={dashFilter} onChange={setDashFilter} />
      <ModulePlaceholder title={title} description={description} />
    </div>
  );
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
    <PlaceholderDashboard
      title="E-Commerce Integration"
      description="E-Commerce Integration module — functionality coming in a later update."
    />
  );
}
