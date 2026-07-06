import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../../../components/FormPageLayout";
import { AfterSalesOrderSection } from "../../components/AfterSalesOrderSection";
import { useAfterSalesOrders } from "../../hooks/useAfterSalesOrders";
import { MODULE_BASE } from "../../constants";
import {
  afterSalesIneligibilityMessage,
  isOrderEligibleForCancellation,
  isOrderEligibleForRefund,
  isOrderPaid,
} from "../../utils/afterSalesRules";

export default function CreateCancellation() {
  const { authFetch } = useAuth();
  const { canCreate, readOnly } = useModulePermission("order-management");
  const navigate = useNavigate();
  const { orders, loading, error: loadError, prefillOrderId } = useAfterSalesOrders(authFetch);
  const [form, setForm] = useState({ order_id: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || !canCreate;
  const managePath = `${MODULE_BASE}/cancellations/manage`;

  const selectedOrder = useMemo(
    () => orders.find((o) => String(o.id) === String(form.order_id)) || null,
    [orders, form.order_id]
  );
  const orderEligible = selectedOrder ? isOrderEligibleForCancellation(selectedOrder) : false;
  const ineligibleMessage = selectedOrder && !orderEligible
    ? afterSalesIneligibilityMessage(selectedOrder, "cancellation")
    : null;
  const canRecordRefund = selectedOrder
    && !isOrderEligibleForCancellation(selectedOrder)
    && isOrderEligibleForRefund(selectedOrder)
    && isOrderPaid(selectedOrder);

  useEffect(() => {
    if (prefillOrderId) {
      setForm((f) => ({ ...f, order_id: String(prefillOrderId) }));
    }
  }, [prefillOrderId]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    if (!form.order_id) { setError("Select an order to cancel."); return; }
    if (!orderEligible) {
      setError(ineligibleMessage || "This order cannot be cancelled.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/orders/cancellations", {
        method: "POST",
        body: JSON.stringify({ order_id: Number(form.order_id), reason: form.reason.trim() }),
      }, authFetch);
      navigate(managePath);
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
          title="Record cancellation"
          description="Cancel an order and document why the sale was stopped."
          actions={
            <Button variant="secondary" onClick={() => navigate(managePath)}>Back to cancellations</Button>
          }
        />
        <FormPageAlerts error={error || loadError} />

        <form className="wh-form-stack wh-aftersales-form" onSubmit={submit}>
          <FormBlock title="Order" description="Choose the order you want to cancel. Orders that are already cancelled or have another after-sales action are hidden.">
            <AfterSalesOrderSection
              orders={orders}
              value={form.order_id}
              onChange={(v) => setForm((f) => ({ ...f, order_id: v }))}
              disabled={disabled}
              prefillLocked={Boolean(prefillOrderId)}
              filterOrders={(rows) => rows.filter(isOrderEligibleForCancellation)}
              ineligibleMessage={ineligibleMessage}
              footer={
                canRecordRefund ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="wh-btn--sm"
                    onClick={() => navigate(`${MODULE_BASE}/refunds/create?orderId=${selectedOrder.id}`)}
                  >
                    Record refund
                  </Button>
                ) : null
              }
            />
          </FormBlock>

          <FormBlock title="Cancellation details" description="Explain why this order is being cancelled.">
            <FormField
              id="cancellation-reason"
              label="Reason"
              as="textarea"
              rows={4}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              disabled={disabled || !orderEligible}
              placeholder="e.g. Customer requested cancellation before dispatch…"
            />
          </FormBlock>

          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(managePath)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={saving || disabled || !form.order_id || !orderEligible}>
              {saving ? "Saving…" : "Cancel order"}
            </Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
