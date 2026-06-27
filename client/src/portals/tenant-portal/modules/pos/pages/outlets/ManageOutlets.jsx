import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
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
import { OUTLET_STATUSES } from "../../constants";

const EMPTY_FORM = { outlet_name: "", location: "", city: "", status: "active" };

export default function ManageOutlets() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("pos");
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
    setError("");
    try {
      setRows(await fetchAllTableRows("/pos/outlets", authFetch));
    } catch (err) {
      setError(err.message || "Failed to load outlets");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const createOutlet = async (e) => {
    e.preventDefault();
    if (!form.outlet_name.trim()) {
      setError("Outlet name is required");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch("/pos/outlets", { method: "POST", body: JSON.stringify(form) }, authFetch);
      setForm(EMPTY_FORM);
      setMessage("Outlet created.");
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
    setError("");
    try {
      await apiFetch(
        `/pos/outlets/${editRow.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            outlet_name: editRow.outlet_name,
            location: editRow.location,
            city: editRow.city,
            status: editRow.status,
          }),
        },
        authFetch
      );
      setEditRow(null);
      setMessage("Outlet updated.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await apiFetch(`/pos/outlets/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      setMessage("Outlet deleted.");
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
    { key: "location", label: "Location", format: (v) => v || "—" },
    { key: "terminal_count", label: "Terminals", filter: false },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (r) => (
        <div className="wh-action-btns">
          {canEdit && (
            <Button variant="secondary" className="wh-btn--sm" onClick={() => setEditRow({ ...r })}>
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
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Outlets"
        description="Physical store locations where POS terminals operate."
      />

      {canCreate && (
        <Card className="wh-inv-create-card">
          <h3 className="wh-card__title">Create outlet</h3>
          <form onSubmit={createOutlet} className="wh-form">
            <div className="wh-form-grid wh-form-grid--3">
              <FormField id="outlet_name" label="Outlet name" value={form.outlet_name} onChange={(e) => setForm((f) => ({ ...f, outlet_name: e.target.value }))} required />
              <FormField id="city" label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {OUTLET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
            </div>
            <FormField id="location" label="Location" as="textarea" rows={3} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            {error && !editRow && <p className="wh-field__error">{error}</p>}
            {message && <p className="wh-form-message">{message}</p>}
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create Outlet"}</Button>
          </form>
        </Card>
      )}

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">All outlets</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable columns={columns} rows={rows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} emptyMessage="No outlets yet." />
        )}
      </Card>

      {editRow && (
        <Modal open title="Edit outlet" onClose={() => setEditRow(null)}>
          <div className="wh-form-grid wh-form-grid--3">
            <FormField id="edit_outlet_name" label="Outlet name" value={editRow.outlet_name} onChange={(e) => setEditRow((r) => ({ ...r, outlet_name: e.target.value }))} />
            <FormField id="edit_city" label="City" value={editRow.city || ""} onChange={(e) => setEditRow((r) => ({ ...r, city: e.target.value }))} />
            <FormField id="edit_status" label="Status" as="select" value={editRow.status} onChange={(e) => setEditRow((r) => ({ ...r, status: e.target.value }))}>
              {OUTLET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </FormField>
          </div>
          <FormField id="edit_location" label="Location" as="textarea" rows={3} value={editRow.location || ""} onChange={(e) => setEditRow((r) => ({ ...r, location: e.target.value }))} />
          {error && editRow && <p className="wh-field__error">{error}</p>}
          <div className="wh-modal__actions">
            <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>Save</Button>
          </div>
        </Modal>
      )}

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
