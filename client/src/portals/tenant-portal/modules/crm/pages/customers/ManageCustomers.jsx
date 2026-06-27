import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
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
import { MODULE_BASE, CUSTOMER_TYPES, CUSTOMER_STATUSES, ACTIVE_CUSTOMER_DAYS } from "../../constants";
import { formatCustomerType } from "../../utils/typeFields";

const TOOLBAR_FILTERS = [
  { key: "status", label: "Status", options: CUSTOMER_STATUSES },
  { key: "customer_type", label: "Type", options: CUSTOMER_TYPES },
];

export default function ManageCustomers() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("crm");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, status: "", customer_type: "" });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "created_at", filters: TOOLBAR_FILTERS });

  useEffect(() => setPage(1), [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/crm/customers", authFetch));
    } catch (err) {
      setError(err.message || "Failed to load customers");
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
      await apiFetch(`/crm/customers/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      setMessage("Customer deleted.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "customer_name", label: "Customer" },
    { key: "company_name", label: "Company", format: (v) => v || "—" },
    { key: "customer_type", label: "Type", format: (v) => formatCustomerType(v) },
    { key: "phone", label: "Phone", format: (v) => v || "—" },
    { key: "email", label: "Email", format: (v) => v || "—" },
    { key: "tags", label: "Tags", format: (_, r) => (r.tags || []).join(", ") || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "recently_active",
      label: "Recent Orders",
      filter: false,
      format: (_, r) => (r.recently_active ? `Active (${ACTIVE_CUSTOMER_DAYS}d)` : "—"),
    },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (row) => (
        <div className="wh-action-btns" onClick={(e) => e.stopPropagation()}>
          {canEdit && <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/customers/edit/${row.id}`)}>Edit</Button>}
          {canDelete && <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>}
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Customers"
        description={`Customer profiles with tags and status. Click a row to view details. Recently active = ordered in the last ${ACTIVE_CUSTOMER_DAYS} days.`}
        actions={
          <div className="wh-action-btns">
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/import-export`)}>
              Import / Export
            </Button>
            <Button onClick={() => navigate(`${MODULE_BASE}/customers/create`)} disabled={!canCreate}>Add Customer</Button>
          </div>
        }
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      {message && <div className="wh-alert wh-alert--success">{message}</div>}
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="created_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search customers…" />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={(row) => navigate(`${MODULE_BASE}/customers/${row.id}`)}
            />
          </>
        )}
      </Card>

      <ConfirmDeleteModal
        open={!!deleteRow}
        title="Delete customer"
        recordName={deleteRow?.customer_name || "this customer"}
        cascadeItems={[
          "All addresses for this customer",
          "All notes and remarks",
          "All complaints linked to this customer",
          "Customer tags",
          "After 7 days, this record is permanently removed (linked orders may be affected)",
        ]}
        onConfirm={confirmDelete}
        onClose={() => setDeleteRow(null)}
        loading={deleting}
      />
    </div>
  );
}
