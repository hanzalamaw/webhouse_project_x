import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import {
  MODULE_BASE,
  CUSTOMER_TYPES,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_STATUS_LABELS,
  ADDRESS_TYPES,
  NOTE_TYPES,
  NOTE_TYPE_LABELS,
} from "../../constants";

const EMPTY = {
  customer_name: "",
  company_name: "",
  customer_type: "retailer",
  phone: "",
  email: "",
  status: "active",
  note: "",
  tags: "",
};

const EMPTY_ADDRESS = {
  address_type: "billing",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  is_default: true,
};

export default function CreateCustomer() {
  const { customerId } = useParams();
  const isEdit = Boolean(customerId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit, readOnly } = useModulePermission("crm");
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [initialNote, setInitialNote] = useState({ note_type: "note", body: "" });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const disabled = readOnly || (isEdit ? !canEdit : !canCreate);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    apiFetch(`/crm/customers/${customerId}`, {}, authFetch)
      .then((row) => {
        setForm({
          customer_name: row.customer_name || "",
          company_name: row.company_name || "",
          customer_type: row.customer_type || "retailer",
          phone: row.phone || "",
          email: row.email || "",
          status: row.status || "active",
          note: row.note || "",
          tags: (row.tags || []).map((t) => t.tag_name).join(", "),
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isEdit, customerId, authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const body = {
        customer_name: form.customer_name.trim(),
        company_name: form.company_name.trim() || null,
        customer_type: form.customer_type,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        status: form.status,
        note: form.note.trim() || null,
        tags,
      };

      if (isEdit) {
        await apiFetch(`/crm/customers/${customerId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
        setMessage("Customer updated.");
        navigate(`${MODULE_BASE}/customers/${customerId}`);
        return;
      }

      const created = await apiFetch("/crm/customers", { method: "POST", body: JSON.stringify(body) }, authFetch);
      const id = created.id;

      if (String(address.address || "").trim()) {
        await apiFetch(`/crm/customers/${id}/addresses`, {
          method: "POST",
          body: JSON.stringify({
            ...address,
            address: address.address.trim(),
            city: address.city.trim() || null,
            state: address.state.trim() || null,
            postal_code: address.postal_code.trim() || null,
          }),
        }, authFetch);
      }

      if (String(initialNote.body || "").trim()) {
        await apiFetch(`/crm/customers/${id}/notes`, {
          method: "POST",
          body: JSON.stringify(initialNote),
        }, authFetch);
      }

      navigate(`${MODULE_BASE}/customers/${id}`);
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
        title={isEdit ? "Edit Customer" : "Add Customer"}
        description={
          isEdit
            ? "Update customer contact details, type, status, and tags."
            : "Create a full customer profile with contact details, address, and notes."
        }
        actions={
          <Button
            variant="secondary"
            onClick={() => navigate(isEdit ? `${MODULE_BASE}/customers/${customerId}` : `${MODULE_BASE}/customers/manage`)}
          >
            {isEdit ? "Back to profile" : "Back to customers"}
          </Button>
        }
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      {message && <div className="wh-alert wh-alert--success">{message}</div>}

      <form onSubmit={submit}>
        <Card>
          <h3 className="wh-card__title">Customer details</h3>
          <div className="wh-form-grid">
            <FormField id="customer_name" label="Customer Name" value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} disabled={disabled} required />
            <FormField id="company_name" label="Company" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} disabled={disabled} />
            <FormField id="customer_type" label="Type" as="select" value={form.customer_type} onChange={(e) => setForm((f) => ({ ...f, customer_type: e.target.value }))} disabled={disabled}>
              {CUSTOMER_TYPES.map((t) => (
                <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t] || t}</option>
              ))}
            </FormField>
            <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={disabled}>
              {CUSTOMER_STATUSES.map((s) => (
                <option key={s} value={s}>{CUSTOMER_STATUS_LABELS[s] || s}</option>
              ))}
            </FormField>
            <FormField id="phone" label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} disabled={disabled} />
            <FormField id="email" label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} disabled={disabled} />
            <div className="wh-form-grid__full">
              <FormField id="tags" label="Tags" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} disabled={disabled} placeholder="Comma-separated (e.g. vip, lahore)" />
            </div>
            <div className="wh-form-grid__full">
              <FormField id="note" label="Summary Note" as="textarea" rows={3} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} disabled={disabled} />
            </div>
          </div>
        </Card>

        {!isEdit && (
          <>
            <Card style={{ marginTop: 16 }}>
              <h3 className="wh-card__title">Default address (optional)</h3>
              <div className="wh-form-grid">
                <FormField id="address_type" label="Type" as="select" value={address.address_type} onChange={(e) => setAddress((a) => ({ ...a, address_type: e.target.value }))} disabled={disabled}>
                  {ADDRESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </FormField>
                <FormField id="is_default" label="Default">
                  <label>
                    <input type="checkbox" checked={address.is_default} onChange={(e) => setAddress((a) => ({ ...a, is_default: e.target.checked }))} disabled={disabled} />
                    {" "}Set as default address
                  </label>
                </FormField>
                <div className="wh-form-grid__full">
                  <FormField id="address" label="Street address" as="textarea" rows={2} value={address.address} onChange={(e) => setAddress((a) => ({ ...a, address: e.target.value }))} disabled={disabled} />
                </div>
                <FormField id="city" label="City" value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} disabled={disabled} />
                <FormField id="state" label="State / Province" value={address.state} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))} disabled={disabled} />
                <FormField id="postal_code" label="Postal code" value={address.postal_code} onChange={(e) => setAddress((a) => ({ ...a, postal_code: e.target.value }))} disabled={disabled} />
              </div>
            </Card>

            <Card style={{ marginTop: 16 }}>
              <h3 className="wh-card__title">Initial note (optional)</h3>
              <div className="wh-form-grid">
                <FormField id="note_type" label="Note type" as="select" value={initialNote.note_type} onChange={(e) => setInitialNote((n) => ({ ...n, note_type: e.target.value }))} disabled={disabled}>
                  {NOTE_TYPES.map((t) => <option key={t} value={t}>{NOTE_TYPE_LABELS[t] || t}</option>)}
                </FormField>
                <div className="wh-form-grid__full">
                  <FormField id="note_body" label="Note" as="textarea" rows={3} value={initialNote.body} onChange={(e) => setInitialNote((n) => ({ ...n, body: e.target.value }))} disabled={disabled} />
                </div>
              </div>
            </Card>
          </>
        )}

        <div className="wh-form-grid__actions" style={{ marginTop: 16 }}>
          <Button type="button" variant="secondary" onClick={() => navigate(isEdit ? `${MODULE_BASE}/customers/${customerId}` : `${MODULE_BASE}/customers/manage`)}>
            Cancel
          </Button>
          {!disabled && (
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Customer" : "Create Customer"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
