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

export default function ManageTerminals() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("pos");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, refRes] = await Promise.all([
        fetchAllTableRows("/pos/terminals", authFetch),
        apiFetch("/pos/reference", {}, authFetch),
      ]);
      setRows(data);
      setOutlets(refRes.outlets || []);
    } catch (err) {
      setError(err.message || "Failed to load terminals");
      setRows([]);
      setOutlets([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await apiFetch(`/pos/terminals/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "terminal_name", label: "Terminal" },
    { key: "device_code", label: "Terminal code" },
    { key: "outlet_name", label: "Outlet" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (r) => (
        <div className="wh-action-btns">
          {canEdit && (
            <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/terminals/edit/${r.id}`)}>
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
        title="Terminals"
        description="Register checkout devices. Cashiers pair using the terminal code in POS Terminal."
        actions={canCreate ? <Button onClick={() => navigate(`${MODULE_BASE}/terminals/create`)} disabled={!outlets.length}>Create Terminal</Button> : null}
      />

      {!outlets.length && !loading && (
        <p className="wh-field__error">Create an outlet first before adding terminals.</p>
      )}

      {error && <p className="wh-field__error">{error}</p>}

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">All terminals</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable columns={columns} rows={rows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} emptyMessage="No terminals yet." />
        )}
      </Card>

      <ConfirmDeleteModal
        open={!!deleteRow}
        title="Delete terminal"
        recordName={deleteRow?.terminal_name || "this terminal"}
        categoryLabel="terminal"
        onConfirm={confirmDelete}
        onClose={() => setDeleteRow(null)}
        loading={deleting}
      />
    </div>
  );
}
