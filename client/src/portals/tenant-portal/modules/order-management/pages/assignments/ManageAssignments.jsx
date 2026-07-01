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
import { apiFetch } from "../../../../../../api/client";
import { MODULE_BASE, ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES, ASSIGNMENT_TYPE_LABELS } from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "assignment_type", label: "Type", options: ASSIGNMENT_TYPES },
  { key: "status", label: "Status", options: ASSIGNMENT_STATUSES },
  { key: "assigned_to_name", label: "Assigned To" },
  { key: "order_no", label: "Order #" },
];

export default function ManageAssignments() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("order-management");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, assignment_type: "", status: "", assigned_to_name: "", order_no: "" });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "assigned_at", filters: TOOLBAR_FILTERS });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAllTableRows("/orders/assignments/list", authFetch));
    } catch (err) {
      setError(err.message);
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
      await apiFetch(`/orders/assignments/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo(() => [
    { key: "order_no", label: "Order #" },
    { key: "order_customer_name", label: "Customer", format: (v) => v || "—" },
    { key: "assignment_type", label: "Type", format: (v) => ASSIGNMENT_TYPE_LABELS[v] || v },
    { key: "assigned_to_name", label: "Assigned To" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "assigned_at", label: "Assigned", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) => (
        <div className="wh-action-btns">
          {canEdit && <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/assignments/edit/${row.id}`)}>Edit</Button>}
          {canDelete && <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>}
        </div>
      ),
    },
  ], [canEdit, canDelete, navigate]);

  return (
    <div className="wh-page">
      <PageHeader
        title="Order Assignment"
        description="Assign orders to staff, warehouse, fulfillment, courier, or verification teams."
        actions={<Button onClick={() => navigate(`${MODULE_BASE}/assignments/create`)} disabled={!canCreate}>New Assignment</Button>}
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="assigned_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search assignments…" layout="stacked" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </Card>
      <ConfirmDeleteModal open={!!deleteRow} title="Delete assignment" recordName={deleteRow?.order_no} onConfirm={confirmDelete} onClose={() => setDeleteRow(null)} loading={deleting} />
    </div>
  );
}
