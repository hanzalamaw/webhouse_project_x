import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { MODULE_BASE, OUTLET_STATUSES, OUTLET_STATUS_LABELS } from "../../constants";

const EMPTY = {
  outlet_name: "",
  location: "",
  city: "",
  status: "active",
  store_open_time: "09:00",
  store_close_time: "21:00",
  opening_balance: "0",
};

function timeForInput(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function timeForApi(value) {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

export default function EditStore() {
  const { storeId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit, readOnly } = useModulePermission("pos");
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || !canEdit;

  useEffect(() => {
    setLoading(true);
    apiFetch(`/pos/outlets`, {}, authFetch)
      .then((res) => {
        const row = (res.data || res || []).find((o) => String(o.id) === String(storeId));
        if (!row) throw new Error("Store not found");
        setForm({
          outlet_name: row.outlet_name || "",
          location: row.location || "",
          city: row.city || "",
          status: row.status || "active",
          store_open_time: timeForInput(row.store_open_time) || "09:00",
          store_close_time: timeForInput(row.store_close_time) || "21:00",
          opening_balance: String(row.opening_balance ?? 0),
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [storeId, authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/pos/outlets/${storeId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          opening_balance: Number(form.opening_balance) || 0,
          store_open_time: timeForApi(form.store_open_time),
          store_close_time: timeForApi(form.store_close_time),
        }),
      }, authFetch);
      navigate(`${MODULE_BASE}/stores/${storeId}`);
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
          title="Edit Store"
          description="Update store location, hours, and opening balance."
          actions={<Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/stores/${storeId}`)}>Back to store</Button>}
        />
        <form onSubmit={submit} className="wh-form-stack">
          <FormBlock title="Store details" description="Name, city, status, address, and opening cash.">
            <div className="wh-form-grid wh-form-grid--3">
              <FormField id="outlet_name" label="Store name" value={form.outlet_name} onChange={(e) => setForm((f) => ({ ...f, outlet_name: e.target.value }))} disabled={disabled} required />
              <FormField id="city" label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} disabled={disabled} />
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={disabled}>
                {OUTLET_STATUSES.map((s) => <option key={s} value={s}>{OUTLET_STATUS_LABELS[s] || s}</option>)}
              </FormField>
              <FormField id="opening_balance" label="Opening balance (PKR)" type="number" min="0" step="0.01" value={form.opening_balance} onChange={(e) => setForm((f) => ({ ...f, opening_balance: e.target.value }))} disabled={disabled} />
              <div className="wh-form-grid__full">
                <FormField id="location" label="Location" as="textarea" rows={3} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} disabled={disabled} />
              </div>
            </div>
          </FormBlock>

          <FormBlock title="Store hours" description="Operating hours for this store.">
            <div className="wh-form-grid">
              <FormField id="store_open_time" label="Store open" type="time" value={form.store_open_time} onChange={(e) => setForm((f) => ({ ...f, store_open_time: e.target.value }))} disabled={disabled} required />
              <FormField id="store_close_time" label="Store close" type="time" value={form.store_close_time} onChange={(e) => setForm((f) => ({ ...f, store_close_time: e.target.value }))} disabled={disabled} />
            </div>
          </FormBlock>

          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/stores/${storeId}`)}>Cancel</Button>
            {!disabled && (
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Store"}</Button>
            )}
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
