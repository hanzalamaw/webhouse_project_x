import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { Button } from "../../../../../../components/Button";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { StatusBadge } from "../../../../../../components/Badge";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE } from "../../constants";

export default function ManageOutlets() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("pos");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAllTableRows("/pos/outlets", authFetch));
    } catch {
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
      await apiFetch(`/pos/outlets/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "outlet_name", label: "Outlet" },
    { key: "city", label: "City", format: (v) => v || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "terminal_count", label: "Terminals", filter: false },
    {
      key: "store_open_time",
      label: "Opens",
      filter: false,
      format: (v) => (v ? String(v).slice(0, 5) : "—"),
    },
    {
      key: "store_close_time",
      label: "Closes",
      filter: false,
      format: (v) => (v ? String(v).slice(0, 5) : "—"),
    },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (r) => (
        <div className="wh-action-btns">
          {canEdit && (
            <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/outlets/edit/${r.id}`)}>
              Edit
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(r)}>
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
        title="Outlets"
        description="Physical store locations where POS terminals operate."
        actions={canCreate ? <Button onClick={() => navigate(`${MODULE_BASE}/outlets/create`)}>Create Outlet</Button> : null}
      />

      {error && <p className="wh-field__error">{error}</p>}

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">All outlets</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable columns={columns} rows={rows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} emptyMessage="No outlets yet." />
        )}
      </Card>

      <ConfirmDeleteModal
        open={!!deleteRow}
        title="Delete outlet"
        recordName={deleteRow?.outlet_name || "this outlet"}
        categoryLabel="outlet"
        cascadeItems={["Linked terminals may stop working until reassigned"]}
        onConfirm={confirmDelete}
        onClose={() => setDeleteRow(null)}
        loading={deleting}
      />
    </div>
  );
}
