import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { useUnsavedChangesGuard } from "../../../../../../hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "../../../../../../components/UnsavedChangesDialog";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { OrderFieldSelect } from "../../../../../../components/OrderFieldSelect";
import { Modal } from "../../../../../../components/Modal";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../../../components/FormPageLayout";
import { useOrderReference } from "../../hooks/useOrderReference";
import { MODULE_BASE, ORDER_SOURCE_LABELS } from "../../constants";
import {
  CUSTOMER_TYPES,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_STATUS_LABELS,
} from "../../../crm/constants";
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

const CUSTOMER_INITIAL = {
  customer_name: "",
  company_name: "",
  customer_type: "retailer",
  status: "active",
  email: "",
  tags: "",
  note: "",
};

const digitsOf = (s) => String(s || "").replace(/\D/g, "");

function serializeState(form, items, warehouseId, customerForm, customerPhone) {
  return JSON.stringify({ form, items, warehouseId, customerForm, customerPhone });
}

function normalizeCustomerSnapshot(customerForm, customerPhone, form) {
  return {
    customer_name: (customerForm.customer_name || "").trim(),
    company_name: (customerForm.company_name || "").trim(),
    customer_type: customerForm.customer_type || "retailer",
    status: customerForm.status || "active",
    email: (customerForm.email || "").trim(),
    note: (customerForm.note || "").trim(),
    phone: digitsOf(customerPhone),
    tags: String(customerForm.tags || "").split(",").map((t) => t.trim()).filter(Boolean).sort().join(","),
    city: (form.city || "").trim(),
    delivery_address: (form.delivery_address || "").trim(),
  };
}

function OrderTotalsSummary({ subtotal, lineDiscountTotal, taxTotal, orderDiscount, delivery, payable }) {
  const totalDiscount = lineDiscountTotal + orderDiscount;
  return (
    <div className="wh-tx-summary-grid wh-order-totals">
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Items subtotal</span>
        <span className="wh-tx-summary-item__value">{formatPKR(subtotal)}</span>
      </div>
      {lineDiscountTotal > 0 && (
        <div className="wh-tx-summary-item">
          <span className="wh-tx-summary-item__label">Product discounts</span>
          <span className="wh-tx-summary-item__value">− {formatPKR(lineDiscountTotal)}</span>
        </div>
      )}
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Order discount</span>
        <span className="wh-tx-summary-item__value">− {formatPKR(orderDiscount)}</span>
      </div>
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Product tax</span>
        <span className="wh-tx-summary-item__value">+ {formatPKR(taxTotal)}</span>
      </div>
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Delivery</span>
        <span className="wh-tx-summary-item__value">+ {formatPKR(delivery)}</span>
      </div>
      {totalDiscount > 0 && (
        <div className="wh-tx-summary-item">
          <span className="wh-tx-summary-item__label">Total savings</span>
          <span className="wh-tx-summary-item__value">− {formatPKR(totalDiscount)}</span>
        </div>
      )}
      <div className="wh-tx-summary-item">
        <span className="wh-tx-summary-item__label">Payable</span>
        <span className="wh-tx-summary-item__value wh-tx-summary-item__value--accent">{formatPKR(payable)}</span>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
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
  const [productSearch, setProductSearch] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [createBaseline, setCreateBaseline] = useState(null);
  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stockWarning, setStockWarning] = useState(null);

  // Customer capture
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerForm, setCustomerForm] = useState(CUSTOMER_INITIAL);
  const [linkedCustomerId, setLinkedCustomerId] = useState(null);
  const [linkedOriginal, setLinkedOriginal] = useState(null);
  const [phonePrompt, setPhonePrompt] = useState(null);
  const [customerUpdatePrompt, setCustomerUpdatePrompt] = useState(false);
  const promptedDigitsRef = useRef("");

  const disabled = readOnly || (isEdit ? !canEdit : !canCreate);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setCust = (key, value) => setCustomerForm((c) => ({ ...c, [key]: value }));

  const isDirty = useMemo(() => {
    const snap = serializeState(form, items, warehouseId, customerForm, customerPhone);
    if (isEdit) return baseline !== null && snap !== baseline;
    return createBaseline !== null && snap !== createBaseline;
  }, [baseline, createBaseline, form, items, warehouseId, customerForm, customerPhone, isEdit]);

  const { dialogOpen, stayOnPage, leavePage, reloadPending, navigateSafely } = useUnsavedChangesGuard(isDirty, {
    enabled: isEdit ? baseline !== null : createBaseline !== null,
    mode: isEdit ? "edit" : "create",
  });

  useEffect(() => {
    if (isEdit || createBaseline || refLoading || loadingProduct) return;
    setCreateBaseline(serializeState(form, items, warehouseId, customerForm, customerPhone));
  }, [isEdit, createBaseline, refLoading, loadingProduct, form, items, warehouseId, customerForm, customerPhone]);

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

  const applyCustomerDetail = useCallback((d) => {
    setCustomerForm({
      customer_name: d.customer_name || "",
      company_name: d.company_name || "",
      customer_type: d.customer_type || "retailer",
      status: d.status || "active",
      email: d.email || "",
      tags: (d.tags || []).join(", "),
      note: d.note || "",
    });
    setLinkedCustomerId(d.id);
    setLinkedOriginal(
      normalizeCustomerSnapshot(
        {
          customer_name: d.customer_name,
          company_name: d.company_name,
          customer_type: d.customer_type,
          status: d.status,
          email: d.email,
          tags: (d.tags || []).join(", "),
          note: d.note,
        },
        d.phone,
        { city: d.city, delivery_address: d.delivery_address }
      )
    );
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoadingProduct(true);
    apiFetch(`/orders/${orderId}`, {}, authFetch)
      .then(async (data) => {
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

        let nextCustomerForm = CUSTOMER_INITIAL;
        let nextPhone = "";
        if (data.customer_id) {
          try {
            const res = await apiFetch(`/orders/customers/${data.customer_id}`, {}, authFetch);
            const d = res.data;
            if (d) {
              nextPhone = d.phone || "";
              nextCustomerForm = {
                customer_name: d.customer_name || "",
                company_name: d.company_name || "",
                customer_type: d.customer_type || "retailer",
                status: d.status || "active",
                email: d.email || "",
                tags: (d.tags || []).join(", "),
                note: d.note || "",
              };
              setCustomerPhone(nextPhone);
              applyCustomerDetail(d);
              promptedDigitsRef.current = digitsOf(nextPhone);
            }
          } catch {
            /* customer detail is best-effort */
          }
        }
        setBaseline(serializeState(nextForm, nextItems, "", nextCustomerForm, nextPhone));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingProduct(false));
  }, [isEdit, orderId, authFetch, applyCustomerDetail]);

  // Prompt to reuse an existing customer when a full phone number matches.
  useEffect(() => {
    if (disabled) return;
    const digits = digitsOf(customerPhone);
    if (digits.length < 7 || linkedCustomerId) return;
    if (promptedDigitsRef.current === digits) return;
    const found = customers.find((c) => digitsOf(c.phone) === digits);
    if (found) {
      promptedDigitsRef.current = digits;
      setPhonePrompt(found);
    }
  }, [customerPhone, customers, linkedCustomerId, disabled]);

  const useExistingCustomer = async () => {
    if (!phonePrompt) return;
    const id = phonePrompt.id;
    setPhonePrompt(null);
    try {
      const res = await apiFetch(`/orders/customers/${id}`, {}, authFetch);
      const d = res.data;
      if (!d) return;
      setCustomerPhone(d.phone || customerPhone);
      applyCustomerDetail(d);
      setForm((f) => ({
        ...f,
        customer_id: String(d.id),
        city: d.city || f.city,
        delivery_address: d.delivery_address || f.delivery_address,
      }));
    } catch (e) {
      setError(e.message);
    }
  };

  const createNewFromPrompt = () => {
    setPhonePrompt(null);
    setLinkedCustomerId(null);
    setLinkedOriginal(null);
    setCustomerForm(CUSTOMER_INITIAL);
    setForm((f) => ({ ...f, customer_id: "" }));
  };

  const unlinkCustomer = () => {
    setLinkedCustomerId(null);
    setLinkedOriginal(null);
    setCustomerForm(CUSTOMER_INITIAL);
    setCustomerPhone("");
    promptedDigitsRef.current = "";
    setForm((f) => ({ ...f, customer_id: "" }));
  };

  // Grouped products for the variant picker.
  const groupedProducts = useMemo(() => {
    const map = new Map();
    for (const p of warehouseProducts) {
      if (!map.has(p.product_id)) {
        map.set(p.product_id, { product_id: p.product_id, product_name: p.product_name, variants: [] });
      }
      map.get(p.product_id).variants.push(p);
    }
    return [...map.values()];
  }, [warehouseProducts]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return groupedProducts;
    return groupedProducts
      .map((prod) => {
        const nameMatch = prod.product_name.toLowerCase().includes(q);
        const variants = nameMatch
          ? prod.variants
          : prod.variants.filter(
              (v) =>
                String(v.variant_name || "").toLowerCase().includes(q) ||
                String(v.sku || "").toLowerCase().includes(q)
            );
        return { ...prod, variants };
      })
      .filter((prod) => prod.variants.length);
  }, [groupedProducts, productSearch]);

  const itemForVariant = (product) =>
    items.find(
      (i) => String(i.product_id) === String(product.product_id) && String(i.variant_id) === String(product.variant_id)
    );

  const syncDeliveryFromItems = (rows) => {
    if (isEdit) return;
    setForm((f) => ({ ...f, delivery_charges: String(productDeliveryTotal(rows)) }));
  };

  const toggleVariant = (product) => {
    const existing = itemForVariant(product);
    if (existing) {
      setItems((rows) => {
        const next = rows.filter((r) => r._key !== existing._key);
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
      if (field === "quantity" && Number(row.product_discount) > 0) {
        next.discount = String(lineDiscountForQty(value, row.product_discount));
      }
      return next;
    }));
  };

  const adjustQty = (key, delta) => {
    setItems((rows) => rows.map((row) => {
      if (row._key !== key) return row;
      const nextQty = Math.max(1, (Number(row.quantity) || 1) + delta);
      const next = { ...row, quantity: String(nextQty) };
      if (Number(row.product_discount) > 0) {
        next.discount = String(lineDiscountForQty(nextQty, row.product_discount));
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

  const subtotal = items.reduce((sum, row) => {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.unit_price) || 0;
    return sum + qty * price;
  }, 0);
  const lineDiscountTotal = items.reduce((sum, row) => {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.unit_price) || 0;
    // Never let a line discount exceed that line's value.
    return sum + Math.min(Number(row.discount) || 0, qty * price);
  }, 0);
  const lineNet = Math.max(0, subtotal - lineDiscountTotal);
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
    if (row.available_qty == null) return false;
    const avail = Number(row.available_qty);
    const qty = Number(row.quantity) || 0;
    return Number.isFinite(avail) && qty > avail;
  });

  const customerChanged = () => {
    if (!linkedOriginal) return false;
    return JSON.stringify(normalizeCustomerSnapshot(customerForm, customerPhone, form)) !== JSON.stringify(linkedOriginal);
  };

  const submitOrder = (e) => {
    e?.preventDefault();
    if (disabled) return;
    const err = validate();
    if (err) { setError(err); return; }
    if (checkStock().length) { setStockWarning(checkStock()); return; }
    proceedToCustomer();
  };

  const proceedToCustomer = () => {
    if (linkedCustomerId && customerChanged()) {
      setCustomerUpdatePrompt(true);
      return;
    }
    finalizeSave({ updateExisting: false });
  };

  const confirmOversold = () => {
    setStockWarning(null);
    proceedToCustomer();
  };

  const finalizeSave = async ({ updateExisting }) => {
    setCustomerUpdatePrompt(false);
    setSubmitting(true);
    setError("");
    try {
      let resolvedCustomerId = linkedCustomerId;
      const custPayload = {
        customer_name: customerForm.customer_name.trim(),
        company_name: customerForm.company_name.trim(),
        customer_type: customerForm.customer_type,
        status: customerForm.status,
        email: customerForm.email.trim(),
        note: customerForm.note.trim(),
        tags: customerForm.tags,
        phone: customerPhone.trim(),
        city: form.city,
        delivery_address: form.delivery_address,
      };
      if (linkedCustomerId && updateExisting) {
        await apiFetch(`/orders/customers/${linkedCustomerId}`, {
          method: "PUT",
          body: JSON.stringify(custPayload),
        }, authFetch);
      } else if (!linkedCustomerId && custPayload.customer_name) {
        const created = await apiFetch("/orders/customers", {
          method: "POST",
          body: JSON.stringify(custPayload),
        }, authFetch);
        resolvedCustomerId = created?.id ?? null;
      }

      const payload = {
        ...form,
        customer_id: resolvedCustomerId ? Number(resolvedCustomerId) : null,
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
      const savedSnapshot = serializeState(form, items, warehouseId, customerForm, customerPhone);
      setBaseline(savedSnapshot);
      setCreateBaseline(savedSnapshot);
      navigateSafely(`${MODULE_BASE}/orders/manage`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddOption = async (fieldKey, value) => {
    await addFieldOption(fieldKey, value);
  };

  const handleWarehouseChange = (nextId) => {
    setWarehouseId(nextId);
    setProductSearch("");
    setProductPickerOpen(false);
    if (!isEdit && nextId !== warehouseId) {
      setItems([]);
    }
  };

  const openProductPicker = () => {
    if (!warehouseId || disabled || loadingProducts) return;
    setProductPickerOpen(true);
  };

  const closeProductPicker = () => {
    setProductPickerOpen(false);
    setProductSearch("");
  };

  const renderVariantPicker = () => {
    if (loadingProducts) {
      return <p className="wh-muted">Loading products…</p>;
    }
    if (filteredProducts.length === 0) {
      return (
        <p className="wh-muted">
          {warehouseProducts.length === 0
            ? "No products with stock in this warehouse."
            : "No products match your search."}
        </p>
      );
    }
    return (
      <div className="wh-variant-picker wh-variant-picker--modal">
        {filteredProducts.map((prod) => (
          <div className="wh-variant-group" key={prod.product_id}>
            <div className="wh-variant-group__head">
              <span className="wh-variant-group__name">{prod.product_name}</span>
              <span className="wh-variant-group__count">
                {prod.variants.length} variant{prod.variants.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="wh-variant-group__list">
              {prod.variants.map((v) => {
                const checked = Boolean(itemForVariant(v));
                return (
                  <div className={`wh-variant-row${checked ? " wh-variant-row--on" : ""}`} key={v.variant_id}>
                    <label className="wh-variant-row__select">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleVariant(v)}
                        disabled={disabled}
                      />
                      <span className="wh-variant-row__text">
                        <span className="wh-variant-row__name">{v.variant_name || "Default variant"}</span>
                        <span className="wh-variant-row__meta">
                          {v.sku ? `SKU ${v.sku} · ` : ""}{formatPKR(v.selling_price)} · Avail {v.available_qty ?? 0}
                        </span>
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loadingProduct || refLoading) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <PageHeader title={isEdit ? "Edit Order" : "Create Order"} />
          <p className="wh-muted">Loading…</p>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
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
                : "Choose a warehouse, then search to add variants. Set quantity and pricing below."
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
                <p className="wh-muted">Select a warehouse above to search and add products.</p>
              </div>
            )}

            {warehouseId && !isEdit && (
              <div className="wh-order-product-search">
                <FormField
                  id="order-product-search"
                  label="Search products"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    openProductPicker();
                  }}
                  onFocus={openProductPicker}
                  placeholder="Search by product name, variant, or SKU…"
                  disabled={disabled || loadingProducts}
                />
                <div className="wh-order-product-search__actions">
                  <Button type="button" variant="secondary" onClick={openProductPicker} disabled={disabled || loadingProducts}>
                    Browse products
                  </Button>
                  {items.length > 0 && (
                    <span className="wh-muted">{items.length} variant{items.length === 1 ? "" : "s"} selected</span>
                  )}
                </div>
              </div>
            )}

            {(isEdit || items.length > 0) && (
              <div className="wh-order-lines">
                <div className="wh-order-lines__head">
                  <h4 className="wh-order-lines__title">
                    {isEdit ? `Line items (${items.length})` : `Selected products (${items.length})`}
                  </h4>
                </div>
                {items.length === 0 ? (
                  <p className="wh-muted">No products selected yet.</p>
                ) : (
                  <ul className="wh-order-line-cards">
                    {items.map((row) => (
                      <li key={row._key} className="wh-order-line-card">
                        <div className="wh-order-line-card__head">
                          <div className="wh-order-line-card__info">
                            <span className="wh-order-line-card__name">{row.product_name}</span>
                            {(row.variant_name || row.sku) && (
                              <span className="wh-order-line-card__meta">
                                {[row.variant_name, row.sku ? `SKU ${row.sku}` : ""].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </div>
                          {!disabled && (
                            <button
                              type="button"
                              className="wh-order-line-card__remove"
                              onClick={() => removeItem(row._key)}
                              aria-label={`Remove ${row.product_name}`}
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>

                        <div className="wh-order-line-card__qty-row">
                          <span className="wh-order-line-card__field-label">Quantity</span>
                          <div className="wh-qty-stepper">
                            <button
                              type="button"
                              className="wh-qty-stepper__btn"
                              onClick={() => adjustQty(row._key, -1)}
                              disabled={disabled || Number(row.quantity) <= 1}
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="wh-qty-stepper__value">{row.quantity}</span>
                            <button
                              type="button"
                              className="wh-qty-stepper__btn"
                              onClick={() => adjustQty(row._key, 1)}
                              disabled={disabled}
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="wh-order-line-card__grid">
                          <label className="wh-order-line-card__field">
                            <span className="wh-order-line-card__field-label">Unit price</span>
                            <input
                              className="wh-field__input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unit_price}
                              onChange={(e) => updateItem(row._key, "unit_price", e.target.value)}
                              disabled={disabled}
                            />
                          </label>
                          <label className="wh-order-line-card__field">
                            <span className="wh-order-line-card__field-label">Discount</span>
                            <input
                              className="wh-field__input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.discount}
                              onChange={(e) => updateItem(row._key, "discount", e.target.value)}
                              disabled={disabled}
                            />
                          </label>
                          <label className="wh-order-line-card__field">
                            <span className="wh-order-line-card__field-label">Tax / unit</span>
                            <input
                              className="wh-field__input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.product_tax}
                              onChange={(e) => updateItem(row._key, "product_tax", e.target.value)}
                              disabled={disabled}
                            />
                          </label>
                        </div>

                        <div className="wh-order-line-card__foot">
                          <span className="wh-order-line-card__field-label">Line total</span>
                          <strong className="wh-order-line-card__total">{formatPKR(calcLineTotal(row))}</strong>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </FormBlock>

          <FormBlock title="Customer & delivery" description="Enter the customer's phone to match an existing record, or fill in the details to create a new customer.">
            <div className="wh-form-grid">
              <FormField
                id="order-customer-phone"
                label="Phone number"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                disabled={disabled}
                placeholder="Type phone to find an existing customer…"
              />
              {linkedCustomerId && (
                <div className="wh-form-grid__full">
                  <div className="wh-customer-hit">
                    <div className="wh-customer-hit__info">
                      <span className="wh-customer-hit__badge">Linked to existing customer</span>
                      <span className="wh-customer-hit__meta">Edits below will offer to update this customer when you save.</span>
                    </div>
                    {!disabled && (
                      <Button type="button" variant="secondary" className="wh-btn--sm" onClick={unlinkCustomer}>
                        Use a different number
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <FormField
                id="order-customer-name"
                label="Customer name"
                value={customerForm.customer_name}
                onChange={(e) => setCust("customer_name", e.target.value)}
                disabled={disabled}
                placeholder="Full name"
              />
              <FormField
                id="order-customer-company"
                label="Company"
                value={customerForm.company_name}
                onChange={(e) => setCust("company_name", e.target.value)}
                disabled={disabled}
              />
              <FormField
                id="order-customer-type"
                label="Customer type"
                as="select"
                value={customerForm.customer_type}
                onChange={(e) => setCust("customer_type", e.target.value)}
                disabled={disabled}
              >
                {CUSTOMER_TYPES.map((t) => (
                  <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t] || t}</option>
                ))}
              </FormField>
              <FormField
                id="order-customer-status"
                label="Status"
                as="select"
                value={customerForm.status}
                onChange={(e) => setCust("status", e.target.value)}
                disabled={disabled}
              >
                {CUSTOMER_STATUSES.map((s) => (
                  <option key={s} value={s}>{CUSTOMER_STATUS_LABELS[s] || s}</option>
                ))}
              </FormField>
              <FormField
                id="order-customer-email"
                label="Email"
                type="email"
                value={customerForm.email}
                onChange={(e) => setCust("email", e.target.value)}
                disabled={disabled}
                placeholder="name@example.com"
              />
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
                  id="order-customer-tags"
                  label="Tags"
                  value={customerForm.tags}
                  onChange={(e) => setCust("tags", e.target.value)}
                  disabled={disabled}
                  placeholder="Comma-separated (e.g. vip, lahore)"
                />
              </div>
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
                  id="order-customer-note"
                  label="Customer note"
                  as="textarea"
                  rows={2}
                  value={customerForm.note}
                  onChange={(e) => setCust("note", e.target.value)}
                  disabled={disabled}
                  placeholder="Notes about this customer"
                />
              </div>
              <div className="wh-form-grid__full">
                <FormField
                  id="order-notes"
                  label="Order notes"
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
              subtotal={subtotal}
              lineDiscountTotal={lineDiscountTotal}
              taxTotal={taxTotal}
              orderDiscount={orderDiscount}
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
        open={productPickerOpen}
        onClose={closeProductPicker}
        title="Select products"
        wide
        className="wh-modal--product-picker"
        footer={
          <Button type="button" onClick={closeProductPicker}>
            Done ({items.length} selected)
          </Button>
        }
      >
        <FormField
          id="order-product-search-modal"
          label="Search products"
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Search by product name, variant, or SKU…"
          disabled={disabled}
          autoFocus
        />
        {renderVariantPicker()}
      </Modal>

      <Modal
        open={!!stockWarning}
        onClose={() => setStockWarning(null)}
        title="Insufficient stock"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockWarning(null)}>Cancel</Button>
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

      <Modal
        open={!!phonePrompt}
        onClose={createNewFromPrompt}
        title="Customer found"
        footer={
          <>
            <Button variant="secondary" onClick={createNewFromPrompt}>Create new customer</Button>
            <Button onClick={useExistingCustomer}>Use this customer</Button>
          </>
        }
      >
        {phonePrompt && (
          <div className="wh-customer-prompt">
            <p>A customer already uses this phone number:</p>
            <div className="wh-customer-prompt__card">
              <span className="wh-customer-prompt__name">
                {phonePrompt.customer_name}
                {phonePrompt.company_name ? ` — ${phonePrompt.company_name}` : ""}
              </span>
              <span className="wh-customer-prompt__meta">
                {[phonePrompt.phone, phonePrompt.email, phonePrompt.city].filter(Boolean).join(" · ") || "No extra details"}
              </span>
            </div>
            <p className="wh-muted">Use this customer to auto-fill their details, or create a new customer on this number.</p>
          </div>
        )}
      </Modal>

      <Modal
        open={customerUpdatePrompt}
        onClose={() => finalizeSave({ updateExisting: false })}
        title="Update customer info?"
        footer={
          <>
            <Button variant="secondary" onClick={() => finalizeSave({ updateExisting: false })} disabled={submitting}>
              Keep existing
            </Button>
            <Button onClick={() => finalizeSave({ updateExisting: true })} disabled={submitting}>
              Update customer
            </Button>
          </>
        }
      >
        <p>You changed details for the linked customer. Do you want to update this customer's saved information, or keep it as-is and only use the new details for this order?</p>
      </Modal>

      <UnsavedChangesDialog open={dialogOpen} onStay={stayOnPage} onDiscard={leavePage} reloadPending={reloadPending} />
    </div>
  );
}
