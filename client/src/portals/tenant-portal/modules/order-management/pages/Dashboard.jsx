import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { BarChart, DonutChart, HBars } from "../../../../../components/charts";
import { StatusBadge } from "../../../../../components/Badge";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import { DashboardFilter } from "../../../../../components/DashboardFilter";
import { EMPTY_DASHBOARD_FILTER, filterRowsByDashboard } from "../../../../../utils/dashboardFilter";
import { useFiscalYear } from "../../../../../context/FiscalYearContext";
import {
  ProductIcon,
  SubscriptionIcon,
  SupportIcon,
  TransferIcon,
  WarehouseIcon,
} from "../../../../../components/icons";
import { MODULE_BASE } from "../constants";

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

function Panel({ title, subtitle, children, flush }) {
  return (
    <div className="wh-panel">
      <div className="wh-panel__head">
        <div>
          <h3 className="wh-panel__title">{title}</h3>
          {subtitle && <p className="wh-panel__subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className={`wh-panel__body${flush ? " wh-panel__body--flush" : ""}`}>{children}</div>
    </div>
  );
}

export default function OrderManagementDashboard() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashFilter, setDashFilter] = useState({ ...EMPTY_DASHBOARD_FILTER });
  const fiscalYearStart = useFiscalYear();

  useEffect(() => {
    let active = true;
    apiFetch("/orders/dashboard", {}, authFetch)
      .then((res) => { if (active) setData(res); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authFetch]);

  const recentOrders = useMemo(() => {
    const rows = data?.recent_orders || [];
    return filterRowsByDashboard(rows, "created_at", dashFilter, fiscalYearStart);
  }, [data, dashFilter, fiscalYearStart]);

  const orderSeries = useMemo(() => {
    const fromApi = data?.orders_by_month || [];
    if (fromApi.length) {
      return fromApi.map((row) => ({
        label: row.month_label?.slice(0, 3) || row.month_key,
        value: Number(row.count) || 0,
      }));
    }
    return [];
  }, [data]);

  const statusDonut = useMemo(() => {
    const rows = data?.orders_by_status || [];
    const colors = {
      pending: "var(--color-warning)",
      confirmed: "var(--color-accent)",
      processing: "var(--color-accent)",
      shipped: "var(--color-success)",
      delivered: "var(--color-success)",
      cancelled: "var(--color-danger)",
      returned: "var(--text-muted)",
    };
    return rows.map((row) => ({
      label: String(row.label || "—").replace(/_/g, " "),
      value: Number(row.count) || 0,
      color: colors[row.label] || "var(--text-muted)",
    }));
  }, [data]);

  const fulfillmentBars = useMemo(
    () => (data?.fulfillment_by_status || []).map((row) => ({
      label: String(row.label || "—").replace(/_/g, " "),
      value: Number(row.count) || 0,
    })),
    [data]
  );

  const paymentBars = useMemo(
    () => (data?.payment_by_status || []).map((row) => ({
      label: String(row.label || "—").replace(/_/g, " "),
      value: Number(row.count) || 0,
    })),
    [data]
  );

  const stats = data?.stats || {};
  const dash = (n) => (loading ? "—" : n ?? 0);
  const money = (n) => (loading ? "—" : formatPKR(n));

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Order Management"
        description="Overview of orders, payments, fulfillment, returns, and exchanges."
      />

      <DashboardFilter rows={data?.recent_orders || []} value={dashFilter} onChange={setDashFilter} />

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard label="Total Orders" value={dash(stats.total_orders)} icon={<ProductIcon />} tone="accent" />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Pending" value={dash(stats.pending_orders)} icon={<SupportIcon />} tone="warning" />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Confirmed" value={dash(stats.confirmed_orders)} icon={<WarehouseIcon />} tone="default" />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Cancelled" value={dash(stats.cancelled_orders)} icon={<TransferIcon />} tone="danger" />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <KpiCard label="Returns" value={dash(stats.return_requests)} icon={<TransferIcon />} />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="Exchanges" value={dash(stats.exchange_requests)} icon={<TransferIcon />} />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard label="COD Amount" value={money(stats.cod_amount)} icon={<SubscriptionIcon />} tone="accent" />
        </div>
        <div className="wh-dash-col-3">
          <KpiCard
            label="Delayed Orders"
            value={dash(stats.delayed_orders)}
            hint="Unfulfilled 3+ days"
            icon={<SupportIcon />}
            tone="warning"
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <Panel title="Orders over time" subtitle="Last 6 months">
            {orderSeries.length ? (
              <BarChart data={orderSeries} formatValue={(v) => String(v)} />
            ) : (
              <p className="wh-panel__empty">No order data</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-4">
          <Panel title="Order status">
            {statusDonut.length ? (
              <DonutChart
                segments={statusDonut}
                centerValue={statusDonut.reduce((s, x) => s + x.value, 0)}
                centerLabel="orders"
              />
            ) : (
              <p className="wh-panel__empty">No orders yet</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-6">
          <Panel title="Fulfillment status">
            {fulfillmentBars.length ? (
              <HBars data={fulfillmentBars} />
            ) : (
              <p className="wh-panel__empty">No fulfillment data</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-6">
          <Panel title="Payment status">
            {paymentBars.length ? (
              <HBars data={paymentBars} />
            ) : (
              <p className="wh-panel__empty">No payment data</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-12">
          <Panel title="Recent orders" subtitle="Latest orders in the selected period" flush>
            <table className="wh-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Fulfillment</th>
                  <th>Amount</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 ? (
                  <tr><td colSpan={7} className="wh-muted">No orders in this period.</td></tr>
                ) : (
                  recentOrders.slice(0, 8).map((row) => (
                    <tr
                      key={row.id}
                      className="wh-table__row--clickable"
                      onClick={() => navigate(`${MODULE_BASE}/orders/view/${row.id}`)}
                    >
                      <td>{row.order_no}</td>
                      <td>{row.customer_name || "—"}</td>
                      <td><StatusBadge status={row.order_status} /></td>
                      <td><StatusBadge status={row.payment_status} /></td>
                      <td><StatusBadge status={row.fulfillment_status} /></td>
                      <td>{formatPKR(row.payable_amount)}</td>
                      <td>{formatDateTime(row.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
