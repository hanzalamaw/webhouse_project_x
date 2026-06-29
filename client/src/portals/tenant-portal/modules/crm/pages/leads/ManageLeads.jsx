import { useState, useEffect, useCallback } from "react";
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
import { MODULE_BASE, LEAD_SOURCES, LEAD_STATUSES, LEAD_SOURCE_LABELS } from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "status", label: "Status", options: LEAD_STATUSES.filter((s) => s !== "converted") },
  { key: "source", label: "Source", options: LEAD_SOURCES },
  { key: "assigned_to_name", label: "Assigned To" },
];

export default function ManageLeads() {
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
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, status: "", source: "", assigned_to_name: "" });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "created_at", filters: TOOLBAR_FILTERS });

  useEffect(() => setPage(1), [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/crm/leads", authFetch));
    } catch (err) {
      setError(err.message || "Failed to load leads");
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
      await apiFetch(`/crm/leads/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      setMessage("Lead deleted.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const convertLead = async (row) => {
    if (!canEdit || row.status === "converted") return;
    try {
      await apiFetch(`/crm/leads/${row.id}/convert`, { method: "POST", body: JSON.stringify({}) }, authFetch);
      setMessage("Lead converted to customer.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const columns = [
    { key: "lead_name", label: "Lead" },
    { key: "phone", label: "Phone", format: (v) => v || "—" },
    { key: "email", label: "Email", format: (v) => v || "—" },
    { key: "source", label: "Source", format: (v) => LEAD_SOURCE_LABELS[v] || v || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "assigned_to_name", label: "Assigned", format: (v) => v || "—" },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) => (
        <div className="wh-action-btns">
          {row.status === "converted" && row.converted_customer_id && (
            <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/customers/${row.converted_customer_id}`)}>
              Customer
            </Button>
          )}
          {canEdit && row.status !== "converted" && (
            <>
              <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/leads/edit/${row.id}`)}>Edit</Button>
              <Button variant="secondary" className="wh-btn--sm" onClick={() => convertLead(row)}>Convert</Button>
            </>
          )}
          {canDelete && row.status !== "converted" && (
            <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Leads"
        description="Capture and manage potential customers. Convert qualified leads into customer profiles."
        actions={<Button onClick={() => navigate(`${MODULE_BASE}/leads/create`)} disabled={!canCreate}>Add Lead</Button>}
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      {message && <div className="wh-alert wh-alert--success">{message}</div>}
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="created_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search leads…" />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={(row) => navigate(`${MODULE_BASE}/leads/view/${row.id}`)}
            />
          </>
        )}
      </Card>

      <ConfirmDeleteModal
        open={!!deleteRow}
        title="Delete lead"
        recordName={deleteRow?.lead_name || "this lead"}
        onConfirm={confirmDelete}
        onClose={() => setDeleteRow(null)}
        loading={deleting}
      />
    </div>
  );
}
