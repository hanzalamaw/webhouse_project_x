import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { BarChart, DonutChart, HBars, CHART_COLORS } from "../../../../../components/charts";
import { StatusBadge } from "../../../../../components/Badge";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import { inDateRange } from "../../../../../utils/tableFilters";
import { MODULE_BASE, CUSTOMER_TYPE_LABELS, LEAD_SOURCE_LABELS } from "../constants";
import { TenantsIcon, SupportIcon, LogsIcon, ImpersonateIcon } from "../../../../../components/icons";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LEAD_STATUS_COLORS = {
  new: "var(--color-accent)",
  contacted: "var(--color-warning)",
  qualified: "var(--color-success)",
  lost: "var(--color-danger)",
  converted: "var(--color-success)",
};

function lastNMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MONTH_LABELS[d.getMonth()],
      value: 0,
    });
  }
  return out;
}

function KpiCard({ label, value, hint, icon, tone = "default" }) {
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

function Panel({ title, subtitle, action, flush, children }) {
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

export default function CrmDashboard() {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allTime, setAllTime] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const range = useMemo(() => ({ allTime, dateFrom, dateTo }), [allTime, dateFrom, dateTo]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch("/crm/dashboard", {}, authFetch)
      .then((res) => {
        if (!active) return;
        setData(res);
        setError("");
      })
      .catch((e) => {
        if (!active) return;
        setData(null);
        setError(e.message || "Failed to load dashboard");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authFetch]);

  const stats = data?.stats || {};
  const activeDays = stats.active_customer_days || 30;
  const dash = (n) => (loading ? "—" : n ?? 0);
  const pct = (n) => (loading ? "—" : `${n ?? 0}%`);
  const money = (n) => (loading ? "—" : formatPKR(n));

  const growthSeries = useMemo(() => {
    const buckets = lastNMonths(6);
    const index = new Map(buckets.map((b) => [b.key, b]));
    for (const row of data?.customer_growth || []) {
      const bucket = index.get(row.month_key);
      if (bucket) bucket.value = Number(row.count) || 0;
    }
    return buckets.map((b) => ({ label: b.label, value: b.value }));
  }, [data?.customer_growth]);

  const sourceSegments = useMemo(
    () =>
      (data?.leads_by_source || []).map((r, i) => ({
        label: LEAD_SOURCE_LABELS[r.label] || r.label,
        value: Number(r.count) || 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [data?.leads_by_source]
  );

  const statusSegments = useMemo(
    () =>
      (data?.leads_by_status || []).map((r) => ({
        label: r.label,
        value: Number(r.count) || 0,
        color: LEAD_STATUS_COLORS[r.label] || "var(--text-muted)",
      })),
    [data?.leads_by_status]
  );

  const statusBars = useMemo(
    () =>
      (data?.leads_by_status || []).map((r) => ({
        label: r.label,
        value: Number(r.count) || 0,
        color: LEAD_STATUS_COLORS[r.label] || "var(--color-accent)",
      })),
    [data?.leads_by_status]
  );

  const filteredActivities = useMemo(() => {
    const rows = data?.recent_activities || [];
    if (range.allTime) return rows;
    return rows.filter((r) => inDateRange(r.created_at, range));
  }, [data?.recent_activities, range]);

  const recentActivities = useMemo(
    () =>
      [...filteredActivities]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 6),
    [filteredActivities]
  );

  const topCustomers = data?.top_customers || [];
  const totalLeads = Number(stats.total_leads) || 0;
  const conversionRate = Number(stats.lead_conversion_rate) || 0;

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Dashboard"
        description={`CRM overview — customers, leads, and support. Active customers placed an order in the last ${activeDays} days.`}
      />

      {error && <div className="wh-alert wh-alert--error">{error}</div>}

      <div className="wh-dash-filter">
        <label className="wh-dash-filter__label">
          <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} />
          All time
        </label>
        <div className="wh-dash-filter__dates">
          <input
            type="date"
            value={dateFrom}
            disabled={allTime}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="From date"
          />
          <span className="wh-dash-filter__sep">to</span>
          <input
            type="date"
            value={dateTo}
            disabled={allTime}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard
            label="Total Customers"
            value={dash(stats.total_customers)}
            hint={`${dash(stats.status_active_customers)} status active`}
            icon={<TenantsIcon />}
            tone="accent"
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Active Customers"
            value={dash(stats.active_customers)}
            hint={`Ordered in last ${activeDays} days`}
            icon={<TenantsIcon />}
            tone="success"
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="New Leads (30d)"
            value={dash(stats.new_leads_30d)}
            hint={`${dash(stats.converted_leads)} converted all-time`}
            icon={<LogsIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Open Complaints"
            value={dash(stats.open_complaints)}
            hint="Open or in progress"
            icon={<SupportIcon />}
            tone={Number(stats.open_complaints) > 0 ? "warning" : "default"}
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard
            label="Lead Conversion"
            value={pct(conversionRate)}
            hint={`${dash(stats.converted_leads)} of ${dash(totalLeads)} leads`}
            icon={<ImpersonateIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Customers This Month"
            value={dash(stats.customers_this_month)}
            icon={<TenantsIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Total Leads"
            value={dash(totalLeads)}
            icon={<LogsIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Top Customer Revenue"
            value={topCustomers.length ? money(topCustomers[0].total_revenue) : money(0)}
            hint={topCustomers[0]?.customer_name || "No orders in period"}
            icon={<TenantsIcon />}
            tone={topCustomers.length ? "accent" : "default"}
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <Panel title="Customer Growth" subtitle="New customers over the last 6 months">
            <BarChart data={growthSeries} formatValue={(v) => String(v)} />
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Leads by Source">
            {sourceSegments.length ? (
              <DonutChart
                segments={sourceSegments}
                centerValue={sourceSegments.reduce((s, x) => s + x.value, 0)}
                centerLabel="leads"
              />
            ) : (
              <p className="wh-panel__empty">No leads yet</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Panel title="Lead Pipeline">
            {statusSegments.length ? (
              <DonutChart
                segments={statusSegments}
                centerValue={statusSegments.reduce((s, x) => s + x.value, 0)}
                centerLabel="leads"
              />
            ) : (
              <p className="wh-panel__empty">No leads in pipeline</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Leads by Status">
            {statusBars.length ? (
              <HBars data={statusBars} />
            ) : (
              <p className="wh-panel__empty">No lead status data</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Recent Activity" flush>
            {loading ? (
              <p className="wh-panel__empty">Loading…</p>
            ) : recentActivities.length ? (
              <div className="wh-mini-list">
                {recentActivities.map((a) => (
                  <div className="wh-mini-row" key={a.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{a.summary}</div>
                      <div className="wh-mini-row__sub">
                        {a.user_name || "System"} · {formatDateTime(a.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No activity in range</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <Panel title="Top Customers" subtitle={`By revenue in the last ${activeDays} days`} flush>
            {loading ? (
              <p className="wh-panel__empty">Loading…</p>
            ) : topCustomers.length ? (
              <div className="wh-mini-list">
                {topCustomers.map((c) => (
                  <div className="wh-mini-row" key={c.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">
                        <Link to={`${MODULE_BASE}/customers/${c.id}`}>{c.customer_name}</Link>
                        {c.company_name && (
                          <span className="wh-muted"> — {c.company_name}</span>
                        )}
                      </div>
                      <div className="wh-mini-row__sub">
                        {CUSTOMER_TYPE_LABELS[c.customer_type] || c.customer_type} · {c.transaction_count} transactions
                      </div>
                    </div>
                    <span className="wh-mini-row__value">{formatPKR(c.total_revenue)}</span>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No customer orders in this period</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Lead Conversion" subtitle="Share of leads converted to customers">
            <div className="wh-hbars">
              <div>
                <div className="wh-hbar__top">
                  <span className="wh-hbar__label">Conversion rate</span>
                  <span className="wh-hbar__val">{pct(conversionRate)}</span>
                </div>
                <div className="wh-hbar__track">
                  <div
                    className="wh-hbar__fill"
                    style={{
                      width: `${Math.min(100, conversionRate)}%`,
                      background:
                        conversionRate >= 50
                          ? "var(--color-success)"
                          : conversionRate >= 25
                            ? "var(--color-warning)"
                            : "var(--color-accent)",
                    }}
                  />
                </div>
              </div>
            </div>
            <p className="wh-muted wh-mt">
              {dash(stats.converted_leads)} converted · {dash(totalLeads)} total leads
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
