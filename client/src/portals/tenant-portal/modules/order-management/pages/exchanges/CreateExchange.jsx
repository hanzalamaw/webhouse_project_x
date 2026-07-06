import { useState, useEffect, useMemo } from "react";

import { useNavigate } from "react-router-dom";

import { useAuth } from "../../../../../../context/AuthContext";

import { useModulePermission } from "../../../../../../hooks/useModulePermission";

import { apiFetch } from "../../../../../../api/client";

import { PageHeader } from "../../../../../../components/PageHeader";

import { FormField } from "../../../../../../components/FormField";

import { Button } from "../../../../../../components/Button";

import { SearchableSelect } from "../../../../../../components/SearchableSelect";

import { FormBlock } from "../../../../../../components/FormBlock";

import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../../../components/FormPageLayout";

import { AfterSalesOrderSection } from "../../components/AfterSalesOrderSection";

import { useAfterSalesOrders } from "../../hooks/useAfterSalesOrders";

import { useOrderReference } from "../../hooks/useOrderReference";

import { MODULE_BASE, EXCHANGE_STATUSES, EXCHANGE_STATUS_LABELS } from "../../constants";
import { afterSalesIneligibilityMessage, isOrderEligibleForExchange } from "../../utils/afterSalesRules";



export default function CreateExchange() {

  const { authFetch } = useAuth();

  const { canCreate, readOnly } = useModulePermission("order-management");

  const { products, loading: refLoading } = useOrderReference();

  const navigate = useNavigate();

  const { orders, loading, error: loadError, prefillOrderId } = useAfterSalesOrders(authFetch);

  const [form, setForm] = useState({

    order_id: "",

    old_product_id: "",

    new_product_id: "",

    exchange_status: "requested",

    reason: "",

  });

  const [orderItems, setOrderItems] = useState([]);

  const [loadingItems, setLoadingItems] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");



  const disabled = readOnly || !canCreate;

  const managePath = `${MODULE_BASE}/exchanges/manage`;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectedOrder = useMemo(
    () => orders.find((o) => String(o.id) === String(form.order_id)) || null,
    [orders, form.order_id]
  );
  const orderEligible = selectedOrder ? isOrderEligibleForExchange(selectedOrder) : false;
  const ineligibleMessage = selectedOrder && !orderEligible
    ? afterSalesIneligibilityMessage(selectedOrder, "exchange")
    : null;

  const newProductOptions = useMemo(

    () => products.map((p) => ({ value: String(p.id), label: `${p.product_name} (${p.sku})` })),

    [products]

  );



  const oldProductOptions = useMemo(() => {

    if (orderItems.length) {

      const seen = new Set();

      return orderItems

        .filter((item) => item.product_id && !seen.has(item.product_id) && seen.add(item.product_id))

        .map((item) => ({

          value: String(item.product_id),

          label: `${item.product_name}${item.sku ? ` (${item.sku})` : ""}`,

        }));

    }

    return newProductOptions;

  }, [orderItems, newProductOptions]);



  useEffect(() => {

    if (prefillOrderId) {

      setForm((f) => ({ ...f, order_id: String(prefillOrderId), old_product_id: "" }));

    }

  }, [prefillOrderId]);



  useEffect(() => {

    if (!form.order_id) {

      setOrderItems([]);

      return;

    }

    setLoadingItems(true);

    apiFetch(`/orders/${form.order_id}`, {}, authFetch)

      .then((data) => setOrderItems(data.items || []))

      .catch(() => setOrderItems([]))

      .finally(() => setLoadingItems(false));

  }, [form.order_id, authFetch]);



  const handleOrderChange = (orderId) => {

    setForm((f) => ({ ...f, order_id: orderId, old_product_id: "" }));

  };



  const submit = async (e) => {

    e.preventDefault();

    if (disabled) return;

    if (!form.order_id) { setError("Select an order for this exchange."); return; }
    if (!orderEligible) {
      setError(ineligibleMessage || "This order cannot be exchanged.");
      return;
    }

    if (!form.old_product_id || !form.new_product_id) {

      setError("Select both the product being returned and the replacement product.");

      return;

    }

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

      navigate(managePath);

    } catch (err) {

      setError(err.message);

    } finally {

      setSaving(false);

    }

  };



  if (loading || refLoading) {

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

          title="Record exchange"

          description="Swap a product on an order for a different one and track the request."

          actions={

            <Button variant="secondary" onClick={() => navigate(managePath)}>Back to exchanges</Button>

          }

        />

        <FormPageAlerts error={error || loadError} />



        <form className="wh-form-stack wh-aftersales-form" onSubmit={submit}>

          <FormBlock title="Order" description="Select the order this exchange applies to.">

            <AfterSalesOrderSection

              orders={orders}

              value={form.order_id}

              onChange={handleOrderChange}

              disabled={disabled}

              prefillLocked={Boolean(prefillOrderId)}

              filterOrders={(rows) => rows.filter(isOrderEligibleForExchange)}

              ineligibleMessage={ineligibleMessage}

            />

          </FormBlock>



          <FormBlock title="Exchange details" description="Pick what is being returned and what will be sent instead.">

            <FormField

              id="exchange-status"

              label="Exchange status"

              as="select"

              value={form.exchange_status}

              onChange={(e) => set("exchange_status", e.target.value)}

              disabled={disabled}

            >

              {EXCHANGE_STATUSES.map((s) => (

                <option key={s} value={s}>{EXCHANGE_STATUS_LABELS[s] || s}</option>

              ))}

            </FormField>



            <div className="wh-exchange-swap">

              <div className="wh-exchange-swap__col">

                <span className="wh-exchange-swap__label">Returning</span>

                {loadingItems ? (

                  <p className="wh-muted">Loading order items…</p>

                ) : (

                  <SearchableSelect

                    id="exchange-old-product"

                    label="Product from order"

                    value={form.old_product_id}

                    onChange={(v) => set("old_product_id", v)}

                    options={oldProductOptions}

                    placeholder={form.order_id ? "Select product being returned…" : "Select an order first"}

                    disabled={disabled || !form.order_id}

                    emptyMessage={form.order_id ? "No products on this order." : "Select an order first."}

                  />

                )}

              </div>

              <div className="wh-exchange-swap__arrow" aria-hidden="true">→</div>

              <div className="wh-exchange-swap__col">

                <span className="wh-exchange-swap__label">Replacement</span>

                <SearchableSelect

                  id="exchange-new-product"

                  label="New product"

                  value={form.new_product_id}

                  onChange={(v) => set("new_product_id", v)}

                  options={newProductOptions}

                  placeholder="Select replacement product…"

                  disabled={disabled}

                />

              </div>

            </div>



            <FormField

              id="exchange-reason"

              label="Reason"

              as="textarea"

              rows={4}

              value={form.reason}

              onChange={(e) => set("reason", e.target.value)}

              disabled={disabled}

              placeholder="e.g. Customer received wrong colour, exchanging for correct variant…"

            />

          </FormBlock>



          <FormActions>

            <Button type="button" variant="secondary" onClick={() => navigate(managePath)}>Cancel</Button>

            <Button type="submit" disabled={saving || disabled || !form.order_id || !orderEligible}>

              {saving ? "Saving…" : "Save exchange"}

            </Button>

          </FormActions>

        </form>

      </FormPageLayout>

    </div>

  );

}


