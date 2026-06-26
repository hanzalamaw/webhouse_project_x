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
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { Modal } from "../../../../../../components/Modal";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { StatusBadge } from "../../../../../../components/Badge";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE, LEAD_SOURCES, LEAD_STATUSES, LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from "../../constants";
import { useCrmReference } from "../../hooks/useCrmReference";

const TOOLBAR_FILTERS = [
  { key: "status", label: "Status", options: LEAD_STATUSES.filter((s) => s !== "converted") },
  { key: "source", label: "Source", options: LEAD_SOURCES },
  { key: "assigned_to_name", label: "Assigned To" },
];

const EMPTY_FORM = {
  lead_name: "",
  phone: "",
  email: "",
  company_name: "",
  source: "manual",
  status: "new",
  notes: "",
  assigned_to: "",
};

export default function ManageLeads() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("crm");
  const navigate = useNavigate();
  const { crm_users } = useCrmReference();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, status: "", source: "", assigned_to_name: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const assigneeOptions = useMemo(
    () => crm_users.map((u) => ({ value: String(u.id), label: u.name })),
    [crm_users]
  );

  const filteredRows = useMemo(
    () => applyToolbarFilters(rows, toolbar, { dateField: "created_at", filters: TOOLBAR_FILTERS }),
    [rows, toolbar]
  );

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

  const openCreate = () => {
    if (!canCreate) return;
    setEditId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    if (!canEdit || row.status === "converted") return;
    setEditId(row.id);
    setForm({
      lead_name: row.lead_name || "",
      phone: row.phone || "",
      email: row.email || "",
      company_name: row.company_name || "",
      source: row.source || "manual",
      status: row.status || "new",
      notes: row.notes || "",
      assigned_to: row.assigned_to ? String(row.assigned_to) : "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = {
        ...form,
        lead_name: form.lead_name.trim(),
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      };
      if (editId) {
        await apiFetch(`/crm/leads/${editId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
        setMessage("Lead updated.");
      } else {
        await apiFetch("/crm/leads", { method: "POST", body: JSON.stringify(body) }, authFetch);
        setMessage("Lead created.");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

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
      render: (row) => (
        <div className="wh-action-btns">
          {row.status === "converted" && row.converted_customer_id && (
            <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/customers/${row.converted_customer_id}`)}>
              Customer
            </Button>
          )}
          {canEdit && row.status !== "converted" && (
            <>
              <Button variant="secondary" className="wh-btn--sm" onClick={() => openEdit(row)}>Edit</Button>
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
        actions={
          <div className="wh-action-btns">
            {canCreate && (
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/import-export`)}>
              Import / Export
            </Button>
            )}
            <Button onClick={openCreate} disabled={!canCreate}>Add Lead</Button>
          </div>
        }
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      {message && <div className="wh-alert wh-alert--success">{message}</div>}
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="created_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search leads…" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Lead" : "Add Lead"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || (editId ? !canEdit : !canCreate)}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="wh-form-grid wh-form-grid--modal">
          <FormField id="lead_name" label="Lead Name" value={form.lead_name} onChange={(e) => setForm((f) => ({ ...f, lead_name: e.target.value }))} />
          <FormField id="company_name" label="Company" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
          <FormField id="phone" label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <FormField id="email" label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <FormField id="source" label="Source" as="select" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>{LEAD_SOURCE_LABELS[s] || s}</option>
            ))}
          </FormField>
          <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            {LEAD_STATUSES.filter((s) => s !== "converted").map((s) => (
              <option key={s} value={s}>{LEAD_STATUS_LABELS[s] || s}</option>
            ))}
          </FormField>
          <SearchableSelect
            id="assigned_to"
            label="Assigned To"
            value={form.assigned_to}
            onChange={(v) => setForm((f) => ({ ...f, assigned_to: v }))}
            options={assigneeOptions}
            placeholder="Search team members…"
            emptyMessage="No CRM users found"
          />
          <div className="wh-form-grid__full">
            <FormField
              id="notes"
              label="Notes"
              as="textarea"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

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
