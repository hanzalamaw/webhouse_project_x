import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { Button } from "../../../../../../components/Button";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { StatusBadge } from "../../../../../../components/Badge";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { formatPKR } from "../../../../../../utils/currency";
import { MODULE_BASE } from "../../constants";

export default function ManageStores() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("pos");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [limits, setLimits] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/pos/outlets?page=1&limit=10000&all=1", {}, authFetch);
      setRows(res.data || []);
      setLimits(res.limits || null);
    } catch {
      setRows([]);
      setLimits(null);
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
    { key: "outlet_name", label: "Store" },
    { key: "city", label: "City", format: (v) => v || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "terminal_count", label: "Terminals", filter: false },
    { key: "opening_balance", label: "Opening balance", filter: false, format: (v) => formatPKR(v) },
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
        <div className="wh-action-btns" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/stores/edit/${r.id}`)}>
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
        title="Stores"
        description={
          limits?.max_stores
            ? `Physical store locations for POS terminals (${limits.store_count ?? rows.length} / ${limits.max_stores} used). Click a row to view store details.`
            : "Physical store locations where POS terminals operate. Click a row to view store details."
        }
        actions={canCreate ? (
          <Button onClick={() => navigate(`${MODULE_BASE}/stores/create`)} disabled={limits?.can_create === false}>
            Create Store
          </Button>
        ) : null}
      />

      {limits && !limits.can_create && (
        <p className="wh-field__error">
          Store limit reached ({limits.store_count}/{limits.max_stores}).
        </p>
      )}

      {error && <p className="wh-field__error">{error}</p>}

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">All stores</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            page={page}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setPage}
            emptyMessage="No stores yet."
            onRowClick={(row) => navigate(`${MODULE_BASE}/stores/${row.id}`)}
          />
        )}
      </Card>

      <ConfirmDeleteModal
        open={!!deleteRow}
        title="Delete store"
        recordName={deleteRow?.outlet_name || "this store"}
        categoryLabel="store"
        cascadeItems={["Linked terminals may stop working until reassigned"]}
        onConfirm={confirmDelete}
        onClose={() => setDeleteRow(null)}
        loading={deleting}
      />
    </div>
  );
}
