import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { MODULE_BASE, OUTLET_STATUSES, OUTLET_STATUS_LABELS, TERMINAL_STATUSES, TERMINAL_STATUS_LABELS } from "../../constants";

const EMPTY_STORE = {
  outlet_name: "",
  location: "",
  city: "",
  status: "active",
  store_open_time: "09:00",
  store_close_time: "21:00",
  opening_balance: "0",
};

const EMPTY_TERMINAL = { terminal_name: "", device_code: "", status: "active" };

function newTerminalRow() {
  return { ...EMPTY_TERMINAL, _key: `t-${Date.now()}-${Math.random()}` };
}

function timeForApi(value) {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

export default function CreateStore() {
  const { authFetch } = useAuth();
  const { canCreate, readOnly } = useModulePermission("pos");
  const navigate = useNavigate();
  const [store, setStore] = useState(EMPTY_STORE);
  const [terminals, setTerminals] = useState([newTerminalRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [limits, setLimits] = useState(null);
  const [loadingLimits, setLoadingLimits] = useState(true);

  const disabled = readOnly || !canCreate || limits?.can_create === false;

  useEffect(() => {
    apiFetch("/pos/outlets?page=1&limit=1&all=1", {}, authFetch)
      .then((res) => setLimits(res.limits || null))
      .catch(() => setLimits(null))
      .finally(() => setLoadingLimits(false));
  }, [authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch("/pos/outlets", {
        method: "POST",
        body: JSON.stringify({
          ...store,
          opening_balance: Number(store.opening_balance) || 0,
          store_open_time: timeForApi(store.store_open_time),
          store_close_time: timeForApi(store.store_close_time),
        }),
      }, authFetch);

      const validTerminals = terminals.filter((t) => t.terminal_name.trim() && t.device_code.trim());
      if (!validTerminals.length) throw new Error("Add at least one terminal with name and terminal code.");
      const codes = validTerminals.map((t) => t.device_code.trim());
      if (new Set(codes).size !== codes.length) throw new Error("Terminal codes must be unique.");

      for (const t of validTerminals) {
        await apiFetch("/pos/terminals", {
          method: "POST",
          body: JSON.stringify({
            terminal_name: t.terminal_name.trim(),
            device_code: t.device_code.trim(),
            status: t.status,
            outlet_id: created.id,
          }),
        }, authFetch);
      }

      navigate(`${MODULE_BASE}/stores/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Create Store"
          description="Add a store location, opening cash balance, and its first POS terminal."
          actions={<Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/stores/manage`)}>Back to stores</Button>}
        />
        {loadingLimits ? (
          <p className="wh-muted">Loading…</p>
        ) : limits && !limits.can_create ? (
          <p className="wh-field__error">
            Store limit reached ({limits.store_count}/{limits.max_stores}).
          </p>
        ) : (
        <form onSubmit={submit} className="wh-form-stack">
          <FormBlock title="Store details" description="Name, city, status, address, and opening cash.">
            <div className="wh-form-grid wh-form-grid--3">
              <FormField id="outlet_name" label="Store name" value={store.outlet_name} onChange={(e) => setStore((f) => ({ ...f, outlet_name: e.target.value }))} disabled={disabled} required />
              <FormField id="city" label="City" value={store.city} onChange={(e) => setStore((f) => ({ ...f, city: e.target.value }))} disabled={disabled} />
              <FormField id="status" label="Status" as="select" value={store.status} onChange={(e) => setStore((f) => ({ ...f, status: e.target.value }))} disabled={disabled}>
                {OUTLET_STATUSES.map((s) => <option key={s} value={s}>{OUTLET_STATUS_LABELS[s] || s}</option>)}
              </FormField>
              <FormField id="opening_balance" label="Opening balance (PKR)" type="number" min="0" step="0.01" value={store.opening_balance} onChange={(e) => setStore((f) => ({ ...f, opening_balance: e.target.value }))} disabled={disabled} required />
              <div className="wh-form-grid__full">
                <FormField id="location" label="Location" as="textarea" rows={3} value={store.location} onChange={(e) => setStore((f) => ({ ...f, location: e.target.value }))} disabled={disabled} />
              </div>
            </div>
          </FormBlock>

          <FormBlock title="Store hours" description="Operating hours for this store.">
            <div className="wh-form-grid">
              <FormField id="store_open_time" label="Store open" type="time" value={store.store_open_time} onChange={(e) => setStore((f) => ({ ...f, store_open_time: e.target.value }))} disabled={disabled} required />
              <FormField id="store_close_time" label="Store close" type="time" value={store.store_close_time} onChange={(e) => setStore((f) => ({ ...f, store_close_time: e.target.value }))} disabled={disabled} />
            </div>
            <p className="wh-form-block__desc" style={{ marginTop: 12 }}>
              Each new register shift starts with yesterday&apos;s closing balance. The opening balance above applies only to the first shift on a terminal.
            </p>
          </FormBlock>

          <FormBlock title="Terminals" description="Terminal codes must be unique across your stores. Other tenants may reuse the same codes.">
            <div className="wh-inv-line-items">
              {terminals.map((t, idx) => (
                <div key={t._key} className="wh-inv-line-item">
                  <div className="wh-inv-line-item__head">
                    <strong>Terminal {idx + 1}</strong>
                    {terminals.length > 1 && !disabled && (
                      <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => setTerminals((rows) => rows.filter((_, i) => i !== idx))}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="wh-form-grid wh-form-grid--3">
                    <FormField id={`terminal_name_${idx}`} label="Terminal name" value={t.terminal_name} onChange={(e) => setTerminals((rows) => rows.map((r, i) => i === idx ? { ...r, terminal_name: e.target.value } : r))} disabled={disabled} required />
                    <FormField id={`device_code_${idx}`} label="Terminal code" value={t.device_code} onChange={(e) => setTerminals((rows) => rows.map((r, i) => i === idx ? { ...r, device_code: e.target.value } : r))} disabled={disabled} required />
                    <FormField id={`terminal_status_${idx}`} label="Status" as="select" value={t.status} onChange={(e) => setTerminals((rows) => rows.map((r, i) => i === idx ? { ...r, status: e.target.value } : r))} disabled={disabled}>
                      {TERMINAL_STATUSES.map((s) => <option key={s} value={s}>{TERMINAL_STATUS_LABELS[s] || s}</option>)}
                    </FormField>
                  </div>
                </div>
              ))}
            </div>
            {!disabled && (
              <div className="wh-inv-warehouse-add">
                <Button type="button" variant="secondary" onClick={() => setTerminals((rows) => [...rows, newTerminalRow()])}>Add terminal</Button>
              </div>
            )}
          </FormBlock>

          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/stores/manage`)}>Cancel</Button>
            {!disabled && (
              <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create Store"}</Button>
            )}
          </FormActions>
        </form>
        )}
      </FormPageLayout>
    </div>
  );
}
