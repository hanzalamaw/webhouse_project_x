import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useFiscalYear } from "../../../../context/FiscalYearContext";
import { apiFetch, loginPortalUrl } from "../../../../api/client";
import { PageHeader } from "../../../../components/PageHeader";
import { Button } from "../../../../components/Button";
import { DashboardFilter } from "../../../../components/DashboardFilter";
import { CopyIcon, EyeIcon, EyeOffIcon } from "../../../../components/icons";
import { formatPKR } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/dateTime";
import { copyToClipboard } from "../../../../utils/copyToClipboard";
import {
  createThisMonthDashboardFilter,
  getPreviousPeriodFilter,
  countInDashboardFilter,
  sumInDashboardFilter,
  formatComparisonHint,
  isAllTimeDashboardFilter,
} from "../../../../utils/dashboardFilter";
import {
  ProfileHero,
  EntityPanel,
  EntityDetailGrid,
  TenantsIcon,
  SubscriptionIcon,
  LogsIcon,
  SinceIcon,
} from "../../../../components/EntityView";

const MASK = "••••••••";

function SensitiveField({ label, value }) {
  const [visible, setVisible] = useState(false);
  const raw = value == null || value === "" ? "—" : String(value);
  const isSecret = raw !== "—";
  const display = isSecret && !visible ? MASK : raw;

  return (
    <div className="wh-entity-detail-grid__item wh-entity-detail-grid__item--full">
      <span className="wh-entity-detail-grid__label">{label}</span>
      <div className="wh-account-detail-row__value-wrap">
        <span className="wh-entity-detail-grid__value">{display}</span>
        {isSecret && (
          <>
            <button type="button" className="wh-account-detail-row__copy" onClick={() => setVisible((v) => !v)} aria-label="Toggle visibility">
              {visible ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            <button type="button" className="wh-account-detail-row__copy" onClick={() => copyToClipboard(raw)} aria-label={`Copy ${label}`}>
              <CopyIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function TenantView() {
  const { tenantId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashFilter, setDashFilter] = useState(createThisMonthDashboardFilter);
  const fiscalYearStart = useFiscalYear();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch(`/tenants/${tenantId}/credentials`, {}, authFetch));
    } catch (e) {
      setData(null);
      setError(e.message || "Tenant not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, tenantId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const orders = data?.orders || [];
  const payments = data?.payments || [];
  const team = data?.users || [];

  const paymentRows = useMemo(
    () =>
      payments
        .filter((p) => p.received_at)
        .map((p) => ({ created_at: p.received_at, total_received: p.total_received })),
    [payments]
  );

  const allTimeOrderTotal = orders.length;
  const allTimePaymentTotal = useMemo(
    () => paymentRows.reduce((sum, row) => sum + (Number(row.total_received) || 0), 0),
    [paymentRows]
  );

  const filterRows = useMemo(
    () => [...orders, ...paymentRows, ...team],
    [orders, paymentRows, team]
  );

  const prevFilter = useMemo(
    () => getPreviousPeriodFilter(dashFilter, fiscalYearStart),
    [dashFilter, fiscalYearStart]
  );

  const periodMetrics = useMemo(() => {
    const orderCount = countInDashboardFilter(orders, "created_at", dashFilter, fiscalYearStart);
    const paymentTotal = sumInDashboardFilter(paymentRows, "created_at", "total_received", dashFilter, fiscalYearStart);
    const newUsers = countInDashboardFilter(team, "created_at", dashFilter, fiscalYearStart);

    let prevOrders = 0;
    let prevPayments = 0;
    let prevUsers = 0;
    if (prevFilter) {
      prevOrders = countInDashboardFilter(orders, "created_at", prevFilter, fiscalYearStart);
      prevPayments = sumInDashboardFilter(paymentRows, "created_at", "total_received", prevFilter, fiscalYearStart);
      prevUsers = countInDashboardFilter(team, "created_at", prevFilter, fiscalYearStart);
    }

    const allTime = isAllTimeDashboardFilter(dashFilter);
    const tenant = data?.tenant;
    const displayOrders = allTime ? allTimeOrderTotal : orderCount;
    const displayPayments = allTime ? allTimePaymentTotal : paymentTotal;
    const displayUsers = tenant?.user_count ?? team.length;
    const usersCompared = allTime ? team.length : newUsers;

    return {
      orders: displayOrders,
      payments: displayPayments,
      users: displayUsers,
      ordersHint: formatComparisonHint(displayOrders, prevOrders, dashFilter),
      paymentsHint: formatComparisonHint(displayPayments, prevPayments, dashFilter),
      usersHint: formatComparisonHint(usersCompared, prevUsers, dashFilter),
      activityHint: formatComparisonHint(displayOrders, prevOrders, dashFilter),
    };
  }, [orders, paymentRows, team, dashFilter, prevFilter, fiscalYearStart, data?.tenant, allTimeOrderTotal, allTimePaymentTotal]);

  if (loading) {
    return (
      <div className="wh-page wh-page--wide">
        <p className="wh-muted">Loading tenant…</p>
      </div>
    );
  }

  if (!data?.tenant) {
    return (
      <div className="wh-page wh-page--wide">
        <div className="wh-alert wh-alert--error">{error || "Tenant not found"}</div>
        <Button variant="secondary" onClick={() => navigate("/webhouse-portal/tenants/manage")}>Back to tenants</Button>
      </div>
    );
  }

  const { tenant, credentials, modules = [], organization, payment } = data;
  const loginPortal = tenant.login_portal || credentials?.login_portal;
  const loginLink = loginPortal ? loginPortalUrl(loginPortal) : "—";
  const moduleNames = modules.map((m) => m.module_name || m.name).filter(Boolean).join(", ") || "—";
  const maxOrders = tenant.max_orders_per_month ?? "∞";

  return (
    <div className="wh-page wh-page--wide wh-entity-view">
      <PageHeader
        title={tenant.company_name}
        description={[tenant.plan_name, tenant.industry].filter(Boolean).join(" · ") || "Tenant overview"}
        actions={
          <div className="wh-action-btns">
            <Button variant="secondary" onClick={() => navigate("/webhouse-portal/tenants/manage")}>All tenants</Button>
            <Button variant="secondary" onClick={() => navigate(`/webhouse-portal/tenants/edit/${tenantId}`)}>Edit tenant</Button>
          </div>
        }
      />

      <DashboardFilter
        rows={filterRows}
        dateField="created_at"
        value={dashFilter}
        onChange={setDashFilter}
      />

      <ProfileHero
        className="wh-entity-profile--entity"
        variant="split"
        name={tenant.company_name}
        subtitle={[tenant.plan_name, tenant.industry].filter(Boolean).join(" · ")}
        status={tenant.status}
        contact={[
          { label: "Owner", value: tenant.owner_name, icon: "user" },
          { label: "Phone", value: tenant.owner_phone, icon: "phone" },
          { label: "Email", value: tenant.owner_email, icon: "email" },
        ]}
        kpis={[
          {
            label: "Orders",
            value: `${periodMetrics.orders}/${maxOrders}`,
            hint: periodMetrics.ordersHint.text,
            hintTone: periodMetrics.ordersHint.tone,
            tone: "accent",
            icon: <LogsIcon />,
          },
          {
            label: "Payments",
            value: formatPKR(periodMetrics.payments),
            hint: periodMetrics.paymentsHint.text,
            hintTone: periodMetrics.paymentsHint.tone,
            tone: "success",
            icon: <SubscriptionIcon />,
          },
          {
            label: "Tenant since",
            value: tenant.created_at ? formatDate(tenant.created_at) : "—",
            hint: periodMetrics.activityHint.text,
            hintTone: periodMetrics.activityHint.tone,
            icon: <SinceIcon />,
            valueVariant: "date",
          },
          {
            label: "Users",
            value: `${periodMetrics.users}/${tenant.max_users ?? "∞"}`,
            hint: periodMetrics.usersHint.text,
            hintTone: periodMetrics.usersHint.tone,
            icon: <TenantsIcon />,
          },
        ]}
      />

      <div className="wh-dash-grid">
        <div className="wh-dash-col-6">
          <EntityPanel title="Sign-in details" subtitle="Portal access for the tenant super admin" flush>
            <EntityDetailGrid
              rows={[
                { label: "Portal link", value: loginLink },
                { label: "Username", value: credentials?.username || credentials?.email },
              ]}
            />
            <SensitiveField label="Password" value={credentials?.password} />
          </EntityPanel>
        </div>
        <div className="wh-dash-col-6">
          <EntityPanel title="Subscription" subtitle="Plan and enabled modules" flush>
            <EntityDetailGrid
              rows={[
                { label: "Plan", value: tenant.plan_name },
                { label: "Billing cycle", value: tenant.billing_cycle },
                { label: "ERP portal", value: loginPortal?.toUpperCase() },
                { label: "Amount due", value: tenant.amount_due != null ? formatPKR(tenant.amount_due) : "—" },
                { label: "Stores", value: `${tenant.store_count ?? 0}/${tenant.max_stores ?? "∞"}` },
                { label: "Warehouses", value: `${tenant.warehouse_count ?? 0}/${tenant.max_warehouses ?? "∞"}` },
              ]}
            />
            <div className="wh-entity-detail-grid__item wh-entity-detail-grid__item--full">
              <span className="wh-entity-detail-grid__label">Modules</span>
              <span className="wh-entity-detail-grid__value">{moduleNames}</span>
            </div>
          </EntityPanel>
        </div>
      </div>

      <EntityPanel title="Limits & organization" subtitle="Resource caps and org settings" flush>
        <EntityDetailGrid
          rows={[
            { label: "Max users", value: tenant.max_users },
            { label: "Max stores", value: tenant.max_stores },
            { label: "Max warehouses", value: tenant.max_warehouses },
            { label: "Orders / month", value: tenant.max_orders_per_month },
            { label: "Monthly total", value: tenant.total_amount != null ? formatPKR(tenant.total_amount) : "—" },
            ...(organization?.fiscal_year_start
              ? [{ label: "Fiscal year start", value: organization.fiscal_year_start }]
              : []),
            ...(payment?.payment_method
              ? [{ label: "Payment method", value: payment.payment_method }]
              : []),
            ...(payment?.billing_email
              ? [{ label: "Billing email", value: payment.billing_email }]
              : []),
          ]}
        />
      </EntityPanel>
    </div>
  );
}
