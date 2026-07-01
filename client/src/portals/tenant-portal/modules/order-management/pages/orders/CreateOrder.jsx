import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { useUnsavedChangesGuard } from "../../../../../../hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "../../../../../../components/UnsavedChangesDialog";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { OrderFieldSelect } from "../../../../../../components/OrderFieldSelect";
import { Modal } from "../../../../../../components/Modal";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../../../components/FormPageLayout";
import { useOrderReference } from "../../hooks/useOrderReference";
import { MODULE_BASE, ORDER_SOURCE_LABELS } from "../../constants";
import { PAKISTAN_CITY_OPTIONS } from "../../../../../../utils/pakistanCities";
import { formatPKR } from "../../../../../../utils/currency";
import {
  buildLineItemFromProduct,
  calcLineTotal,
  mapOrderItemFromApi,
  productDeliveryTotal,
  productTaxTotal,
  lineDiscountForQty,
} from "../../utils/orderLinePricing";

const ORDER_INITIAL = {
  customer_id: "",
  order_source: "manual",
  order_status: "pending",
  payment_status: "unpaid",
  fulfillment_status: "unfulfilled",
  discount_amount: "0",
  delivery_charges: "0",
  city: "",
  delivery_address: "",
  notes: "",
};

function serializeState(form, items, warehouseId) {
  return JSON.stringify({ form, items, warehouseId });
}

function OrderTotalsSummary({ lineNet, taxTotal, discount, delivery, payable }) {
  return (
    <div className="wh-tx-summary-grid wh-order-totals">
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Items (before tax)</span>
        <span className="wh-tx-summary-item__value">{formatPKR(lineNet)}</span>
      </div>
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Product tax</span>
        <span className="wh-tx-summary-item__value">+ {formatPKR(taxTotal)}</span>
      </div>
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Order discount</span>
        <span className="wh-tx-summary-item__value">− {formatPKR(discount)}</span>
      </div>
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Delivery</span>
        <span className="wh-tx-summary-item__value">+ {formatPKR(delivery)}</span>
      </div>
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Payable</span>
        <span className="wh-tx-summary-item__value wh-tx-summary-item__value--accent">{formatPKR(payable)}</span>
      </div>
    </div>
  );
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const isEdit = Boolean(orderId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit, readOnly } = useModulePermission("order-management");
  const { customers, warehouses, field_options, loading: refLoading, loadError, addFieldOption } = useOrderReference();
  const [form, setForm] = useState(ORDER_INITIAL);
  const [items, setItems] = useState([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouseProducts, setWarehouseProducts] = useState([]);
  const [productPickerValue, setProductPickerValue] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [createBaseline, setCreateBaseline] = useState(null);
  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stockWarning, setStockWarning] = useState(null);
  const [pendingSubmit, setPendingSubmit] = useState(null);

  const disabled = readOnly || (isEdit ? !canEdit : !canCreate);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const isDirty = useMemo(() => {
    if (isEdit) return baseline !== null && serializeState(form, items, warehouseId) !== baseline;
    return createBaseline !== null && serializeState(form, items, warehouseId) !== createBaseline;
  }, [baseline, createBaseline, form, items, warehouseId, isEdit]);

  const { dialogOpen, stayOnPage, leavePage, reloadPending, navigateSafely } = useUnsavedChangesGuard(isDirty, {
    enabled: isEdit ? baseline !== null : createBaseline !== null,
    mode: isEdit ? "edit" : "create",
  });

  useEffect(() => {
    if (isEdit || createBaseline || refLoading || loadingProduct) return;
    setCreateBaseline(serializeState(form, items, warehouseId));
  }, [isEdit, createBaseline, refLoading, loadingProduct, form, items, warehouseId]);

  const loadWarehouseProducts = useCallback(async (wid) => {
    if (!wid) {
      setWarehouseProducts([]);
      return;
    }
    setLoadingProducts(true);
    try {
      const res = await apiFetch(`/orders/warehouse-products?warehouse_id=${wid}`, {}, authFetch);
      setWarehouseProducts(res.data || []);
    } catch {
      setWarehouseProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!warehouseId) return;
    loadWarehouseProducts(warehouseId).catch(() => {});
  }, [warehouseId, loadWarehouseProducts]);

  useEffect(() => {
    if (!isEdit) return;
    setLoadingProduct(true);
    apiFetch(`/orders/${orderId}`, {}, authFetch)
      .then((data) => {
        const nextForm = {
          customer_id: data.customer_id ? String(data.customer_id) : "",
          order_source: data.order_source || "manual",
          order_status: data.order_status || "pending",
          payment_status: data.payment_status || "unpaid",
          fulfillment_status: data.fulfillment_status || "unfulfilled",
          discount_amount: String(data.discount_amount ?? 0),
          delivery_charges: String(data.delivery_charges ?? 0),
          city: data.city || "",
          delivery_address: data.delivery_address || "",
          notes: data.notes || "",
        };
        const nextItems = (data.items || []).map((item, i) => mapOrderItemFromApi({ ...item, id: item.id ?? i }));
        setForm(nextForm);
        setItems(nextItems);
        setBaseline(serializeState(nextForm, nextItems, ""));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingProduct(false));
  }, [isEdit, orderId, authFetch]);

  const selectedProductIds = useMemo(
    () => new Set(items.map((i) => String(i.product_id))),
    [items]
  );

  const productOptions = useMemo(
    () =>
      warehouseProducts
        .filter((p) => !selectedProductIds.has(String(p.product_id)))
        .map((p) => ({
          value: `${p.product_id}-${p.variant_id}`,
          label: `${p.product_name} · ${p.sku || "—"} · ${formatPKR(p.selling_price)} · Avail: ${p.available_qty ?? 0}`,
        })),
    [warehouseProducts, selectedProductIds]
  );

  const handleProductPick = (value) => {
    if (!value) return;
    const product = warehouseProducts.find((p) => `${p.product_id}-${p.variant_id}` === value);
    if (product) toggleProduct(product);
    setProductPickerValue("");
  };

  const syncDeliveryFromItems = (rows) => {
    if (isEdit) return;
    setForm((f) => ({ ...f, delivery_charges: String(productDeliveryTotal(rows)) }));
  };

  const toggleProduct = (product) => {
    const pid = String(product.product_id);
    if (selectedProductIds.has(pid)) {
      setItems((rows) => {
        const next = rows.filter((r) => String(r.product_id) !== pid);
        syncDeliveryFromItems(next);
        return next;
      });
      return;
    }
    setItems((rows) => {
      const next = [...rows, buildLineItemFromProduct(product)];
      syncDeliveryFromItems(next);
      return next;
    });
  };

  const updateItem = (key, field, value) => {
    setItems((rows) => rows.map((row) => {
      if (row._key !== key) return row;
      const next = { ...row, [field]: value };
      if (field === "quantity") {
        next.discount = String(lineDiscountForQty(value, row.product_discount));
      }
      return next;
    }));
  };

  const removeItem = (key) => {
    setItems((rows) => {
      const next = rows.filter((r) => r._key !== key);
      syncDeliveryFromItems(next);
      return next;
    });
  };

  const lineNet = items.reduce((sum, row) => {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.unit_price) || 0;
    const disc = Number(row.discount) || 0;
    return sum + Math.max(0, qty * price - disc);
  }, 0);
  const taxTotal = productTaxTotal(items);
  const itemsGross = lineNet + taxTotal;
  const orderDiscount = Number(form.discount_amount) || 0;
  const deliveryCharges = Number(form.delivery_charges) || 0;
  const payable = Math.max(0, itemsGross - orderDiscount + deliveryCharges);

  const validate = () => {
    if (!warehouseId && !isEdit) return "Select a warehouse for line items";
    if (!items.length) return "Add at least one product";
    for (const row of items) {
      if (!row.product_name.trim()) return "Each item needs a product name";
      if (!row.sku.trim()) return "Each item needs a SKU";
      if (!Number(row.quantity) || Number(row.quantity) < 1) return "Invalid item quantity";
      if (Number(row.unit_price) < 0) return "Invalid item unit price";
    }
    return "";
  };

  const checkStock = () => items.filter((row) => {
    const avail = Number(row.available_qty);
    const qty = Number(row.quantity) || 0;
    return Number.isFinite(avail) && qty > avail;
  });

  const submitOrder = async (e) => {
    e?.preventDefault();
    if (disabled) return;
    const err = validate();
    if (err) { setError(err); return; }

    const oversold = checkStock();
    if (oversold.length) {
      setStockWarning(oversold);
      setPendingSubmit(e);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const payload = {
        ...form,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        discount_amount: orderDiscount,
        delivery_charges: deliveryCharges,
        items: items.map((row) => ({
          product_id: row.product_id ? Number(row.product_id) : null,
          product_name: row.product_name,
          sku: row.sku,
          quantity: Number(row.quantity),
          unit_price: Number(row.unit_price),
          discount: Number(row.discount) || 0,
          total_price: calcLineTotal(row),
        })),
      };
      if (isEdit) {
        await apiFetch(`/orders/${orderId}`, { method: "PUT", body: JSON.stringify(payload) }, authFetch);
      } else {
        await apiFetch("/orders", { method: "POST", body: JSON.stringify(payload) }, authFetch);
      }
      navigateSafely(`${MODULE_BASE}/orders/manage`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmOversold = () => {
    setStockWarning(null);
    if (pendingSubmit) submitOrder(pendingSubmit);
    setPendingSubmit(null);
  };

  const handleAddOption = async (fieldKey, value) => {
    await addFieldOption(fieldKey, value);
  };

  const handleWarehouseChange = (nextId) => {
    setWarehouseId(nextId);
    setProductPickerValue("");
    if (!isEdit && nextId !== warehouseId) {
      setItems([]);
    }
  };

  if (loadingProduct || refLoading) {
    return (
      <div className="wh-page">
        <FormPageLayout wide>
          <PageHeader title={isEdit ? "Edit Order" : "Create Order"} />
          <p className="wh-muted">Loading…</p>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout wide>
        <PageHeader
          title={isEdit ? "Edit Order" : "Create Order"}
          description="Select a warehouse and products, then fill in customer, delivery, and status details."
          actions={
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/orders/manage`)}>
              Back to orders
            </Button>
          }
        />

        <FormPageAlerts error={error || loadError} />

        <form className="wh-form-stack" onSubmit={submitOrder}>
          <FormBlock
            title="Products"
            description={
              isEdit
                ? "Review and adjust line items on this order."
                : "Choose a warehouse, then search and add products to the order."
            }
          >
            {!isEdit && (
              <FormField
                id="order-warehouse"
                label="Warehouse"
                as="select"
                value={warehouseId}
                onChange={(e) => handleWarehouseChange(e.target.value)}
                disabled={disabled}
              >
                <option value="">Select warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={String(w.id)}>{w.warehouse_name}</option>
                ))}
              </FormField>
            )}

            {!warehouseId && !isEdit && (
              <div className="wh-order-create-empty">
                <p className="wh-muted">Select a warehouse above to search products.</p>
              </div>
            )}

            {warehouseId && !isEdit && (
              <SearchableSelect
                id="order-product-search"
                label="Add product"
                value={productPickerValue}
                onChange={handleProductPick}
                options={productOptions}
                placeholder="Search by product name or SKU…"
                loading={loadingProducts}
                disabled={disabled}
                emptyMessage={
                  warehouseProducts.length === 0
                    ? "No products with stock in this warehouse."
                    : productOptions.length === 0
                      ? "All available products are already on this order."
                      : "No products match your search."
                }
              />
            )}

            {items.length > 0 && (
              <div className="wh-order-lines">
                <div className="wh-order-lines__head">
                  <h4 className="wh-order-lines__title">
                    {isEdit ? `Line items (${items.length})` : `Selected products (${items.length})`}
                  </h4>
                </div>
                <div className="wh-table-wrap">
                  <table className="wh-table wh-order-lines-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th>Unit price</th>
                        <th>Discount</th>
                        <th>Tax</th>
                        <th>Line total</th>
                        {!disabled && <th aria-label="Actions" />}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => (
                        <tr key={row._key}>
                          <td>{row.product_name}</td>
                          <td className="wh-muted">{row.sku}</td>
                          <td>
                            <input
                              className="wh-field__input wh-order-lines-table__input"
                              type="number"
                              min="1"
                              value={row.quantity}
                              onChange={(e) => updateItem(row._key, "quantity", e.target.value)}
                              disabled={disabled}
                            />
                          </td>
                          <td>
                            <input
                              className="wh-field__input wh-order-lines-table__input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unit_price}
                              onChange={(e) => updateItem(row._key, "unit_price", e.target.value)}
                              disabled={disabled}
                            />
                          </td>
                          <td>
                            <input
                              className="wh-field__input wh-order-lines-table__input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.discount}
                              onChange={(e) => updateItem(row._key, "discount", e.target.value)}
                              disabled={disabled}
                            />
                          </td>
                          <td className="wh-muted">
                            {formatPKR((Number(row.quantity) || 0) * (Number(row.product_tax) || 0))}
                          </td>
                          <td className="wh-order-lines-table__total">{formatPKR(calcLineTotal(row))}</td>
                          {!disabled && (
                            <td className="wh-order-lines-table__actions">
                              <Button
                                type="button"
                                variant="secondary"
                                className="wh-btn--sm"
                                onClick={() => removeItem(row._key)}
                              >
                                Remove
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </FormBlock>

          <FormBlock title="Customer & delivery" description="Who the order is for and where it should be delivered.">
            <div className="wh-form-grid">
              <FormField
                id="order-customer"
                label="Customer"
                as="select"
                value={form.customer_id}
                onChange={(e) => set("customer_id", e.target.value)}
                disabled={disabled}
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.company_name ? `${c.customer_name} — ${c.company_name}` : c.customer_name}
                  </option>
                ))}
              </FormField>
              <FormField
                id="order-city"
                label="City"
                as="select"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                disabled={disabled}
              >
                <option value="">Select city…</option>
                {PAKISTAN_CITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </FormField>
              <div className="wh-form-grid__full">
                <FormField
                  id="order-address"
                  label="Delivery address"
                  as="textarea"
                  rows={2}
                  value={form.delivery_address}
                  onChange={(e) => set("delivery_address", e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="wh-form-grid__full">
                <FormField
                  id="order-notes"
                  label="Notes"
                  as="textarea"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  disabled={disabled}
                  placeholder="Internal notes about this order"
                />
              </div>
            </div>
          </FormBlock>

          <FormBlock title="Order status" description="Channel and current order, payment, and fulfillment status.">
            <div className="wh-form-grid">
              <OrderFieldSelect
                label="Channel"
                fieldKey="channel"
                fieldOptions={field_options}
                value={form.order_source}
                onChange={(v) => set("order_source", v)}
                onAddOption={handleAddOption}
                labelFor={(v) => ORDER_SOURCE_LABELS[v] || v.replace(/_/g, " ")}
                emptyLabel="Select channel…"
                disabled={disabled}
              />
              <OrderFieldSelect
                label="Order status"
                fieldKey="order_status"
                fieldOptions={field_options}
                value={form.order_status}
                onChange={(v) => set("order_status", v)}
                onAddOption={handleAddOption}
                disabled={disabled}
              />
              <OrderFieldSelect
                label="Payment status"
                fieldKey="payment_status"
                fieldOptions={field_options}
                value={form.payment_status}
                onChange={(v) => set("payment_status", v)}
                onAddOption={handleAddOption}
                disabled={disabled}
              />
              <OrderFieldSelect
                label="Fulfillment status"
                fieldKey="fulfillment_status"
                fieldOptions={field_options}
                value={form.fulfillment_status}
                onChange={(v) => set("fulfillment_status", v)}
                onAddOption={handleAddOption}
                disabled={disabled}
              />
            </div>
          </FormBlock>

          <FormBlock title="Order total" description="Product delivery, tax, and discounts roll up automatically. Adjust order-level discount or delivery if needed.">
            <div className="wh-form-grid wh-order-totals-inputs">
              <FormField
                id="order-discount"
                label="Order discount"
                type="number"
                min="0"
                step="0.01"
                value={form.discount_amount}
                onChange={(e) => set("discount_amount", e.target.value)}
                disabled={disabled}
              />
              <FormField
                id="order-delivery"
                label="Delivery charges"
                type="number"
                min="0"
                step="0.01"
                value={form.delivery_charges}
                onChange={(e) => set("delivery_charges", e.target.value)}
                disabled={disabled}
              />
            </div>
            <OrderTotalsSummary
              lineNet={lineNet}
              taxTotal={taxTotal}
              discount={orderDiscount}
              delivery={deliveryCharges}
              payable={payable}
            />
          </FormBlock>

          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/orders/manage`)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || disabled}>
              {submitting ? "Saving…" : isEdit ? "Update order" : "Create order"}
            </Button>
          </FormActions>
        </form>
      </FormPageLayout>

      <Modal
        open={!!stockWarning}
        onClose={() => { setStockWarning(null); setPendingSubmit(null); }}
        title="Insufficient stock"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setStockWarning(null); setPendingSubmit(null); }}>Cancel</Button>
            <Button variant="danger" onClick={confirmOversold}>Continue anyway</Button>
          </>
        }
      >
        <p>The following products are sold out or exceed available stock. Continue with negative availability?</p>
        <ul className="wh-list">
          {(stockWarning || []).map((row) => (
            <li key={row._key}>
              {row.product_name} — requested {row.quantity}, available {row.available_qty ?? 0}
            </li>
          ))}
        </ul>
      </Modal>

      <UnsavedChangesDialog open={dialogOpen} onStay={stayOnPage} onDiscard={leavePage} reloadPending={reloadPending} />
    </div>
  );
}
