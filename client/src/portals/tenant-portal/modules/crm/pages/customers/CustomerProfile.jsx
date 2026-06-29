import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Button } from "../../../../../../components/Button";
import { DataTable } from "../../../../../../components/DataTable";
import { StatusBadge } from "../../../../../../components/Badge";
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
  ACTIVE_CUSTOMER_DAYS,
  ISSUE_TYPE_LABELS,
} from "../../constants";
import { formatCustomerType } from "../../utils/typeFields";

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

  const stats = customer.stats || {};
  const totalSpent = stats.total_revenue ?? 0;
  const orderCount = stats.order_count ?? 0;
  const orders = customer.orders || [];
  const posSales = customer.pos_sales || [];
  const complaints = customer.complaints || [];
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

      <ProfileHero
        className="wh-entity-profile--customer"
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
            value: String(orderCount),
            hint: stats.recently_active ? `Active · ${ACTIVE_CUSTOMER_DAYS}d` : "Inactive",
            tone: "accent",
            icon: <LogsIcon />,
          },
          {
            label: "Total spent",
            value: formatPKR(totalSpent),
            hint: `${stats.pos_sale_count ?? 0} POS sales`,
            tone: "success",
            icon: <TenantsIcon />,
          },
          {
            label: "Order revenue",
            value: formatPKR(stats.order_revenue ?? 0),
            hint: `${orderCount} orders`,
            icon: <LogsIcon />,
          },
          {
            label: "POS revenue",
            value: formatPKR(stats.pos_revenue ?? 0),
            hint: `${stats.pos_sale_count ?? 0} sales`,
            icon: <TenantsIcon />,
          },
          {
            label: "Customer since",
            value: stats.first_order_at ? formatDate(stats.first_order_at) : "—",
            hint: stats.first_order_at ? "First order date" : "No orders yet",
            icon: <SinceIcon />,
            valueVariant: "date",
          },
          {
            label: "Open complaints",
            value: stats.complaint_count ?? 0,
            hint: "Needs attention",
            tone: "warning",
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

      <EntityPanel title="Order overview" subtitle="Recent e-commerce orders for this customer" flush>
        {orders.length ? (
          <DataTable
            columns={orderColumns}
            rows={orders}
            page={ordersPage}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setOrdersPage}
          />
        ) : (
          <p className="wh-panel__empty">No orders linked to this customer.</p>
        )}
      </EntityPanel>

      <EntityPanel title="POS sales" subtitle="In-store transactions linked to this customer" flush>
        {posSales.length ? (
          <DataTable
            columns={posColumns}
            rows={posSales}
            page={posPage}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setPosPage}
          />
        ) : (
          <p className="wh-panel__empty">No POS sales linked to this customer.</p>
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
