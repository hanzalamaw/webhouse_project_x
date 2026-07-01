import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { MODULE_BASE, PAYMENT_METHODS, PAYMENT_RECORD_STATUSES } from "../../constants";

const EMPTY = { order_id: "", payment_method: "cod", amount: "", payment_status: "pending", paid_at: "" };

export default function CreatePayment() {
  const { paymentId } = useParams();
  const isEdit = Boolean(paymentId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit, readOnly } = useModulePermission("order-management");
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || (isEdit ? !canEdit : !canCreate);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const orderOptions = useMemo(
    () => orders.map((o) => ({ value: String(o.id), label: `${o.order_no} — ${formatOrderLabel(o)}` })),
    [orders]
  );

  function formatOrderLabel(o) {
    return `${o.customer_name || "No customer"} (${o.payment_status})`;
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const orderRows = await fetchAllTableRows("/orders", authFetch);
        setOrders(orderRows);
        if (isEdit) {
          const rows = await fetchAllTableRows("/orders/payments/list", authFetch);
          const row = rows.find((r) => String(r.id) === String(paymentId));
          if (row) {
            setForm({
              order_id: String(row.order_id),
              payment_method: row.payment_method,
              amount: String(row.amount),
              payment_status: row.payment_status,
              paid_at: row.paid_at ? row.paid_at.slice(0, 16) : "",
            });
          }
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })().catch(() => {});
  }, [isEdit, paymentId, authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        order_id: Number(form.order_id),
        payment_method: form.payment_method,
        amount: Number(form.amount),
        payment_status: form.payment_status,
        paid_at: form.paid_at || null,
      };
      if (isEdit) {
        await apiFetch(`/orders/payments/${paymentId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
      } else {
        await apiFetch("/orders/payments", { method: "POST", body: JSON.stringify(body) }, authFetch);
      }
      navigate(`${MODULE_BASE}/payments/manage`);
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
        <PageHeader title={isEdit ? "Edit Payment" : "Record Payment"} />
        <form className="wh-form-stack" onSubmit={submit}>
          <FormBlock title="Payment details">
            <div className="wh-form-grid wh-form-grid--2">
              <FormField label="Order">
                <SearchableSelect options={orderOptions} value={form.order_id} onChange={(v) => set("order_id", v)} disabled={disabled || isEdit} />
              </FormField>
              <FormField label="Amount">
                <input className="wh-input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} disabled={disabled} required />
              </FormField>
              <FormField label="Payment method">
                <select className="wh-input" value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} disabled={disabled}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </FormField>
              <FormField label="Status">
                <select className="wh-input" value={form.payment_status} onChange={(e) => set("payment_status", e.target.value)} disabled={disabled}>
                  {PAYMENT_RECORD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Paid at">
                <input className="wh-input" type="datetime-local" value={form.paid_at} onChange={(e) => set("paid_at", e.target.value)} disabled={disabled} />
              </FormField>
            </div>
          </FormBlock>
          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/payments/manage`)}>Cancel</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
