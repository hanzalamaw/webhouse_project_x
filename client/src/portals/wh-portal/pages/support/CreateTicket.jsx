import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { FormBlock } from "../../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../components/FormPageLayout";
import { TenantSelect } from "../../../../components/TenantSelect";
import { UnsavedChangesDialog } from "../../../../components/UnsavedChangesDialog";
import { useAuth } from "../../../../context/AuthContext";
import { useUnsavedChangesGuard } from "../../../../hooks/useUnsavedChangesGuard";
import { apiFetch } from "../../../../api/client";

const TICKET_STATUS = ["open", "pending", "resolved"];
const EMPTY_FORM = { tenant_id: "", subject: "", description: "", status: "open" };

function serializeForm(form) {
  return JSON.stringify(form);
}

export default function CreateTicket() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const { ticketId } = useParams();
  const isEdit = Boolean(ticketId);
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);

  const isDirty = useMemo(
    () => (isEdit ? baseline !== null && serializeForm(form) !== baseline : serializeForm(form) !== serializeForm(EMPTY_FORM)),
    [baseline, form, isEdit]
  );
  const { dialogOpen, stayOnPage, leavePage } = useUnsavedChangesGuard(isDirty, { enabled: isEdit || isDirty });

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setPageLoading(true);
    apiFetch(`/support-tickets/${ticketId}`, {}, authFetch)
      .then((row) => {
        if (!active) return;
        const next = {
          tenant_id: String(row.tenant_id || ""),
          subject: row.subject || "",
          description: row.description || "",
          status: row.status || "open",
        };
        setForm(next);
        setBaseline(serializeForm(next));
        setCompanyName(row.company_name || "");
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load ticket");
      })
      .finally(() => {
        if (active) setPageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isEdit, ticketId, authFetch]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!form.tenant_id) {
      setError("Please select a tenant.");
      return;
    }
    if (!form.subject.trim()) {
      setError("Please enter a subject.");
      return;
    }
    if (!form.description.trim()) {
      setError("Please enter a description.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        tenant_id: Number(form.tenant_id),
        subject: form.subject.trim(),
        description: form.description.trim(),
        status: form.status,
      };
      if (isEdit) {
        await apiFetch(`/support-tickets/${ticketId}`, { method: "PUT", body: JSON.stringify(payload) }, authFetch);
        setBaseline(serializeForm(form));
        navigate("/webhouse-portal/support/manage");
        return;
      }
      await apiFetch("/support-tickets", { method: "POST", body: JSON.stringify(payload) }, authFetch);
      setMessage("Support ticket created.");
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <p className="wh-muted">Loading ticket…</p>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={isEdit ? "Edit Support Ticket" : "Create Support Ticket"}
          description={
            isEdit
              ? `Update ticket for ${companyName || "this tenant"}.`
              : "Log client issues, requests, complaints, or technical problems on behalf of a tenant."
          }
          actions={
            isEdit ? (
              <Button type="button" variant="secondary" onClick={() => navigate("/webhouse-portal/support/manage")}>
                Back to tickets
              </Button>
            ) : null
          }
        />
        <form onSubmit={handleSubmit} className="wh-form-stack">
          <FormPageAlerts error={error} message={message} />
          <FormBlock title="Ticket details" description="Which tenant is this for, and what is the issue?">
            <TenantSelect
              id="ticket_tenant"
              label="Tenant"
              value={form.tenant_id}
              onChange={(v) => setForm((f) => ({ ...f, tenant_id: v }))}
              disabled={isEdit}
            />
            <FormField id="subject" label="Subject" value={form.subject} onChange={update("subject")} required />
            <FormField
              id="description"
              label="Description"
              as="textarea"
              rows={5}
              value={form.description}
              onChange={update("description")}
              required
            />
            {isEdit && (
              <FormField id="status" label="Status" as="select" value={form.status} onChange={update("status")}>
                {TICKET_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </FormField>
            )}
          </FormBlock>
          <FormActions>
            {isEdit && (
              <Button type="button" variant="secondary" onClick={() => navigate("/webhouse-portal/support/manage")}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : isEdit ? "Save ticket" : "Create ticket"}
            </Button>
          </FormActions>
        </form>
      </FormPageLayout>
      <UnsavedChangesDialog open={dialogOpen} onStay={stayOnPage} onDiscard={leavePage} />
    </div>
  );
}
