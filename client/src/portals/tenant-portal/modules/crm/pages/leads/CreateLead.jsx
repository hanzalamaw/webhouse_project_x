import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { TypeWithOtherField } from "../../components/TypeWithOtherField";
import {
  MODULE_BASE,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
} from "../../constants";
import { splitPresetOrOther, resolvePresetOrOther } from "../../utils/typeFields";
import { useCrmReference } from "../../hooks/useCrmReference";

const LEAD_SOURCE_OPTIONS = LEAD_SOURCES.filter((s) => s !== "csv_import");
const NO_ASSIGNEE = "";

const EMPTY = {
  lead_name: "",
  phone: "",
  email: "",
  company_name: "",
  source_preset: "manual",
  source_custom: "",
  status: "new",
  notes: "",
  assigned_to: NO_ASSIGNEE,
};

export default function CreateLead() {
  const { leadId } = useParams();
  const isEdit = Boolean(leadId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit, readOnly } = useModulePermission("crm");
  const { crm_users } = useCrmReference();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || (isEdit ? !canEdit : !canCreate);

  const assigneeOptions = useMemo(
    () => crm_users.map((u) => ({ value: String(u.id), label: u.name })),
    [crm_users]
  );

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    apiFetch(`/crm/leads/${leadId}`, {}, authFetch)
      .then((row) => {
        if (row.status === "converted") {
          setError("Converted leads cannot be edited.");
          return;
        }
        const sourceParts = splitPresetOrOther(row.source, LEAD_SOURCE_OPTIONS);
        setForm({
          lead_name: row.lead_name || "",
          phone: row.phone || "",
          email: row.email || "",
          company_name: row.company_name || "",
          source_preset: sourceParts.preset,
          source_custom: sourceParts.custom,
          status: row.status || "new",
          notes: row.notes || "",
          assigned_to: row.assigned_to ? String(row.assigned_to) : NO_ASSIGNEE,
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isEdit, leadId, authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        lead_name: form.lead_name.trim(),
        phone: form.phone,
        email: form.email,
        company_name: form.company_name,
        source: resolvePresetOrOther(form.source_preset, form.source_custom, "Source"),
        status: form.status,
        notes: form.notes,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      };
      if (isEdit) {
        await apiFetch(`/crm/leads/${leadId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
      } else {
        await apiFetch("/crm/leads", { method: "POST", body: JSON.stringify(body) }, authFetch);
      }
      navigate(`${MODULE_BASE}/leads/manage`);
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <p className="wh-muted">Loading…</p>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={isEdit ? "Edit Lead" : "Add Lead"}
          description={
            isEdit
              ? "Update lead contact details, source, status, and assignment."
              : "Capture a new lead with contact details and assignment."
          }
          actions={
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/leads/manage`)}>
              Back to leads
            </Button>
          }
        />

        <form onSubmit={submit} className="wh-form-stack">
          <FormBlock title="Contact information" description="Who is this lead and how can you reach them?">
            <div className="wh-form-grid">
              <FormField
                id="lead_name"
                label="Lead name"
                value={form.lead_name}
                onChange={(e) => setForm((f) => ({ ...f, lead_name: e.target.value }))}
                disabled={disabled}
                required
              />
              <FormField
                id="company_name"
                label="Company"
                value={form.company_name}
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                disabled={disabled}
              />
              <FormField
                id="phone"
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                disabled={disabled}
              />
              <FormField
                id="email"
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                disabled={disabled}
              />
            </div>
          </FormBlock>

          <FormBlock title="Lead details" description="Source, pipeline status, assignment, and notes.">
            <div className="wh-form-grid">
              <TypeWithOtherField
                id="source"
                label="Source"
                preset={form.source_preset}
                custom={form.source_custom}
                onPresetChange={(v) => setForm((f) => ({ ...f, source_preset: v }))}
                onCustomChange={(v) => setForm((f) => ({ ...f, source_custom: v }))}
                options={LEAD_SOURCE_OPTIONS}
                optionLabels={LEAD_SOURCE_LABELS}
                disabled={disabled}
                customPlaceholder="e.g. Trade show, LinkedIn"
              />
              <FormField
                id="status"
                label="Status"
                as="select"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                disabled={disabled}
              >
                {LEAD_STATUSES.filter((s) => s !== "converted").map((s) => (
                  <option key={s} value={s}>{LEAD_STATUS_LABELS[s] || s}</option>
                ))}
              </FormField>
              <SearchableSelect
                id="assigned_to"
                label="Assigned to"
                value={form.assigned_to}
                onChange={(v) => setForm((f) => ({ ...f, assigned_to: v }))}
                options={assigneeOptions}
                placeholder="Search team members…"
                emptyMessage="No CRM users found"
                allowEmpty
                emptyOptionLabel="No one"
                disabled={disabled}
              />
              <div className="wh-form-grid__full">
                <FormField
                  id="notes"
                  label="Notes"
                  as="textarea"
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  disabled={disabled}
                />
              </div>
            </div>
          </FormBlock>

          {error && <p className="wh-field__error">{error}</p>}

          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/leads/manage`)}>
              Cancel
            </Button>
            {!disabled && (
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save Lead" : "Create Lead"}
              </Button>
            )}
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
