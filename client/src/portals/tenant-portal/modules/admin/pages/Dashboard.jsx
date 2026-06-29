import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { BarChart, DonutChart, HBars } from "../../../../../components/charts";
import { StatusBadge } from "../../../../../components/Badge";
import { formatPKR } from "../../../../../utils/currency";
import { formatDate, formatDateTime } from "../../../../../utils/dateTime";
import { DashboardFilter } from "../../../../../components/DashboardFilter";
import { EMPTY_DASHBOARD_FILTER, filterRowsByDashboard } from "../../../../../utils/dashboardFilter";
import { useFiscalYear } from "../../../../../context/FiscalYearContext";
import {
  TenantsIcon,
  SubscriptionIcon,
  SupportIcon,
  ModuleIcon,
  ImpersonateIcon,
  LogsIcon,
} from "../../../../../components/icons";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function filterByRange(rows, field, range, fiscalYearStart) {
  return filterRowsByDashboard(rows, field, range, fiscalYearStart);
}

function isLiveSession(row) {
  return Number(row.is_active) === 1 && !row.logout_at;
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

export default function AdminDashboard() {
  const { authFetch } = useAuth();
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [billing, setBilling] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashFilter, setDashFilter] = useState({ ...EMPTY_DASHBOARD_FILTER });
  const fiscalYearStart = useFiscalYear();

  const fSessions = useMemo(() => filterByRange(sessions, "login_at", dashFilter, fiscalYearStart), [sessions, dashFilter, fiscalYearStart]);
  const fAlerts = useMemo(() => filterByRange(alerts, "created_at", dashFilter, fiscalYearStart), [alerts, dashFilter, fiscalYearStart]);
  const fActivities = useMemo(() => filterByRange(activities, "created_at", dashFilter, fiscalYearStart), [activities, dashFilter, fiscalYearStart]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [userRes, sessionRows, alertRows, activityRows, billingRes] = await Promise.all([
        apiFetch("/tenant/users", {}, authFetch).catch(() => ({ data: [], limits: {} })),
        fetchAllTableRows("/tenant/sessions", authFetch).catch(() => []),
        fetchAllTableRows("/tenant/activity-alerts", authFetch).catch(() => []),
        fetchAllTableRows("/tenant/audit-logs", authFetch).catch(() => []),
        apiFetch("/tenant/subscription-billing", {}, authFetch).catch(() => ({ data: null })),
      ]);
      if (!active) return;
      setUsers(userRes.data || []);
      setSessions(sessionRows);
      setAlerts(alertRows);
      setActivities(activityRows);
      setBilling(billingRes.data || null);
      setModules(billingRes.data?.modules || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [authFetch]);

  const loginSeries = useMemo(
    () => bucketByMonth(fSessions, "login_at", () => 1, 6),
    [fSessions]
  );

  const userStatus = useMemo(() => {
    const map = countBy(users, "status");
    return [
      { label: "Active", value: map.get("active") || 0, color: "var(--color-success)" },
      { label: "Inactive", value: map.get("inactive") || 0, color: "var(--text-muted)" },
      { label: "Suspended", value: map.get("suspended") || 0, color: "var(--color-warning)" },
    ].filter((s) => s.value > 0);
  }, [users]);

  const alertTypes = useMemo(() => {
    const map = countBy(fAlerts, "alert_type");
    const colors = {
      failed_login: "var(--color-danger)",
      role_change: "var(--color-accent)",
      permission_change: "var(--color-warning)",
      user_deactivated: "var(--color-warning)",
      record_deleted: "var(--color-danger)",
      large_export: "var(--color-accent)",
    };
    return [...map.entries()]
      .map(([label, value]) => ({
        label: String(label).replace(/_/g, " "),
        value,
        color: colors[label] || "var(--text-muted)",
      }))
      .filter((s) => s.value > 0);
  }, [fAlerts]);

  const moduleBars = useMemo(
    () =>
      modules.map((m) => ({
        label: m.module_name,
        value: 1,
      })),
    [modules]
  );

  const roleDistribution = useMemo(() => {
    const map = countBy(users, "role_name");
    return [...map.entries()]
      .map(([label, value]) => ({ label: label || "—", value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [users]);

  const recentActivities = useMemo(
    () =>
      [...fActivities]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 6),
    [fActivities]
  );

  const recentAlerts = useMemo(
    () =>
      [...fAlerts]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 6),
    [fAlerts]
  );

  const recentSessions = useMemo(
    () =>
      [...fSessions]
        .filter((s) => s.login_at)
        .sort((a, b) => new Date(b.login_at) - new Date(a.login_at))
        .slice(0, 6),
    [fSessions]
  );

  const dash = (n) => (loading ? "—" : n ?? 0);
  const money = (n) => (loading ? "—" : formatPKR(n));

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "active").length;
  const inactiveUsers = users.filter((u) => u.status === "inactive").length;
  const health = totalUsers ? Math.round((activeUsers / totalUsers) * 100) : 100;
  const liveSessions = sessions.filter(isLiveSession).length;
  const openAlerts = alerts.filter((a) => !a.is_read).length;
  const failedLogins = alerts.filter((a) => a.alert_type === "failed_login").length;
  const cycleDue = Number(billing?.billing?.current_cycle_due ?? 0);
  const totalDue = Number(billing?.billing?.total_amount_due ?? 0);
  const maxUsers = billing?.limits?.max_users ?? 0;

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Dashboard"
        description="Organization overview — users, sessions, modules, billing, and security alerts."
      />

      <DashboardFilter
        rows={[...sessions, ...alerts, ...activities]}
        dateField="created_at"
        value={dashFilter}
        onChange={setDashFilter}
      />

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard
            label="Total Users"
            value={dash(totalUsers)}
            hint={`${dash(activeUsers)} active · ${dash(inactiveUsers)} inactive`}
            icon={<TenantsIcon />}
            tone="accent"
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Live Sessions"
            value={dash(liveSessions)}
            hint={`${dash(fSessions.length)} logins in range`}
            icon={<ImpersonateIcon />}
            tone="success"
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Billing Due"
            value={money(totalDue)}
            hint={`${money(cycleDue)} current cycle`}
            icon={<SubscriptionIcon />}
            tone={totalDue > 0 ? "warning" : "default"}
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Security Alerts"
            value={dash(openAlerts)}
            hint={`${dash(failedLogins)} failed logins`}
            icon={<SupportIcon />}
            tone={openAlerts ? "danger" : "default"}
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard
            label="User Capacity"
            value={maxUsers ? `${dash(activeUsers)}/${dash(maxUsers)}` : dash(activeUsers)}
            hint="Active users vs plan limit"
            icon={<TenantsIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Assigned Modules"
            value={dash(modules.length)}
            icon={<ModuleIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Audit Events"
            value={dash(fActivities.length)}
            hint="In selected range"
            icon={<LogsIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Plan"
            value={loading ? "—" : billing?.tenant?.plan_name || "—"}
            hint={billing?.tenant?.billing_cycle || ""}
            icon={<SubscriptionIcon />}
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <Panel title="Login Activity" subtitle="Session starts over the last 6 months">
            <BarChart data={loginSeries} formatValue={(v) => String(v)} />
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Users by Status">
            {userStatus.length ? (
              <DonutChart segments={userStatus} centerValue={totalUsers} centerLabel="users" />
            ) : (
              <p className="wh-panel__empty">No user data</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Panel title="Alerts by Type">
            {alertTypes.length ? (
              <DonutChart segments={alertTypes} centerValue={fAlerts.length} centerLabel="alerts" />
            ) : (
              <p className="wh-panel__empty">No alerts in range</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Users by Role">
            {roleDistribution.length ? (
              <HBars data={roleDistribution} />
            ) : (
              <p className="wh-panel__empty">No roles assigned</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Module Access">
            {moduleBars.length ? (
              <HBars data={moduleBars} />
            ) : (
              <p className="wh-panel__empty">No modules assigned</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-4">
          <Panel title="Recent Activity" flush>
            {recentActivities.length ? (
              <div className="wh-mini-list">
                {recentActivities.map((row) => (
                  <div className="wh-mini-row" key={row.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{row.action}</div>
                      <div className="wh-mini-row__sub">
                        {row.user_name || "—"} · {formatDateTime(row.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No activity recorded</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Recent Alerts" flush>
            {recentAlerts.length ? (
              <div className="wh-mini-list">
                {recentAlerts.map((a) => (
                  <div className="wh-mini-row" key={a.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{a.title}</div>
                      <div className="wh-mini-row__sub">{formatDate(a.created_at)}</div>
                    </div>
                    <StatusBadge status={a.is_read ? "resolved" : "pending"} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No alerts</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Recent Sessions" flush>
            {recentSessions.length ? (
              <div className="wh-mini-list">
                {recentSessions.map((s) => (
                  <div className="wh-mini-row" key={s.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{s.user_name || "—"}</div>
                      <div className="wh-mini-row__sub">{formatDateTime(s.login_at)}</div>
                    </div>
                    <StatusBadge status={isLiveSession(s) ? "active" : "inactive"} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No sessions</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-12">
          <Panel title="Organization Health" subtitle="Share of active users in your organization">
            <div className="wh-hbars">
              <div>
                <div className="wh-hbar__top">
                  <span className="wh-hbar__label">Active users</span>
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
