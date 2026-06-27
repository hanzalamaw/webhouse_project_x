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
import { TERMINAL_STATUSES } from "../../constants";

const EMPTY_FORM = { terminal_name: "", device_code: "1", outlet_id: "", status: "active" };

export default function ManageTerminals() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("pos");
  const [rows, setRows] = useState([]);
  const [outlets, setOutlets] = useState([]);
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

  const createTerminal = async (e) => {
    e.preventDefault();
    if (!form.terminal_name.trim() || !form.outlet_id) {
      setError("Terminal name and outlet are required");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(
        "/pos/terminals",
        { method: "POST", body: JSON.stringify({ ...form, outlet_id: Number(form.outlet_id) }) },
        authFetch
      );
      setForm(EMPTY_FORM);
      setMessage("Terminal created.");
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
        `/pos/terminals/${editRow.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            terminal_name: editRow.terminal_name,
            device_code: editRow.device_code,
            outlet_id: Number(editRow.outlet_id),
            status: editRow.status,
          }),
        },
        authFetch
      );
      setEditRow(null);
      setMessage("Terminal updated.");
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
      await apiFetch(`/pos/terminals/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      setMessage("Terminal deleted.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "terminal_name", label: "Terminal" },
    { key: "device_code", label: "Machine code" },
    { key: "outlet_name", label: "Outlet" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (r) => (
        <div className="wh-action-btns">
          {canEdit && (
            <Button variant="secondary" className="wh-btn--sm" onClick={() => setEditRow({ ...r, outlet_id: String(r.outlet_id) })}>
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
        title="Terminals"
        description="Register checkout devices. Cashiers pair using the machine code in POS Terminal."
      />

      {!outlets.length && !loading && (
        <div className="wh-alert wh-alert--error">
          Create an outlet first before adding terminals.
        </div>
      )}

      {canCreate && (
        <Card className="wh-inv-create-card">
          <h3 className="wh-card__title">Create terminal</h3>
          <form onSubmit={createTerminal} className="wh-form">
            <div className="wh-form-grid wh-form-grid--3">
              <FormField id="terminal_name" label="Terminal name" value={form.terminal_name} onChange={(e) => setForm((f) => ({ ...f, terminal_name: e.target.value }))} required />
              <FormField id="device_code" label="Machine code" value={form.device_code} onChange={(e) => setForm((f) => ({ ...f, device_code: e.target.value }))} required />
              <FormField id="outlet_id" label="Outlet" as="select" value={form.outlet_id} onChange={(e) => setForm((f) => ({ ...f, outlet_id: e.target.value }))} required>
                <option value="">Select outlet</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </FormField>
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {TERMINAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
            </div>
            {error && !editRow && <p className="wh-field__error">{error}</p>}
            {message && <p className="wh-form-message">{message}</p>}
            <Button type="submit" disabled={saving || !outlets.length}>{saving ? "Creating…" : "Create Terminal"}</Button>
          </form>
        </Card>
      )}

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">All terminals</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable columns={columns} rows={rows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} emptyMessage="No terminals yet." />
        )}
      </Card>

      {editRow && (
        <Modal open title="Edit terminal" onClose={() => setEditRow(null)}>
          <div className="wh-form-grid wh-form-grid--3">
            <FormField id="edit_terminal_name" label="Terminal name" value={editRow.terminal_name} onChange={(e) => setEditRow((r) => ({ ...r, terminal_name: e.target.value }))} />
            <FormField id="edit_device_code" label="Machine code" value={editRow.device_code} onChange={(e) => setEditRow((r) => ({ ...r, device_code: e.target.value }))} />
            <FormField id="edit_outlet_id" label="Outlet" as="select" value={editRow.outlet_id} onChange={(e) => setEditRow((r) => ({ ...r, outlet_id: e.target.value }))}>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
            </FormField>
            <FormField id="edit_status" label="Status" as="select" value={editRow.status} onChange={(e) => setEditRow((r) => ({ ...r, status: e.target.value }))}>
              {TERMINAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </FormField>
          </div>
          {error && editRow && <p className="wh-field__error">{error}</p>}
          <div className="wh-modal__actions">
            <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>Save</Button>
          </div>
        </Modal>
      )}

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
