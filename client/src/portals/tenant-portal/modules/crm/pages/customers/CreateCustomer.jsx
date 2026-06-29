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
import { StatusBadge } from "../../../../../../components/Badge";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { formatDateTime } from "../../../../../../utils/dateTime";
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
  ISSUE_TYPE_LABELS,
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

function emptyAddressEntry(key, id = null, typePreset = "office") {
  return {
    _key: key,
    id,
    address_type_preset: typePreset,
    address_type_custom: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
  };
}

function addressTypeOptionsForRow(addresses, rowKey) {
  const defaultTaken = addresses.some(
    (r) => r._key !== rowKey && r.address_type_preset === "default"
  );
  return defaultTaken ? ADDRESS_TYPES.filter((t) => t !== "default") : ADDRESS_TYPES;
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
    return [emptyAddressEntry("addr-1", null, "default")];
  });
  const [initialNote, setInitialNote] = useState({ note_type: "note", body: "" });
  const [complaints, setComplaints] = useState([]);
  const [deleteAddr, setDeleteAddr] = useState(null);
  const [deletingAddr, setDeletingAddr] = useState(false);
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
        setComplaints(row.complaints || []);
        let sawDefault = false;
        const loadedAddresses = (row.addresses || []).map((a) => {
          const storedType = a.is_default || a.address_type === "default" ? "default" : a.address_type;
          const typePartsAddr = splitPresetOrOther(storedType, ADDRESS_TYPES);
          const isDefaultType = typePartsAddr.preset === "default" && !sawDefault;
          if (isDefaultType) sawDefault = true;
          const preset = isDefaultType
            ? "default"
            : sawDefault && typePartsAddr.preset === "default"
              ? "office"
              : typePartsAddr.preset;
          return {
            _key: `addr-${a.id}`,
            id: a.id,
            address_type_preset: preset,
            address_type_custom: preset === "other" ? typePartsAddr.custom : "",
            address: a.address || "",
            city: a.city || "",
            state: a.state || "",
            postal_code: a.postal_code || "",
          };
        });
        if (loadedAddresses.length) {
          if (!sawDefault) loadedAddresses[0].address_type_preset = "default";
          setAddresses(loadedAddresses);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isEdit, customerId, authFetch]);

  const updateAddress = (key, patch) => {
    setAddresses((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  };

  const changeAddressType = (key, preset) => {
    setAddresses((rows) =>
      rows.map((r) => {
        if (r._key === key) return { ...r, address_type_preset: preset };
        if (preset === "default" && r.address_type_preset === "default") {
          return { ...r, address_type_preset: "office" };
        }
        return r;
      })
    );
  };

  const addAddress = () => setAddresses((rows) => [...rows, makeAddressEntry()]);

  const removeAddress = (key) => {
    setAddresses((rows) => {
      if (rows.length <= 1) return rows;
      const removed = rows.find((r) => r._key === key);
      const next = rows.filter((r) => r._key !== key);
      if (removed?.address_type_preset === "default" && next.length) {
        next[0] = { ...next[0], address_type_preset: "default" };
      }
      return next;
    });
  };

  const saveAddresses = async (id, rows) => {
    const filled = rows.filter((row) => String(row.address || "").trim());
    const resolved = filled.map((row) => ({
      row,
      address_type: resolvePresetOrOther(
        row.address_type_preset,
        row.address_type_custom,
        "Address type"
      ),
    }));
    const defaultCount = resolved.filter(({ address_type }) => isDefaultAddressType(address_type)).length;
    if (defaultCount > 1) {
      throw new Error("Only one default address is allowed.");
    }
    const normalized = resolved.length && defaultCount === 0
      ? resolved.map((entry, index) => (
        index === 0
          ? { ...entry, address_type: "default" }
          : entry
      ))
      : resolved;
    const ordered = [
      ...normalized.filter(({ address_type }) => !isDefaultAddressType(address_type)),
      ...normalized.filter(({ address_type }) => isDefaultAddressType(address_type)),
    ];

    for (const { row, address_type } of ordered) {
      const addrBody = {
        address_type,
        address: row.address.trim(),
        city: row.city.trim() || null,
        state: row.state.trim() || null,
        postal_code: row.postal_code.trim() || null,
        is_default: isDefaultAddressType(address_type),
      };
      if (row.id) {
        await apiFetch(`/crm/customers/${id}/addresses/${row.id}`, {
          method: "PUT",
          body: JSON.stringify(addrBody),
        }, authFetch);
      } else {
        await apiFetch(`/crm/customers/${id}/addresses`, {
          method: "POST",
          body: JSON.stringify(addrBody),
        }, authFetch);
      }
    }
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
        await saveAddresses(customerId, addresses);

        setMessage("Customer updated.");
        navigate(`${MODULE_BASE}/customers/${customerId}`);
        return;
      }

      const created = await apiFetch("/crm/customers", { method: "POST", body: JSON.stringify(body) }, authFetch);
      const id = created.id;

      await saveAddresses(id, addresses);

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

  const confirmDeleteAddress = async () => {
    if (!deleteAddr) return;
    setDeletingAddr(true);
    setError("");
    try {
      if (deleteAddr.id) {
        await apiFetch(`/crm/customers/${customerId}/addresses/${deleteAddr.id}`, { method: "DELETE" }, authFetch);
      }
      setAddresses((rows) => rows.filter((r) => r._key !== deleteAddr._key));
      setDeleteAddr(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingAddr(false);
    }
  };

  const requestRemoveAddress = (row) => {
    if (row.id && isEdit) {
      setDeleteAddr(row);
      return;
    }
    removeAddress(row._key);
  };

  const addressBlock = (
    <FormBlock title="Addresses" description="One default address per customer. Additional addresses can be office, home, or other.">
      <div className="wh-inv-line-items">
        {addresses.map((row, index) => (
          <div key={row._key} className="wh-inv-line-item">
            <div className="wh-inv-line-item__head">
              <strong>Address {index + 1}</strong>
              {(addresses.length > 1 || row.id) && (
                <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => requestRemoveAddress(row)} disabled={disabled}>
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
                onPresetChange={(v) => changeAddressType(row._key, v)}
                onCustomChange={(v) => updateAddress(row._key, { address_type_custom: v })}
                options={addressTypeOptionsForRow(addresses, row._key)}
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
  );

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

          {addressBlock}

          {!isEdit && (
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
          )}

          {isEdit && (
            <FormBlock title="Complaints" description="Complaints linked to this customer.">
              {complaints.length ? (
                <div className="wh-mini-list">
                  {complaints.map((c) => (
                    <div className="wh-mini-row" key={c.id}>
                      <div className="wh-mini-row__main">
                        <div className="wh-mini-row__title">{c.subject}</div>
                        <div className="wh-mini-row__sub">
                          {ISSUE_TYPE_LABELS[c.issue_type] || c.issue_type}
                          {" · "}
                          <StatusBadge status={c.status} />
                          {" · "}
                          {formatDateTime(c.created_at)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="wh-btn--sm"
                        onClick={() => navigate(`${MODULE_BASE}/complaints/view/${c.id}`)}
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="wh-muted">No complaints recorded for this customer.</p>
              )}
            </FormBlock>
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

        <ConfirmDeleteModal
          open={!!deleteAddr}
          title="Delete address"
          recordName={deleteAddr?.address || "this address"}
          onConfirm={confirmDeleteAddress}
          onClose={() => setDeleteAddr(null)}
          loading={deletingAddr}
        />
      </FormPageLayout>
    </div>
  );
}
