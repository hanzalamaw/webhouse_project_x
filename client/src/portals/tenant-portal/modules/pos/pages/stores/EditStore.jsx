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
import { MODULE_BASE, OUTLET_STATUSES, OUTLET_STATUS_LABELS, TERMINAL_STATUSES, TERMINAL_STATUS_LABELS } from "../../constants";

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

function newTerminalRow(existing = null) {
  return {
    _key: existing?.id ? `t-${existing.id}` : `t-${Date.now()}-${Math.random()}`,
    id: existing?.id || null,
    terminal_name: existing?.terminal_name || "",
    device_code: existing?.device_code || "",
    status: existing?.status || "active",
  };
}

export default function EditStore() {
  const { storeId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit, canCreate, readOnly } = useModulePermission("pos");
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [terminals, setTerminals] = useState([]);
  const [removedTerminalIds, setRemovedTerminalIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || !canEdit;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch("/pos/outlets", {}, authFetch),
      apiFetch("/pos/terminals", {}, authFetch),
    ])
      .then(([outletRes, terminalRes]) => {
        const row = (outletRes.data || []).find((o) => String(o.id) === String(storeId));
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
        const storeTerminals = (terminalRes.data || []).filter(
          (t) => String(t.outlet_id) === String(storeId)
        );
        setTerminals(storeTerminals.length ? storeTerminals.map((t) => newTerminalRow(t)) : [newTerminalRow()]);
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

      const validTerminals = terminals.filter((t) => t.terminal_name.trim() && t.device_code.trim());
      if (!validTerminals.length) throw new Error("Add at least one terminal with name and terminal code.");
      const codes = validTerminals.map((t) => t.device_code.trim());
      if (new Set(codes).size !== codes.length) throw new Error("Terminal codes must be unique.");

      for (const id of removedTerminalIds) {
        await apiFetch(`/pos/terminals/${id}`, { method: "DELETE" }, authFetch);
      }

      for (const t of validTerminals) {
        const body = {
          terminal_name: t.terminal_name.trim(),
          device_code: t.device_code.trim(),
          status: t.status,
          outlet_id: Number(storeId),
        };
        if (t.id) {
          await apiFetch(`/pos/terminals/${t.id}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
        } else if (canCreate) {
          await apiFetch("/pos/terminals", { method: "POST", body: JSON.stringify(body) }, authFetch);
        }
      }

      navigate(`${MODULE_BASE}/stores/${storeId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeTerminal = (row) => {
    if (terminals.length <= 1) return;
    if (row.id) setRemovedTerminalIds((ids) => [...ids, row.id]);
    setTerminals((rows) => rows.filter((r) => r._key !== row._key));
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
          description="Update store details, hours, and terminals."
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

          <FormBlock title="Terminals" description="Terminal codes must be unique across your stores. Other tenants may reuse the same codes.">
            <div className="wh-inv-line-items">
              {terminals.map((t, idx) => (
                <div key={t._key} className="wh-inv-line-item">
                  <div className="wh-inv-line-item__head">
                    <strong>Terminal {idx + 1}</strong>
                    {terminals.length > 1 && !disabled && (
                      <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => removeTerminal(t)}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="wh-form-grid wh-form-grid--3">
                    <FormField id={`terminal_name_${t._key}`} label="Terminal name" value={t.terminal_name} onChange={(e) => setTerminals((rows) => rows.map((r) => r._key === t._key ? { ...r, terminal_name: e.target.value } : r))} disabled={disabled} required />
                    <FormField id={`device_code_${t._key}`} label="Terminal code" value={t.device_code} onChange={(e) => setTerminals((rows) => rows.map((r) => r._key === t._key ? { ...r, device_code: e.target.value } : r))} disabled={disabled} required />
                    <FormField id={`terminal_status_${t._key}`} label="Status" as="select" value={t.status} onChange={(e) => setTerminals((rows) => rows.map((r) => r._key === t._key ? { ...r, status: e.target.value } : r))} disabled={disabled}>
                      {TERMINAL_STATUSES.map((s) => <option key={s} value={s}>{TERMINAL_STATUS_LABELS[s] || s}</option>)}
                    </FormField>
                  </div>
                </div>
              ))}
            </div>
            {!disabled && canCreate && (
              <div className="wh-inv-warehouse-add">
                <Button type="button" variant="secondary" onClick={() => setTerminals((rows) => [...rows, newTerminalRow()])}>
                  Add terminal
                </Button>
              </div>
            )}
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
