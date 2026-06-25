import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { Modal } from "../../../../../../components/Modal";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { StatusBadge } from "../../../../../../components/Badge";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { PRODUCT_STATUS } from "../../constants";

const EMPTY_FORM = { warehouse_name: "", location: "", city: "", status: "active" };

export default function ManageWarehouses() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllTableRows("/inventory/warehouses", authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const createWarehouse = async (e) => {
    e.preventDefault();
    if (!form.warehouse_name.trim()) {
      setError("Warehouse name is required");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch("/inventory/warehouses", { method: "POST", body: JSON.stringify(form) }, authFetch);
      setForm(EMPTY_FORM);
      setMessage("Warehouse created.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      await apiFetch(`/inventory/warehouses/${editRow.id}`, { method: "PUT", body: JSON.stringify(editRow) }, authFetch);
      setEditRow(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

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
          <Button variant="secondary" className="wh-btn--sm" onClick={() => setEditRow({ ...row })}>Edit</Button>
          <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Warehouses" description="Create and manage warehouse locations for inventory storage." />

      <Card className="wh-inv-create-card">
        <h3 className="wh-card__title">Create warehouse</h3>
        <form onSubmit={createWarehouse} className="wh-form">
          <div className="wh-form-grid wh-form-grid--3">
            <FormField id="wh_name" label="Warehouse name" value={form.warehouse_name} onChange={(e) => setForm((f) => ({ ...f, warehouse_name: e.target.value }))} required />
            <FormField id="wh_city" label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            <FormField id="wh_status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {PRODUCT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </FormField>
          </div>
          <FormField id="wh_location" label="Location" as="textarea" rows={3} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          {error && <p className="wh-field__error">{error}</p>}
          {message && <p className="wh-form-message">{message}</p>}
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create Warehouse"}</Button>
        </form>
      </Card>

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">All warehouses</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable columns={columns} rows={rows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
        )}
      </Card>

      {editRow && (
        <Modal open title="Edit warehouse" onClose={() => setEditRow(null)}>
          <div className="wh-form-grid wh-form-grid--3">
            <FormField id="edit_wh_name" label="Warehouse name" value={editRow.warehouse_name} onChange={(e) => setEditRow((r) => ({ ...r, warehouse_name: e.target.value }))} />
            <FormField id="edit_wh_city" label="City" value={editRow.city || ""} onChange={(e) => setEditRow((r) => ({ ...r, city: e.target.value }))} />
            <FormField id="edit_wh_status" label="Status" as="select" value={editRow.status} onChange={(e) => setEditRow((r) => ({ ...r, status: e.target.value }))}>
              {PRODUCT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </FormField>
          </div>
          <FormField id="edit_wh_location" label="Location" as="textarea" rows={3} value={editRow.location || ""} onChange={(e) => setEditRow((r) => ({ ...r, location: e.target.value }))} />
          <div className="wh-modal__actions">
            <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>Save</Button>
          </div>
        </Modal>
      )}

      <ConfirmDeleteModal open={!!deleteRow} title="Delete warehouse" recordName={deleteRow?.warehouse_name || "this warehouse"} onConfirm={confirmDelete} onClose={() => setDeleteRow(null)} loading={deleting} />
    </div>
  );
}
