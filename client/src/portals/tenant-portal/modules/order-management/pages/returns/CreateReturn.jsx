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

import { MODULE_BASE, RETURN_STATUSES, RETURN_STATUS_LABELS } from "../../constants";
import { afterSalesIneligibilityMessage, isOrderEligibleForReturn } from "../../utils/afterSalesRules";



export default function CreateReturn() {

  const { authFetch } = useAuth();

  const { canCreate, readOnly } = useModulePermission("order-management");

  const navigate = useNavigate();

  const { orders, loading, error: loadError, prefillOrderId } = useAfterSalesOrders(authFetch);

  const [form, setForm] = useState({ order_id: "", return_status: "requested", reason: "" });

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");



  const disabled = readOnly || !canCreate;

  const managePath = `${MODULE_BASE}/returns/manage`;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectedOrder = useMemo(
    () => orders.find((o) => String(o.id) === String(form.order_id)) || null,
    [orders, form.order_id]
  );
  const orderEligible = selectedOrder ? isOrderEligibleForReturn(selectedOrder) : false;
  const ineligibleMessage = selectedOrder && !orderEligible
    ? afterSalesIneligibilityMessage(selectedOrder, "return")
    : null;

  useEffect(() => {

    if (prefillOrderId) {

      setForm((f) => ({ ...f, order_id: String(prefillOrderId) }));

    }

  }, [prefillOrderId]);



  const submit = async (e) => {

    e.preventDefault();

    if (disabled) return;

    if (!form.order_id) { setError("Select an order for this return."); return; }
    if (!orderEligible) {
      setError(ineligibleMessage || "This order cannot be returned.");
      return;
    }

    setSaving(true);

    setError("");

    try {

      await apiFetch("/orders/returns", {

        method: "POST",

        body: JSON.stringify({

          order_id: Number(form.order_id),

          return_status: form.return_status,

          reason: form.reason.trim(),

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

          title="Record return"

          description="Log a product return against an order and track its progress."

          actions={

            <Button variant="secondary" onClick={() => navigate(managePath)}>Back to returns</Button>

          }

        />

        <FormPageAlerts error={error || loadError} />



        <form className="wh-form-stack wh-aftersales-form" onSubmit={submit}>

          <FormBlock title="Order" description="Select the order this return belongs to.">

            <AfterSalesOrderSection

              orders={orders}

              value={form.order_id}

              onChange={(v) => set("order_id", v)}

              disabled={disabled}

              prefillLocked={Boolean(prefillOrderId)}

              filterOrders={(rows) => rows.filter(isOrderEligibleForReturn)}

              ineligibleMessage={ineligibleMessage}

            />

          </FormBlock>



          <FormBlock title="Return details" description="Set the return status and describe what is being sent back.">

            <div className="wh-form-grid wh-form-grid--2">

              <FormField

                id="return-status"

                label="Return status"

                as="select"

                value={form.return_status}

                onChange={(e) => set("return_status", e.target.value)}

                disabled={disabled}

              >

                {RETURN_STATUSES.map((s) => (

                  <option key={s} value={s}>{RETURN_STATUS_LABELS[s] || s}</option>

                ))}

              </FormField>

            </div>

            <FormField

              id="return-reason"

              label="Reason"

              as="textarea"

              rows={4}

              value={form.reason}

              onChange={(e) => set("reason", e.target.value)}

              disabled={disabled}

              placeholder="e.g. Wrong size delivered, customer wants a refund…"

            />

          </FormBlock>



          <FormActions>

            <Button type="button" variant="secondary" onClick={() => navigate(managePath)}>Cancel</Button>

            <Button type="submit" disabled={saving || disabled || !form.order_id || !orderEligible}>

              {saving ? "Saving…" : "Save return"}

            </Button>

          </FormActions>

        </form>

      </FormPageLayout>

    </div>

  );

}


