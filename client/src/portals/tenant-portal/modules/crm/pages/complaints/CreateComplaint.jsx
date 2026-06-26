import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { StatusBadge } from "../../../../../../components/Badge";
import { formatDateTime } from "../../../../../../utils/dateTime";
import {
  MODULE_BASE,
  COMPLAINT_STATUSES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_ISSUE_TYPES,
  ISSUE_TYPE_LABELS,
} from "../../constants";
import { useCrmReference } from "../../hooks/useCrmReference";

const EMPTY = {
  customer_id: "",
  subject: "",
  description: "",
  status: "open",
  priority: "medium",
  issue_type: "complaint",
  assigned_to: "",
  resolution_note: "",
};

export default function CreateComplaint() {
  const { complaintId } = useParams();
  const isEdit = Boolean(complaintId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit, readOnly } = useModulePermission("crm");
  const { crm_users } = useCrmReference();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [customers, setCustomers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || (isEdit ? !canEdit : !canCreate);

  const customerOptions = useMemo(
    () => customers.map((c) => ({
      value: String(c.id),
      label: c.company_name ? `${c.customer_name} — ${c.company_name}` : c.customer_name,
    })),
    [customers]
  );

  const assigneeOptions = useMemo(
    () => crm_users.map((u) => ({ value: String(u.id), label: u.name })),
    [crm_users]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const customerRows = await fetchAllTableRows("/crm/customers", authFetch);
        setCustomers(customerRows);
        if (isEdit) {
          const row = await apiFetch(`/crm/complaints/${complaintId}`, {}, authFetch);
          setMeta(row);
          setForm({
            customer_id: String(row.customer_id),
            subject: row.subject || "",
            description: row.description || "",
            status: row.status || "open",
            priority: row.priority || "medium",
            issue_type: row.issue_type || "complaint",
            assigned_to: row.assigned_to ? String(row.assigned_to) : "",
            resolution_note: row.resolution_note || "",
          });
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })().catch(() => {});
  }, [isEdit, complaintId, authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        subject: form.subject.trim(),
        customer_id: Number(form.customer_id),
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      };
      if (isEdit) {
        await apiFetch(`/crm/complaints/${complaintId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
        navigate(`${MODULE_BASE}/complaints/manage`);
      } else {
        await apiFetch("/crm/complaints", { method: "POST", body: JSON.stringify(body) }, authFetch);
        navigate(`${MODULE_BASE}/complaints/manage`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="wh-page wh-page--wide">
        <p className="wh-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title={isEdit ? "Edit Complaint" : "Add Complaint"}
        description="Record a customer complaint, issue, or support request with full details."
        actions={
          <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/complaints/manage`)}>
            Back to complaints
          </Button>
        }
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}

      {isEdit && meta && (
        <Card>
          <div className="wh-grid-2">
            <div>
              <span className="wh-muted">Customer</span>
              <p>{meta.customer_name}</p>
            </div>
            <div>
              <span className="wh-muted">Created</span>
              <p>{formatDateTime(meta.created_at)}</p>
            </div>
            <div>
              <span className="wh-muted">Reported by</span>
              <p>{meta.created_by_name || "—"}</p>
            </div>
            <div>
              <span className="wh-muted">Current status</span>
              <p><StatusBadge status={meta.status} /></p>
            </div>
          </div>
        </Card>
      )}

      <form onSubmit={submit}>
        <Card style={{ marginTop: isEdit && meta ? 16 : 0 }}>
          <h3 className="wh-card__title">Complaint details</h3>
          <div className="wh-form-grid">
            {!isEdit && (
              <SearchableSelect
                id="customer_id"
                label="Customer"
                value={form.customer_id}
                onChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}
                options={customerOptions}
                placeholder="Search customers…"
                emptyMessage="No customers found"
              />
            )}
            <FormField id="issue_type" label="Type" as="select" value={form.issue_type} onChange={(e) => setForm((f) => ({ ...f, issue_type: e.target.value }))} disabled={disabled}>
              {COMPLAINT_ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>{ISSUE_TYPE_LABELS[t] || t}</option>
              ))}
            </FormField>
            <div className="wh-form-grid__full">
              <FormField id="subject" label="Subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} disabled={disabled} required />
            </div>
            <div className="wh-form-grid__full">
              <FormField id="description" label="Description" as="textarea" rows={5} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={disabled} />
            </div>
            <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={disabled}>
              {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </FormField>
            <FormField id="priority" label="Priority" as="select" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} disabled={disabled}>
              {COMPLAINT_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
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
            {isEdit && (
              <div className="wh-form-grid__full">
                <FormField id="resolution_note" label="Resolution Note" as="textarea" rows={3} value={form.resolution_note} onChange={(e) => setForm((f) => ({ ...f, resolution_note: e.target.value }))} disabled={disabled} />
              </div>
            )}
          </div>
        </Card>

        <div className="wh-form-grid__actions" style={{ marginTop: 16 }}>
          <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/complaints/manage`)}>Cancel</Button>
          {!disabled && (
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Complaint" : "Create Complaint"}</Button>
          )}
        </div>
      </form>
    </div>
  );
}
