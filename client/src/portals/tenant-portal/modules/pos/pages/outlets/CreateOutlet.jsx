import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { MODULE_BASE, OUTLET_STATUSES } from "../../constants";

const EMPTY = {
  outlet_name: "",
  location: "",
  city: "",
  status: "active",
  store_open_time: "09:00",
  store_close_time: "21:00",
};

function timeForInput(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function timeForApi(value) {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

export default function CreateOutlet() {
  const { outletId } = useParams();
  const isEdit = Boolean(outletId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit, readOnly } = useModulePermission("pos");
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || (isEdit ? !canEdit : !canCreate);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    apiFetch(`/pos/outlets`, {}, authFetch)
      .then((res) => {
        const row = (res.data || res || []).find((o) => String(o.id) === String(outletId));
        if (!row) throw new Error("Outlet not found");
        setForm({
          outlet_name: row.outlet_name || "",
          location: row.location || "",
          city: row.city || "",
          status: row.status || "active",
          store_open_time: timeForInput(row.store_open_time) || "09:00",
          store_close_time: timeForInput(row.store_close_time) || "21:00",
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isEdit, outletId, authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        store_open_time: timeForApi(form.store_open_time),
        store_close_time: timeForApi(form.store_close_time),
      };
      if (isEdit) {
        await apiFetch(`/pos/outlets/${outletId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
      } else {
        await apiFetch("/pos/outlets", { method: "POST", body: JSON.stringify(body) }, authFetch);
      }
      navigate(`${MODULE_BASE}/outlets`);
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
          title={isEdit ? "Edit Outlet" : "Create Outlet"}
          description={isEdit ? "Update store location and operating hours." : "Add a store location where POS terminals operate."}
          actions={<Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/outlets`)}>Back to outlets</Button>}
        />
        <form onSubmit={submit} className="wh-form-stack">
          <FormBlock title="Outlet details" description="Name, city, status, and address.">
            <div className="wh-form-grid wh-form-grid--3">
              <FormField id="outlet_name" label="Outlet name" value={form.outlet_name} onChange={(e) => setForm((f) => ({ ...f, outlet_name: e.target.value }))} disabled={disabled} required />
              <FormField id="city" label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} disabled={disabled} />
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={disabled}>
                {OUTLET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
              <div className="wh-form-grid__full">
                <FormField id="location" label="Location" as="textarea" rows={3} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} disabled={disabled} />
              </div>
            </div>
          </FormBlock>

          <FormBlock title="Store hours" description="Open time is the daily drawer reset for POS terminals.">
            <div className="wh-form-grid">
              <FormField id="store_open_time" label="Store open (drawer reset)" type="time" value={form.store_open_time} onChange={(e) => setForm((f) => ({ ...f, store_open_time: e.target.value }))} disabled={disabled} required />
              <FormField id="store_close_time" label="Store close" type="time" value={form.store_close_time} onChange={(e) => setForm((f) => ({ ...f, store_close_time: e.target.value }))} disabled={disabled} />
            </div>
            <p className="wh-form-block__desc" style={{ marginTop: 12 }}>
              If a cashier opens the terminal after store open time, opening cash in the drawer starts at zero. Before that time, yesterday&apos;s closing balance carries over.
            </p>
          </FormBlock>

          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/outlets`)}>Cancel</Button>
            {!disabled && (
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Outlet" : "Create Outlet"}</Button>
            )}
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
