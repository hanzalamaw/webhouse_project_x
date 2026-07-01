import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { MODULE_BASE, REFUND_STATUSES, REFUND_METHODS } from "../../constants";

export default function CreateRefund() {
  const { authFetch } = useAuth();
  const { canCreate, readOnly } = useModulePermission("order-management");
  const navigate = useNavigate();
  const [form, setForm] = useState({
    order_id: "",
    refund_amount: "",
    refund_method: "original_payment",
    refund_status: "pending",
    reason: "",
    refunded_at: "",
  });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || !canCreate;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const orderOptions = useMemo(
    () => orders.map((o) => ({ value: String(o.id), label: `${o.order_no} — ${o.customer_name || "No customer"}` })),
    [orders]
  );

  useEffect(() => {
    fetchAllTableRows("/orders", authFetch)
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/orders/refunds", {
        method: "POST",
        body: JSON.stringify({
          order_id: Number(form.order_id),
          refund_amount: Number(form.refund_amount),
          refund_method: form.refund_method,
          refund_status: form.refund_status,
          reason: form.reason.trim(),
          refunded_at: form.refunded_at || null,
        }),
      }, authFetch);
      navigate(`${MODULE_BASE}/refunds/manage`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="wh-page"><p className="wh-muted">Loading…</p></div>;

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader title="Add New Refunds" />
        <form className="wh-form-stack" onSubmit={submit}>
          <FormBlock title="Refund">
            <div className="wh-form-grid wh-form-grid--2">
              <FormField label="Order">
                <SearchableSelect options={orderOptions} value={form.order_id} onChange={(v) => set("order_id", v)} disabled={disabled} />
              </FormField>
              <FormField label="Refund amount">
                <input className="wh-input" type="number" min="0" step="0.01" value={form.refund_amount} onChange={(e) => set("refund_amount", e.target.value)} disabled={disabled} required />
              </FormField>
              <FormField label="Refund method">
                <select className="wh-input" value={form.refund_method} onChange={(e) => set("refund_method", e.target.value)} disabled={disabled}>
                  {REFUND_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </FormField>
              <FormField label="Status">
                <select className="wh-input" value={form.refund_status} onChange={(e) => set("refund_status", e.target.value)} disabled={disabled}>
                  {REFUND_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Refunded at">
                <input className="wh-input" type="datetime-local" value={form.refunded_at} onChange={(e) => set("refunded_at", e.target.value)} disabled={disabled} />
              </FormField>
            </div>
            <FormField label="Reason">
              <textarea className="wh-input" rows={3} value={form.reason} onChange={(e) => set("reason", e.target.value)} disabled={disabled} />
            </FormField>
          </FormBlock>
          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : "Save refund"}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/refunds/manage`)}>Back</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
