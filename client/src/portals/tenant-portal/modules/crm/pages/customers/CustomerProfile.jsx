import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { useFiscalYear } from "../../../../../../context/FiscalYearContext";
import { apiFetch, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Button } from "../../../../../../components/Button";
import { DataTable } from "../../../../../../components/DataTable";
import { StatusBadge } from "../../../../../../components/Badge";
import { DashboardFilter } from "../../../../../../components/DashboardFilter";
import {
  createThisMonthDashboardFilter,
  filterRowsByDashboard,
  getPreviousPeriodFilter,
  countInDashboardFilter,
  sumInDashboardFilter,
  formatComparisonHint,
  isAllTimeDashboardFilter,
  getEarliestDateFromSources,
} from "../../../../../../utils/dashboardFilter";
import {
  ProfileHero,
  EntityPanel,
  ActivityTimeline,
  LogsIcon,
  SupportIcon,
  TenantsIcon,
  SinceIcon,
} from "../../../../../../components/EntityView";
import { formatDateTime, formatDate } from "../../../../../../utils/dateTime";
import { formatPKR } from "../../../../../../utils/currency";
import {
  MODULE_BASE,
  LEAD_SOURCE_LABELS,
  ISSUE_TYPE_LABELS,
} from "../../constants";
import { formatCustomerType } from "../../utils/typeFields";

const OPEN_COMPLAINT_STATUSES = new Set(["open", "in_progress"]);

function formatLocation(addresses) {
  const list = addresses || [];
  const primary = list.find((a) => a.is_default) || list[0];
  if (!primary) return null;
  return [primary.city, primary.state].filter(Boolean).join(", ") || primary.address || null;
}

export default function CustomerProfile() {
  const { customerId } = useParams();
  const { authFetch } = useAuth();
  const { canCreate, canEdit } = useModulePermission("crm");
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  const [posPage, setPosPage] = useState(1);
  const [dashFilter, setDashFilter] = useState(createThisMonthDashboardFilter);
  const fiscalYearStart = useFiscalYear();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCustomer(await apiFetch(`/crm/customers/${customerId}`, {}, authFetch));
    } catch (e) {
      setCustomer(null);
      setError(e.message || "Customer not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, customerId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const orders = customer?.orders || [];
  const posSales = customer?.pos_sales || [];
  const complaints = customer?.complaints || [];

  const filterRows = useMemo(() => [...orders, ...posSales, ...complaints], [orders, posSales, complaints]);

  const firstOrderAt = useMemo(
    () => getEarliestDateFromSources([orders, posSales], "created_at"),
    [orders, posSales]
  );

  const allTimeOrderCount = orders.length;
  const allTimePosCount = posSales.length;
  const allTimeTotalSpent = useMemo(
    () =>
      orders.reduce((sum, row) => sum + (Number(row.payable_amount) || 0), 0) +
      posSales.reduce((sum, row) => sum + (Number(row.payable_amount) || 0), 0),
    [orders, posSales]
  );

  const prevFilter = useMemo(
    () => getPreviousPeriodFilter(dashFilter, fiscalYearStart),
    [dashFilter, fiscalYearStart]
  );

  const periodMetrics = useMemo(() => {
    const orderCount = countInDashboardFilter(orders, "created_at", dashFilter, fiscalYearStart);
    const posCount = countInDashboardFilter(posSales, "created_at", dashFilter, fiscalYearStart);
    const orderRevenue = sumInDashboardFilter(orders, "created_at", "payable_amount", dashFilter, fiscalYearStart);
    const posRevenue = sumInDashboardFilter(posSales, "created_at", "payable_amount", dashFilter, fiscalYearStart);
    const totalSpent = orderRevenue + posRevenue;
    const complaintsInPeriod = countInDashboardFilter(complaints, "created_at", dashFilter, fiscalYearStart);
    const transactions = orderCount + posCount;

    let prevOrderCount = 0;
    let prevTotalSpent = 0;
    let prevComplaints = 0;
    let prevTransactions = 0;

    if (prevFilter) {
      prevOrderCount = countInDashboardFilter(orders, "created_at", prevFilter, fiscalYearStart);
      const prevPosCount = countInDashboardFilter(posSales, "created_at", prevFilter, fiscalYearStart);
      prevTransactions = prevOrderCount + prevPosCount;
      prevTotalSpent =
        sumInDashboardFilter(orders, "created_at", "payable_amount", prevFilter, fiscalYearStart) +
        sumInDashboardFilter(posSales, "created_at", "payable_amount", prevFilter, fiscalYearStart);
      prevComplaints = countInDashboardFilter(complaints, "created_at", prevFilter, fiscalYearStart);
    }

    const allTime = isAllTimeDashboardFilter(dashFilter);
    const displayOrderCount = allTime ? allTimeOrderCount : orderCount;
    const displayTotalSpent = allTime ? allTimeTotalSpent : totalSpent;
    const displayTransactions = allTime ? allTimeOrderCount + allTimePosCount : transactions;
    const displayComplaintsInPeriod = allTime ? complaints.length : complaintsInPeriod;

    return {
      orderCount: displayOrderCount,
      totalSpent: displayTotalSpent,
      transactions: displayTransactions,
      openComplaints: complaints.filter((c) => OPEN_COMPLAINT_STATUSES.has(c.status)).length,
      ordersHint: formatComparisonHint(displayOrderCount, prevOrderCount, dashFilter),
      spentHint: formatComparisonHint(displayTotalSpent, prevTotalSpent, dashFilter),
      activityHint: formatComparisonHint(displayTransactions, prevTransactions, dashFilter),
      complaintsHint: formatComparisonHint(displayComplaintsInPeriod, prevComplaints, dashFilter),
    };
  }, [
    orders,
    posSales,
    complaints,
    dashFilter,
    prevFilter,
    fiscalYearStart,
    allTimeOrderCount,
    allTimePosCount,
    allTimeTotalSpent,
  ]);

  const filteredOrders = useMemo(
    () => filterRowsByDashboard(orders, "created_at", dashFilter, fiscalYearStart),
    [orders, dashFilter, fiscalYearStart]
  );

  const filteredPosSales = useMemo(
    () => filterRowsByDashboard(posSales, "created_at", dashFilter, fiscalYearStart),
    [posSales, dashFilter, fiscalYearStart]
  );

  useEffect(() => {
    setOrdersPage(1);
    setPosPage(1);
  }, [dashFilter]);

  if (loading) {
    return (
      <div className="wh-page wh-page--wide">
        <p className="wh-muted">Loading customer…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="wh-page wh-page--wide">
        <div className="wh-alert wh-alert--error">{error || "Customer not found"}</div>
        <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/customers/manage`)}>Back to customers</Button>
      </div>
    );
  }

  const activities = (customer.activities || []).map((a) => ({
    ...a,
    created_at: formatDateTime(a.created_at),
  }));

  const orderColumns = [
    { key: "order_no", label: "Order ID", format: (v) => `#${v}` },
    { key: "created_at", label: "Date", format: formatDateTime },
    { key: "order_status", label: "Status", render: (r) => <StatusBadge status={r.order_status} /> },
    { key: "payment_status", label: "Payment", format: (v) => v || "—" },
    { key: "payable_amount", label: "Amount", format: (v) => formatPKR(v) },
  ];

  const posColumns = [
    { key: "sale_no", label: "Sale ID", format: (v) => `#${v}` },
    { key: "created_at", label: "Date", format: formatDateTime },
    { key: "payment_status", label: "Status", render: (r) => <StatusBadge status={r.payment_status} /> },
    { key: "payable_amount", label: "Amount", format: (v) => formatPKR(v) },
  ];

  return (
    <div className="wh-page wh-page--wide wh-entity-view">
      <PageHeader
        title={customer.customer_name}
        description={customer.company_name || "Customer overview"}
        actions={
          <div className="wh-action-btns">
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/customers/manage`)}>All customers</Button>
            {canEdit && (
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/customers/edit/${customerId}`)}>
                Edit customer
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => navigate(`${MODULE_BASE}/complaints/create`)}>Add complaint</Button>
            )}
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
        name={customer.customer_name}
        subtitle={[formatCustomerType(customer.customer_type), customer.company_name].filter(Boolean).join(" · ")}
        status={customer.status}
        contact={[
          { label: "Phone", value: customer.phone, icon: "phone" },
          { label: "Location", value: formatLocation(customer.addresses), icon: "location" },
          { label: "Email", value: customer.email, icon: "email" },
        ]}
        kpis={[
          {
            label: "Total orders",
            value: String(periodMetrics.orderCount),
            hint: periodMetrics.ordersHint.text,
            hintTone: periodMetrics.ordersHint.tone,
            tone: "accent",
            icon: <LogsIcon />,
          },
          {
            label: "Total spent",
            value: formatPKR(periodMetrics.totalSpent),
            hint: periodMetrics.spentHint.text,
            hintTone: periodMetrics.spentHint.tone,
            tone: "success",
            icon: <TenantsIcon />,
          },
          {
            label: "Customer since",
            value: firstOrderAt ? formatDate(firstOrderAt) : "—",
            hint: firstOrderAt ? "First order" : "No orders yet",
            icon: <SinceIcon />,
            valueVariant: "date",
          },
          {
            label: "Open complaints",
            value: periodMetrics.openComplaints,
            hint: periodMetrics.complaintsHint.text,
            hintTone: periodMetrics.complaintsHint.tone,
            tone: periodMetrics.openComplaints > 0 ? "warning" : "default",
            icon: <SupportIcon />,
          },
        ]}
      />

      {customer.converted_from_lead && (
        <div className="wh-entity-banner">
          Converted from lead <strong>{customer.converted_from_lead.lead_name}</strong>
          {" · "}
          {LEAD_SOURCE_LABELS[customer.converted_from_lead.source] || customer.converted_from_lead.source}
          {" · "}
          {formatDateTime(customer.converted_from_lead.converted_at)}
        </div>
      )}

      <EntityPanel title="Order overview" subtitle="E-commerce orders for this customer in the selected period" flush>
        {filteredOrders.length ? (
          <DataTable
            columns={orderColumns}
            rows={filteredOrders}
            page={ordersPage}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setOrdersPage}
          />
        ) : (
          <p className="wh-panel__empty">No orders in the selected period.</p>
        )}
      </EntityPanel>

      <EntityPanel title="POS sales" subtitle="In-store transactions for this customer in the selected period" flush>
        {filteredPosSales.length ? (
          <DataTable
            columns={posColumns}
            rows={filteredPosSales}
            page={posPage}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setPosPage}
          />
        ) : (
          <p className="wh-panel__empty">No POS sales in the selected period.</p>
        )}
      </EntityPanel>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-6">
          <EntityPanel title="Activity log" subtitle="CRM audit trail for this customer">
            <ActivityTimeline items={activities} />
          </EntityPanel>
        </div>
        <div className="wh-dash-col-6">
          <EntityPanel
            title="Complaints"
            subtitle={`${complaints.length} recorded`}
            action={
              canCreate ? (
                <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/complaints/create`)}>
                  New
                </Button>
              ) : null
            }
            flush
          >
            {complaints.length ? (
              <div className="wh-mini-list">
                {complaints.map((c) => (
                  <div className="wh-mini-row" key={c.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{c.subject}</div>
                      <div className="wh-mini-row__sub">
                        {ISSUE_TYPE_LABELS[c.issue_type] || c.issue_type}
                        {" · "}
                        <StatusBadge status={c.status} />
                        {" · "}
                        {formatDateTime(c.created_at)}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      className="wh-btn--sm"
                      onClick={() => navigate(`${MODULE_BASE}/complaints/view/${c.id}`)}
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No complaints recorded.</p>
            )}
          </EntityPanel>
        </div>
      </div>
    </div>
  );
}
