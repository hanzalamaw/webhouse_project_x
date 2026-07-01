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
import { MODULE_BASE } from "../../constants";

export default function CreateCancellation() {
  const { authFetch } = useAuth();
  const { canCreate, readOnly } = useModulePermission("order-management");
  const navigate = useNavigate();
  const [form, setForm] = useState({ order_id: "", reason: "" });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || !canCreate;

  const orderOptions = useMemo(
    () => orders.filter((o) => o.order_status !== "cancelled").map((o) => ({
      value: String(o.id),
      label: `${o.order_no} — ${o.customer_name || "No customer"}`,
    })),
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
      await apiFetch("/orders/cancellations", {
        method: "POST",
        body: JSON.stringify({ order_id: Number(form.order_id), reason: form.reason.trim() }),
      }, authFetch);
      navigate(`${MODULE_BASE}/cancellations/manage`);
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
        <PageHeader title="Add New Cancellation" description="Cancel an order and record the reason." />
        <form className="wh-form-stack" onSubmit={submit}>
          <FormBlock title="Cancellation">
            <FormField label="Order">
              <SearchableSelect options={orderOptions} value={form.order_id} onChange={(v) => setForm((f) => ({ ...f, order_id: v }))} disabled={disabled} />
            </FormField>
            <FormField label="Reason">
              <textarea className="wh-input" rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} disabled={disabled} />
            </FormField>
          </FormBlock>
          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : "Cancel order"}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/cancellations/manage`)}>Back</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
