import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { fetchAllTableRows } from "../../../api/client";
import { PageHeader } from "../../../components/PageHeader";
import { BarChart, DonutChart, HBars } from "../../../components/charts";
import { StatusBadge } from "../../../components/Badge";
import { formatPKR } from "../../../utils/currency";
import { formatDate } from "../../../utils/dateTime";
import { DashboardFilter } from "../../../components/DashboardFilter";
import { EMPTY_DASHBOARD_FILTER, filterRowsByDashboard } from "../../../utils/dashboardFilter";
import {
  TenantsIcon,
  SubscriptionIcon,
  SupportIcon,
  ModuleIcon,
  ImpersonateIcon,
} from "../../../components/icons";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_LABELS[d.getMonth()], value: 0 });
  }
  return out;
}

function bucketByMonth(rows, dateField, valueFn, months = 6) {
  const buckets = lastNMonths(months);
  const index = new Map(buckets.map((b) => [b.key, b]));
  for (const row of rows) {
    const raw = row[dateField];
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = index.get(key);
    if (bucket) bucket.value += valueFn(row);
  }
  return buckets;
}

function countBy(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const key = (row[field] ?? "—") || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function filterByRange(rows, field, range) {
  return filterRowsByDashboard(rows, field, range, null);
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

export default function Dashboard() {
  const { authFetch } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashFilter, setDashFilter] = useState({ ...EMPTY_DASHBOARD_FILTER });

  const fTenants = useMemo(() => filterByRange(tenants, "created_at", dashFilter), [tenants, dashFilter]);
  const fPayments = useMemo(() => filterByRange(payments, "received_at", dashFilter), [payments, dashFilter]);
  const fTickets = useMemo(() => filterByRange(tickets, "created_at", dashFilter), [tickets, dashFilter]);
  const fSessions = useMemo(() => filterByRange(sessions, "login_at", dashFilter), [sessions, dashFilter]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [tenantRows, paymentRows, ticketRows, sessionRows, planRows, moduleRows] =
        await Promise.all([
          fetchAllTableRows("/tenants", authFetch).catch(() => []),
          fetchAllTableRows("/transactions/payments", authFetch).catch(() => []),
          fetchAllTableRows("/support-tickets", authFetch).catch(() => []),
          fetchAllTableRows("/sessions?active=false", authFetch).catch(() => []),
          fetchAllTableRows("/subscriptions", authFetch).catch(() => []),
          fetchAllTableRows("/modules", authFetch).catch(() => []),
        ]);
      if (!active) return;
      setTenants(tenantRows);
      setPayments(paymentRows);
      setTickets(ticketRows);
      setSessions(sessionRows);
      setPlans(planRows);
      setModules(moduleRows);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [authFetch]);

  const revenueSeries = useMemo(
    () => bucketByMonth(fPayments, "received_at", (r) => Number(r.total_received) || 0, 6),
    [fPayments]
  );

  const signupSeries = useMemo(
    () => bucketByMonth(fTenants, "created_at", () => 1, 6),
    [fTenants]
  );

  const tenantStatus = useMemo(() => {
    const map = countBy(fTenants, "status");
    return [
      { label: "Active", value: map.get("active") || 0, color: "var(--color-success)" },
      { label: "Suspended", value: map.get("suspended") || 0, color: "var(--color-warning)" },
      { label: "Inactive", value: map.get("inactive") || 0, color: "var(--text-muted)" },
    ].filter((s) => s.value > 0);
  }, [fTenants]);

  const ticketStatus = useMemo(() => {
    const map = countBy(fTickets, "status");
    return [
      { label: "Open", value: map.get("open") || 0, color: "var(--color-accent)" },
      { label: "Pending", value: map.get("pending") || 0, color: "var(--color-warning)" },
      { label: "Resolved", value: map.get("resolved") || 0, color: "var(--color-success)" },
    ].filter((s) => s.value > 0);
  }, [fTickets]);

  const planDistribution = useMemo(() => {
    const map = countBy(fTenants.filter((t) => t.plan_name), "plan_name");
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [fTenants]);

  const recentPayments = useMemo(
    () =>
      [...fPayments]
        .filter((p) => p.received_at)
        .sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
        .slice(0, 6),
    [fPayments]
  );

  const overdueTenants = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return fTenants
      .filter(
        (t) =>
          t.subscription_status === "active" &&
          t.renewal_date &&
          new Date(t.renewal_date) < today
      )
      .sort((a, b) => new Date(a.renewal_date) - new Date(b.renewal_date))
      .slice(0, 6);
  }, [fTenants]);

  const recentTickets = useMemo(
    () =>
      [...fTickets]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 6),
    [fTickets]
  );

  const dash = (n) => (loading ? "—" : n ?? 0);
  const money = (n) => (loading ? "—" : formatPKR(n));

  const totalClients = fTenants.length;
  const activeClients = fTenants.filter((t) => t.status === "active").length;
  const suspendedClients = fTenants.filter((t) => t.status === "suspended").length;
  const health = totalClients ? Math.round((activeClients / totalClients) * 100) : 100;
  const revenueTotal = fPayments.reduce((s, p) => s + (Number(p.total_received) || 0), 0);
  const outstandingDues = fTenants.reduce((s, t) => s + (Number(t.amount_due) || 0), 0);
  const overdueRenewals = fTenants.filter((t) => {
    if (t.subscription_status !== "active" || !t.renewal_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(t.renewal_date) < today;
  }).length;
  const openTickets = fTickets.filter((t) => t.status !== "resolved").length;
  const resolvedTickets = fTickets.filter((t) => t.status === "resolved").length;
  const activeSubscriptions = fTenants.filter((t) => t.subscription_status === "active").length;
  const liveSessions = fSessions.filter((s) => s.is_active).length;

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Dashboard"
        description="Platform overview — tenants, subscriptions, revenue and operational health."
      />

      <DashboardFilter
        rows={[...tenants, ...payments, ...tickets, ...sessions]}
        dateField="created_at"
        value={dashFilter}
        onChange={setDashFilter}
      />

      {/* KPI row */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard
            label="Total Tenants"
            value={dash(totalClients)}
            hint={`${dash(activeClients)} active · ${dash(suspendedClients)} suspended`}
            icon={<TenantsIcon />}
            tone="accent"
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label={dashFilter.allTime && !dashFilter.year ? "Revenue (All Time)" : "Revenue"}
            value={money(revenueTotal)}
            hint={dashFilter.allTime && !dashFilter.year ? "All recorded payments" : "Payments in selected range"}
            icon={<SubscriptionIcon />}
            tone="success"
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Outstanding Dues"
            value={money(outstandingDues)}
            hint={`${dash(overdueRenewals)} overdue renewals`}
            icon={<SubscriptionIcon />}
            tone="warning"
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Open Tickets"
            value={dash(openTickets)}
            hint={`${dash(resolvedTickets)} resolved`}
            icon={<SupportIcon />}
            tone={openTickets ? "danger" : "default"}
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard label="Active Subscriptions" value={dash(activeSubscriptions)} icon={<SubscriptionIcon />} />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Live Sessions" value={loading ? "—" : liveSessions} hint="In selected range" icon={<ImpersonateIcon />} tone="success" />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Subscription Plans" value={dash(plans.length)} icon={<SubscriptionIcon />} />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Modules" value={dash(modules.length)} icon={<ModuleIcon />} />
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <Panel title="Revenue" subtitle="Payments received over the last 6 months">
            <BarChart data={revenueSeries} formatValue={compactPKR} />
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Tenants by Status">
            {tenantStatus.length ? (
              <DonutChart
                segments={tenantStatus}
                centerValue={fTenants.length}
                centerLabel="tenants"
              />
            ) : (
              <p className="wh-panel__empty">No tenant data</p>
            )}
          </Panel>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Panel title="New Tenants" subtitle="Signups in the last 6 months">
            <BarChart data={signupSeries} formatValue={(v) => String(v)} />
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Plan Distribution">
            {planDistribution.length ? (
              <HBars data={planDistribution} />
            ) : (
              <p className="wh-panel__empty">No subscriptions yet</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Support Tickets">
            {ticketStatus.length ? (
              <DonutChart
                segments={ticketStatus}
                centerValue={fTickets.length}
                centerLabel="tickets"
              />
            ) : (
              <p className="wh-panel__empty">No tickets</p>
            )}
          </Panel>
        </div>
      </div>

      {/* Lists row */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Panel title="Recent Payments" flush>
            {recentPayments.length ? (
              <div className="wh-mini-list">
                {recentPayments.map((p) => (
                  <div className="wh-mini-row" key={p.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{p.company_name || "—"}</div>
                      <div className="wh-mini-row__sub">{formatDate(p.received_at)}</div>
                    </div>
                    <span className="wh-mini-row__value">{formatPKR(p.total_received)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No payments recorded</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Overdue Renewals" flush>
            {overdueTenants.length ? (
              <div className="wh-mini-list">
                {overdueTenants.map((t) => (
                  <div className="wh-mini-row" key={t.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{t.company_name}</div>
                      <div className="wh-mini-row__sub">Due {formatDate(t.renewal_date)}</div>
                    </div>
                    <span className="wh-mini-row__value">{formatPKR(t.amount_due)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">All renewals up to date</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Recent Tickets" flush>
            {recentTickets.length ? (
              <div className="wh-mini-list">
                {recentTickets.map((t) => (
                  <div className="wh-mini-row" key={t.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{t.subject}</div>
                      <div className="wh-mini-row__sub">{t.company_name || "—"}</div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No tickets</p>
            )}
          </Panel>
        </div>
      </div>

      {/* Platform health footer */}
      <div className="wh-dash-grid">
        <div className="wh-dash-col-12">
          <Panel title="Platform Health" subtitle="Share of active tenants across the platform">
            <div className="wh-hbars">
              <div>
                <div className="wh-hbar__top">
                  <span className="wh-hbar__label">Active tenants</span>
                  <span className="wh-hbar__val">{loading ? "—" : `${health}%`}</span>
                </div>
                <div className="wh-hbar__track">
                  <div
                    className="wh-hbar__fill"
                    style={{
                      width: `${health}%`,
                      background:
                        health >= 80
                          ? "var(--color-success)"
                          : health >= 50
                          ? "var(--color-warning)"
                          : "var(--color-danger)",
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
