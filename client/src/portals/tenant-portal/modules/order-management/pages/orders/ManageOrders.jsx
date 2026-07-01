import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { TableToolbar } from "../../../../../../components/TableToolbar";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { formatPKR } from "../../../../../../utils/currency";
import { apiFetch } from "../../../../../../api/client";
import { useOrderReference } from "../../hooks/useOrderReference";
import {
  MODULE_BASE,
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "../../constants";

export default function ManageOrders() {
  const { authFetch } = useAuth();
  const { field_options } = useOrderReference();
  const { canCreate, canEdit, canDelete } = useModulePermission("order-management");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [toolbar, setToolbar] = useState({
    ...EMPTY_TOOLBAR,
    order_status: "",
    payment_status: "",
    order_source: "",
    payment_method: "",
    customer_name: "",
    city: "",
    warehouse_assignee: "",
  });

  const toolbarFilters = useMemo(() => [
    { key: "order_status", label: "Status", options: field_options.order_status || [] },
    { key: "payment_status", label: "Payment", options: field_options.payment_status || [] },
    { key: "order_source", label: "Channel", options: field_options.channel || [] },
    { key: "payment_method", label: "Payment Method", options: PAYMENT_METHODS },
    { key: "customer_name", label: "Customer" },
    { key: "city", label: "City" },
    { key: "warehouse_assignee", label: "Warehouse Assignee" },
  ], [field_options]);

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "created_at", filters: toolbarFilters });

  useEffect(() => setPage(1), [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/orders", authFetch));
    } catch (err) {
      setError(err.message || "Failed to load orders");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await apiFetch(`/orders/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      setMessage("Order deleted.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "order_no", label: "Order #" },
    { key: "customer_name", label: "Customer", format: (v) => v || "—" },
    { key: "order_status", label: "Status", render: (r) => <StatusBadge status={r.order_status} /> },
    { key: "payment_status", label: "Payment", render: (r) => <StatusBadge status={r.payment_status} /> },
    { key: "fulfillment_status", label: "Fulfillment", render: (r) => <StatusBadge status={r.fulfillment_status} /> },
    { key: "order_source", label: "Channel", format: (v) => ORDER_SOURCE_LABELS[v] || v || "—" },
    { key: "payment_method", label: "Method", format: (v) => PAYMENT_METHOD_LABELS[v] || v || "—" },
    { key: "city", label: "City", format: (v) => v || "—" },
    { key: "warehouse_assignee", label: "Warehouse", format: (v) => v || "—" },
    { key: "payable_amount", label: "Amount", format: (v) => formatPKR(v) },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) => (
        <div className="wh-action-btns">
          {canEdit && (
            <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/orders/edit/${row.id}`)}>
              Edit
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Order Management"
        description="All orders with filters by status, date, customer, payment method, channel, city, and warehouse assignment."
        actions={
          <Button onClick={() => navigate(`${MODULE_BASE}/orders/create`)} disabled={!canCreate}>
            Create Order
          </Button>
        }
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      {message && <div className="wh-alert wh-alert--success">{message}</div>}
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="created_at"
              filters={toolbarFilters}
              searchPlaceholder="Search orders…"
              layout="stacked"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={(row) => navigate(`${MODULE_BASE}/orders/view/${row.id}`)}
            />
          </>
        )}
      </Card>

      <ConfirmDeleteModal
        open={!!deleteRow}
        title="Delete order"
        recordName={deleteRow?.order_no || "this order"}
        onConfirm={confirmDelete}
        onClose={() => setDeleteRow(null)}
        loading={deleting}
      />
    </div>
  );
}
