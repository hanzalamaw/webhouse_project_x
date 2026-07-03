import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { DashboardFilter } from "../../../../../components/DashboardFilter";
import { DonutChart } from "../../../../../components/charts";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import { EMPTY_DASHBOARD_FILTER, filterRowsByDashboard } from "../../../../../utils/dashboardFilter";
import { useFiscalYear } from "../../../../../context/FiscalYearContext";
import { SubscriptionIcon, LogsIcon, TransferIcon, ProductIcon } from "../../../../../components/icons";
import { MODULE_BASE, TRANSACTION_TYPE_LABELS, labelFor } from "../constants";

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

export default function FinanceDashboard() {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashFilter, setDashFilter] = useState({ ...EMPTY_DASHBOARD_FILTER });
  const fiscalYearStart = useFiscalYear();

  useEffect(() => {
    apiFetch("/finance/dashboard", {}, authFetch)
      .then(setData)
      .catch((e) => setError(e.message || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [authFetch]);

  const stats = data?.stats || {};
  const recent = data?.recent_transactions || [];
  const filteredRecent = useMemo(
    () => filterRowsByDashboard(recent, "transaction_at", dashFilter, fiscalYearStart),
    [recent, dashFilter, fiscalYearStart]
  );

  const typeBreakdown = useMemo(() => {
    const map = new Map();
    for (const row of filteredRecent) {
      const key = row.transaction_type || "other";
      map.set(key, (map.get(key) || 0) + Number(row.amount || 0));
    }
    return [...map.entries()].map(([label, value]) => ({
      label: labelFor(TRANSACTION_TYPE_LABELS, label),
      value,
    }));
  }, [filteredRecent]);

  const dash = (v) => (loading ? "—" : v);
  const money = (n) => (loading ? "—" : formatPKR(n));

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Dashboard"
        description="Financial overview — revenue, expenses, receivables, payables, and cash balance."
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}

      <DashboardFilter rows={recent} dateField="transaction_at" value={dashFilter} onChange={setDashFilter} />

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard label="Revenue (month)" value={money(stats.revenue)} icon={<SubscriptionIcon />} tone="success" />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Expenses (month)" value={money(stats.expenses)} icon={<ProductIcon />} tone="warning" />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Profit (month)"
            value={money(stats.profit)}
            tone={Number(stats.profit) >= 0 ? "success" : "danger"}
            icon={<LogsIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Cash balance" value={money(stats.cash_balance)} icon={<TransferIcon />} tone="accent" />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard label="Receivables" value={money(stats.receivables)} hint="Outstanding from customers" />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Payables" value={money(stats.payables)} hint="Vendor bills due" tone={stats.payables > 0 ? "warning" : "default"} />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Overdue bills" value={dash(stats.overdue_bills)} tone={stats.overdue_bills > 0 ? "danger" : "default"} />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Due recurring" value={dash(stats.due_recurring)} hint="Subscriptions to process" />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <Panel title="Recent transactions" subtitle="Latest financial activity" flush>
            {filteredRecent.length ? (
              <div className="wh-mini-list">
                {filteredRecent.map((row) => (
                  <div className="wh-mini-row" key={row.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{labelFor(TRANSACTION_TYPE_LABELS, row.transaction_type)}</div>
                      <div className="wh-mini-row__sub">{formatDateTime(row.transaction_at)} · {row.reference || "—"}</div>
                    </div>
                    <span className="wh-mini-row__val">{formatPKR(row.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No transactions in range</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="By type (range)">
            {typeBreakdown.length ? (
              <DonutChart
                segments={typeBreakdown.map((s, i) => ({
                  ...s,
                  color: ["var(--color-success)", "var(--color-warning)", "var(--color-accent)", "var(--color-danger)"][i % 4],
                }))}
                centerValue={filteredRecent.length}
                centerLabel="entries"
              />
            ) : (
              <p className="wh-panel__empty">No data</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-12">
          <Panel
            title="Quick links"
            action={<Link className="wh-btn wh-btn--secondary wh-btn--sm" to={`${MODULE_BASE}/transactions`}>View all transactions</Link>}
          >
            <div className="wh-dash-grid">
              <div className="wh-dash-col-3"><Link to={`${MODULE_BASE}/customer-payments`} className="wh-muted">Customer payments →</Link></div>
              <div className="wh-dash-col-3"><Link to={`${MODULE_BASE}/vendor-bills`} className="wh-muted">Vendor bills →</Link></div>
              <div className="wh-dash-col-3"><Link to={`${MODULE_BASE}/expenses`} className="wh-muted">Expenses →</Link></div>
              <div className="wh-dash-col-3"><Link to={`${MODULE_BASE}/bank-accounts`} className="wh-muted">Bank accounts →</Link></div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
