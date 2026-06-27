import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { Button } from "../../../../../../components/Button";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { StatusBadge } from "../../../../../../components/Badge";
import { formatDateTime } from "../../../../../../utils/dateTime";

const MODULE_BASE = "/app/m/inventory-procurement";

export default function ManageWarehouses() {
  const { authFetch } = useAuth();
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
      const res = await apiFetch("/inventory/warehouses?page=1&limit=10000&all=1", {}, authFetch);
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
      await apiFetch(`/inventory/warehouses/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "warehouse_name", label: "Warehouse" },
    { key: "location", label: "Location", format: (v) => v || "—" },
    { key: "city", label: "City", format: (v) => v || "—" },
    { key: "product_count", label: "Products", filter: false },
    { key: "total_units", label: "Total Units", filter: false },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/warehouses/edit/${row.id}`)}>Edit</Button>
          <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Warehouses"
        description={
          limits?.max_warehouses
            ? `Create and manage warehouse locations (${limits.warehouse_count ?? rows.length} / ${limits.max_warehouses} used).`
            : "Create and manage warehouse locations for inventory storage."
        }
        actions={
          <Button onClick={() => navigate(`${MODULE_BASE}/warehouses/create`)} disabled={limits?.can_create === false}>
            Create Warehouse
          </Button>
        }
      />

      {limits && !limits.can_create && (
        <p className="wh-field__error">
          Warehouse limit reached ({limits.warehouse_count}/{limits.max_warehouses}).
        </p>
      )}

      {error && <p className="wh-field__error">{error}</p>}

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">All warehouses</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable columns={columns} rows={rows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
        )}
      </Card>

      <ConfirmDeleteModal open={!!deleteRow} title="Delete warehouse" recordName={deleteRow?.warehouse_name || "this warehouse"} onConfirm={confirmDelete} onClose={() => setDeleteRow(null)} loading={deleting} />
    </div>
  );
}
