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
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { formatDateTime } from "../../../../../../utils/dateTime";
import {
  COMPLAINT_STATUSES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_ISSUE_TYPES,
  ISSUE_TYPE_LABELS,
  MODULE_BASE,
} from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "status", label: "Status", options: COMPLAINT_STATUSES },
  { key: "priority", label: "Priority", options: COMPLAINT_PRIORITIES },
  { key: "issue_type", label: "Type", options: COMPLAINT_ISSUE_TYPES },
];

export default function ManageComplaints() {
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
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, status: "", priority: "", issue_type: "" });

  const filteredRows = useMemo(
    () => applyToolbarFilters(rows, toolbar, { dateField: "created_at", filters: TOOLBAR_FILTERS }),
    [rows, toolbar]
  );

  useEffect(() => setPage(1), [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/crm/complaints", authFetch));
    } catch (err) {
      setError(err.message || "Failed to load complaints");
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
      await apiFetch(`/crm/complaints/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      setMessage("Complaint deleted.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "subject", label: "Subject" },
    { key: "customer_name", label: "Customer" },
    { key: "issue_type", label: "Type", format: (v) => ISSUE_TYPE_LABELS[v] || v },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
    { key: "assigned_to_name", label: "Assigned", format: (v) => v || "—" },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (row) => (
        <div className="wh-action-btns">
          {canEdit && <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/complaints/edit/${row.id}`)}>Edit</Button>}
          {canDelete && <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>}
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Complaints & Support"
        description="Track customer complaints, issues, and requests through resolution."
        actions={<Button onClick={() => navigate(`${MODULE_BASE}/complaints/create`)} disabled={!canCreate}>Add Complaint</Button>}
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      {message && <div className="wh-alert wh-alert--success">{message}</div>}
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="created_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search complaints…" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ConfirmDeleteModal
        open={!!deleteRow}
        title="Delete complaint"
        recordName={deleteRow?.subject || "this complaint"}
        onConfirm={confirmDelete}
        onClose={() => setDeleteRow(null)}
        loading={deleting}
      />
    </div>
  );
}
