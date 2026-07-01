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
import { useOrderReference } from "../../hooks/useOrderReference";
import { MODULE_BASE, EXCHANGE_STATUSES } from "../../constants";

export default function CreateExchange() {
  const { authFetch } = useAuth();
  const { canCreate, readOnly } = useModulePermission("order-management");
  const { products, loading: refLoading } = useOrderReference();
  const navigate = useNavigate();
  const [form, setForm] = useState({ order_id: "", old_product_id: "", new_product_id: "", exchange_status: "requested", reason: "" });
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
  const productOptions = useMemo(
    () => products.map((p) => ({ value: String(p.id), label: `${p.product_name} (${p.sku})` })),
    [products]
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
      await apiFetch("/orders/exchanges", {
        method: "POST",
        body: JSON.stringify({
          order_id: Number(form.order_id),
          old_product_id: Number(form.old_product_id),
          new_product_id: Number(form.new_product_id),
          exchange_status: form.exchange_status,
          reason: form.reason.trim(),
        }),
      }, authFetch);
      navigate(`${MODULE_BASE}/exchanges/manage`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || refLoading) return <div className="wh-page"><p className="wh-muted">Loading…</p></div>;

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader title="Add New Exchange" />
        <form className="wh-form-stack" onSubmit={submit}>
          <FormBlock title="Exchange request">
            <div className="wh-form-grid wh-form-grid--2">
              <FormField label="Order">
                <SearchableSelect options={orderOptions} value={form.order_id} onChange={(v) => set("order_id", v)} disabled={disabled} />
              </FormField>
              <FormField label="Status">
                <select className="wh-input" value={form.exchange_status} onChange={(e) => set("exchange_status", e.target.value)} disabled={disabled}>
                  {EXCHANGE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Old product">
                <SearchableSelect options={productOptions} value={form.old_product_id} onChange={(v) => set("old_product_id", v)} disabled={disabled} />
              </FormField>
              <FormField label="New product">
                <SearchableSelect options={productOptions} value={form.new_product_id} onChange={(v) => set("new_product_id", v)} disabled={disabled} />
              </FormField>
            </div>
            <FormField label="Reason">
              <textarea className="wh-input" rows={3} value={form.reason} onChange={(e) => set("reason", e.target.value)} disabled={disabled} />
            </FormField>
          </FormBlock>
          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : "Save exchange"}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/exchanges/manage`)}>Back</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
