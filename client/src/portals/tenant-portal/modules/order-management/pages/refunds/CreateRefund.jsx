import { useState, useEffect, useRef } from "react";

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

import { formatPKR } from "../../../../../../utils/currency";

import {

  MODULE_BASE,

  REFUND_STATUSES,

  REFUND_METHODS,

  REFUND_STATUS_LABELS,

  REFUND_METHOD_LABELS,

} from "../../constants";

import {
  afterSalesIneligibilityMessage,
  isOrderEligibleForRefund,
} from "../../utils/afterSalesRules";



export default function CreateRefund() {

  const { authFetch } = useAuth();

  const { canCreate, readOnly } = useModulePermission("order-management");

  const navigate = useNavigate();

  const { orders, loading, error: loadError, prefillOrderId } = useAfterSalesOrders(authFetch);

  const [form, setForm] = useState({

    order_id: "",

    refund_amount: "",

    refund_method: "original_payment",

    refund_status: "pending",

    reason: "",

    refunded_at: "",

  });

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const prefillAppliedRef = useRef(false);

  const disabled = readOnly || !canCreate;

  const managePath = `${MODULE_BASE}/refunds/manage`;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));



  const selectedOrder = orders.find((o) => String(o.id) === String(form.order_id)) || null;
  const orderEligible = selectedOrder ? isOrderEligibleForRefund(selectedOrder) : false;
  const ineligibleMessage = selectedOrder && !orderEligible
    ? afterSalesIneligibilityMessage(selectedOrder, "refund")
    : null;

  const applyOrderSelection = (orderId) => {

    const order = orders.find((o) => String(o.id) === String(orderId));

    setForm((f) => ({

      ...f,

      order_id: orderId,

      refund_amount: order?.payable_amount != null ? String(order.payable_amount) : f.refund_amount,

    }));

  };



  useEffect(() => {
    if (!prefillOrderId || !orders.length || prefillAppliedRef.current) return;
    applyOrderSelection(String(prefillOrderId));
    prefillAppliedRef.current = true;
  }, [prefillOrderId, orders]);



  const submit = async (e) => {

    e.preventDefault();

    if (disabled) return;

    if (!form.order_id) { setError("Select an order for this refund."); return; }
    if (!orderEligible) {
      setError(ineligibleMessage || "This order cannot be refunded.");
      return;
    }

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

          title="Record refund"

          description="Issue a refund for an order and track how it was paid back."

          actions={

            <Button variant="secondary" onClick={() => navigate(managePath)}>Back to refunds</Button>

          }

        />

        <FormPageAlerts error={error || loadError} />



        <form className="wh-form-stack wh-aftersales-form" onSubmit={submit}>

          <FormBlock title="Order" description="Select the order being refunded. Cancelled and paid orders are eligible. The payable amount is suggested automatically.">

            <AfterSalesOrderSection

              orders={orders}

              value={form.order_id}

              onChange={applyOrderSelection}

              disabled={disabled}

              prefillLocked={Boolean(prefillOrderId)}

              filterOrders={(rows) => rows.filter(isOrderEligibleForRefund)}

              ineligibleMessage={ineligibleMessage}

            />

            {selectedOrder && (

              <p className="wh-aftersales-hint">

                Order payable: <strong>{formatPKR(selectedOrder.payable_amount)}</strong>

              </p>

            )}

          </FormBlock>



          <FormBlock title="Refund details" description="Amount, method, and processing status for this refund.">

            <div className="wh-form-grid wh-form-grid--2">

              <FormField

                id="refund-amount"

                label="Refund amount"

                type="number"

                min="0"

                step="0.01"

                value={form.refund_amount}

                onChange={(e) => set("refund_amount", e.target.value)}

                disabled={disabled}

                required

              />

              <FormField

                id="refund-method"

                label="Refund method"

                as="select"

                value={form.refund_method}

                onChange={(e) => set("refund_method", e.target.value)}

                disabled={disabled}

              >

                {REFUND_METHODS.map((m) => (

                  <option key={m} value={m}>{REFUND_METHOD_LABELS[m] || m}</option>

                ))}

              </FormField>

              <FormField

                id="refund-status"

                label="Refund status"

                as="select"

                value={form.refund_status}

                onChange={(e) => set("refund_status", e.target.value)}

                disabled={disabled}

              >

                {REFUND_STATUSES.map((s) => (

                  <option key={s} value={s}>{REFUND_STATUS_LABELS[s] || s}</option>

                ))}

              </FormField>

              <FormField

                id="refunded-at"

                label="Refunded at"

                type="datetime-local"

                value={form.refunded_at}

                onChange={(e) => set("refunded_at", e.target.value)}

                disabled={disabled}

              />

            </div>

            <FormField

              id="refund-reason"

              label="Reason"

              as="textarea"

              rows={4}

              value={form.reason}

              onChange={(e) => set("reason", e.target.value)}

              disabled={disabled}

              placeholder="e.g. Order returned in full, partial refund for damaged item…"

            />

          </FormBlock>



          <FormActions>

            <Button type="button" variant="secondary" onClick={() => navigate(managePath)}>Cancel</Button>

            <Button type="submit" disabled={saving || disabled || !form.order_id || !orderEligible}>

              {saving ? "Saving…" : "Save refund"}

            </Button>

          </FormActions>

        </form>

      </FormPageLayout>

    </div>

  );

}


