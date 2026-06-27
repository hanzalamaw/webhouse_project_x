import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { Button } from "../../../../../../components/Button";
import { TypeWithOtherField } from "../../components/TypeWithOtherField";
import {
  MODULE_BASE,
  CUSTOMER_TYPES,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_STATUS_LABELS,
  ADDRESS_TYPES,
  ADDRESS_TYPE_LABELS,
  NOTE_TYPES,
  NOTE_TYPE_LABELS,
} from "../../constants";
import {
  splitPresetOrOther,
  resolvePresetOrOther,
  isDefaultAddressType,
} from "../../utils/typeFields";

const EMPTY = {
  customer_name: "",
  company_name: "",
  customer_type_preset: "retailer",
  customer_type_custom: "",
  phone: "",
  email: "",
  status: "active",
  note: "",
  tags: "",
};

function emptyAddressEntry(key) {
  return {
    _key: key,
    address_type_preset: "default",
    address_type_custom: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
  };
}

export default function CreateCustomer() {
  const { customerId } = useParams();
  const isEdit = Boolean(customerId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit, readOnly } = useModulePermission("crm");
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const addressKeyRef = useRef(0);
  const makeAddressEntry = useCallback(() => {
    addressKeyRef.current += 1;
    return emptyAddressEntry(`addr-${addressKeyRef.current}`);
  }, []);
  const [addresses, setAddresses] = useState(() => {
    addressKeyRef.current = 1;
    return [emptyAddressEntry("addr-1")];
  });
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
        const typeParts = splitPresetOrOther(row.customer_type, CUSTOMER_TYPES);
        setForm({
          customer_name: row.customer_name || "",
          company_name: row.company_name || "",
          customer_type_preset: typeParts.preset,
          customer_type_custom: typeParts.custom,
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

  const updateAddress = (key, patch) => {
    setAddresses((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  };

  const addAddress = () => setAddresses((rows) => [...rows, makeAddressEntry()]);

  const removeAddress = (key) => {
    setAddresses((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r._key !== key)));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const customer_type = resolvePresetOrOther(
        form.customer_type_preset,
        form.customer_type_custom,
        "Customer type"
      );
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const body = {
        customer_name: form.customer_name.trim(),
        company_name: form.company_name.trim() || null,
        customer_type,
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

      for (const row of addresses) {
        if (!String(row.address || "").trim()) continue;
        const address_type = resolvePresetOrOther(
          row.address_type_preset,
          row.address_type_custom,
          "Address type"
        );
        await apiFetch(`/crm/customers/${id}/addresses`, {
          method: "POST",
          body: JSON.stringify({
            address_type,
            address: row.address.trim(),
            city: row.city.trim() || null,
            state: row.state.trim() || null,
            postal_code: row.postal_code.trim() || null,
            is_default: isDefaultAddressType(address_type),
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
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={isEdit ? "Edit Customer" : "Add Customer"}
          description={
            isEdit
              ? "Update customer contact details, type, status, and tags."
              : "Create a customer with contact details, one or more addresses, and an optional note."
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
        {error && <p className="wh-field__error">{error}</p>}
        {message && <div className="wh-alert wh-alert--success">{message}</div>}

        <form onSubmit={submit} className="wh-form-stack">
          <FormBlock title="Customer details" description="Contact information, type, status, tags, and summary note.">
            <div className="wh-form-grid">
              <FormField id="customer_name" label="Customer name" value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} disabled={disabled} required />
              <FormField id="company_name" label="Company" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} disabled={disabled} />
              <TypeWithOtherField
                id="customer_type"
                label="Customer type"
                preset={form.customer_type_preset}
                custom={form.customer_type_custom}
                onPresetChange={(v) => setForm((f) => ({ ...f, customer_type_preset: v }))}
                onCustomChange={(v) => setForm((f) => ({ ...f, customer_type_custom: v }))}
                options={CUSTOMER_TYPES}
                optionLabels={CUSTOMER_TYPE_LABELS}
                disabled={disabled}
                customPlaceholder="e.g. Franchise partner"
              />
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
                <FormField id="note" label="Summary note" as="textarea" rows={3} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} disabled={disabled} />
              </div>
            </div>
          </FormBlock>

          {!isEdit && (
            <>
              <FormBlock title="Addresses" description="Add one or more addresses. Type Default marks the primary address.">
                <div className="wh-inv-line-items">
                  {addresses.map((row, index) => (
                    <div key={row._key} className="wh-inv-line-item">
                      <div className="wh-inv-line-item__head">
                        <strong>Address {index + 1}</strong>
                        {addresses.length > 1 && (
                          <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => removeAddress(row._key)}>
                            Remove
                          </Button>
                        )}
                      </div>
                      <div className="wh-form-grid">
                        <TypeWithOtherField
                          id={`address_type_${row._key}`}
                          label="Address type"
                          preset={row.address_type_preset}
                          custom={row.address_type_custom}
                          onPresetChange={(v) => updateAddress(row._key, { address_type_preset: v })}
                          onCustomChange={(v) => updateAddress(row._key, { address_type_custom: v })}
                          options={ADDRESS_TYPES}
                          optionLabels={ADDRESS_TYPE_LABELS}
                          disabled={disabled}
                          customPlaceholder="e.g. Warehouse"
                        />
                        <div className="wh-form-grid__full">
                          <FormField id={`address_${row._key}`} label="Street address" as="textarea" rows={2} value={row.address} onChange={(e) => updateAddress(row._key, { address: e.target.value })} disabled={disabled} />
                        </div>
                        <FormField id={`city_${row._key}`} label="City" value={row.city} onChange={(e) => updateAddress(row._key, { city: e.target.value })} disabled={disabled} />
                        <FormField id={`state_${row._key}`} label="State / Province" value={row.state} onChange={(e) => updateAddress(row._key, { state: e.target.value })} disabled={disabled} />
                        <FormField id={`postal_${row._key}`} label="Postal code" value={row.postal_code} onChange={(e) => updateAddress(row._key, { postal_code: e.target.value })} disabled={disabled} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="wh-inv-warehouse-add">
                  <Button type="button" variant="secondary" onClick={addAddress} disabled={disabled}>
                    Add another address
                  </Button>
                </div>
              </FormBlock>

              <FormBlock title="Initial note" description="Optional first note on the customer timeline.">
                <div className="wh-form-grid">
                  <FormField id="note_type" label="Note type" as="select" value={initialNote.note_type} onChange={(e) => setInitialNote((n) => ({ ...n, note_type: e.target.value }))} disabled={disabled}>
                    {NOTE_TYPES.map((t) => <option key={t} value={t}>{NOTE_TYPE_LABELS[t] || t}</option>)}
                  </FormField>
                  <div className="wh-form-grid__full">
                    <FormField id="note_body" label="Note" as="textarea" rows={3} value={initialNote.body} onChange={(e) => setInitialNote((n) => ({ ...n, body: e.target.value }))} disabled={disabled} />
                  </div>
                </div>
              </FormBlock>
            </>
          )}

          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(isEdit ? `${MODULE_BASE}/customers/${customerId}` : `${MODULE_BASE}/customers/manage`)}>
              Cancel
            </Button>
            {!disabled && (
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save Customer" : "Create Customer"}
              </Button>
            )}
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
