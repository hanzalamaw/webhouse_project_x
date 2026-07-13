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
import { Card } from "../../../../../../components/Card";
import { OrderFieldSelect } from "../../../../../../components/OrderFieldSelect";
import { Modal } from "../../../../../../components/Modal";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../../../components/FormPageLayout";
import { useOrderReference } from "../../hooks/useOrderReference";
import { MODULE_BASE, ORDER_SOURCE_LABELS, ORDER_STATUS_LABELS } from "../../constants";
import {
  CUSTOMER_TYPES,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_STATUS_LABELS,
} from "../../../crm/constants";
import { PAKISTAN_CITY_OPTIONS } from "../../../../../../utils/pakistanCities";
import { formatPKR } from "../../../../../../utils/currency";
import { OrderItemsCardHead } from "../../components/OrderItemsCardHead";
import { OrderTotalsSummary } from "../../components/OrderTotalsSummary";
import {
  buildLineItemFromProduct,
  calcLineTotal,
  computeOrderTotals,
  mapOrderItemFromApi,
  productDeliveryTotal,
  lineDiscountForQty,
} from "../../utils/orderLinePricing";
import { useEcomSyncLink } from "../../../ecommerce/hooks/useShopifySyncLink";
import { useConnectedEcomStores } from "../../../ecommerce/hooks/useConnectedEcomStores";
import { IntegrationDestinationField } from "../../../ecommerce/components/IntegrationDestinationField";
import { INTEGRATION_DESTINATIONS } from "../../../ecommerce/constants";
import { ecomApiGet } from "../../../ecommerce/api/ecommerceClient";
import { resolveIntegrationSave, resolveLinkedEditSave } from "../../../ecommerce/utils/integrationDestination";
import {
  validateOrderForErp,
  validateOrderForShopify,
  syncValidationSummary,
  scrollToFirstFieldError,
} from "../../../ecommerce/utils/syncFieldValidation";

/** Catalog filter for warehouse product search based on save destination only. */
function productCatalogSource(saveDestination) {
  const dest = String(saveDestination || "").toLowerCase();
  if (dest === INTEGRATION_DESTINATIONS.SHOPIFY) return "shopify";
  if (dest === INTEGRATION_DESTINATIONS.DARAZ) return "daraz";
  return "manual";
}

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
  delivery_state: "",
  delivery_postal_code: "",
  delivery_country: "",
  tags: "",
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

function normalizeOrderItems(items) {
  return (items || []).map((item) => ({
    product_id: String(item.product_id || ""),
    variant_id: String(item.variant_id || ""),
    product_name: item.product_name || "",
    variant_name: item.variant_name || "",
    sku: item.sku || "",
    quantity: String(item.quantity ?? ""),
    unit_price: String(item.unit_price ?? ""),
    product_discount: String(item.product_discount ?? ""),
    product_tax: String(item.product_tax ?? ""),
    product_delivery: String(item.product_delivery ?? ""),
    discount: String(item.discount ?? ""),
  }));
}

function serializeState(form, items, warehouseId, customerForm, customerPhone) {
  return JSON.stringify({
    form,
    items: normalizeOrderItems(items),
    warehouseId: String(warehouseId || ""),
    customerForm,
    customerPhone: String(customerPhone || ""),
  });
}

function normalizeCustomerProfileSnapshot(customerForm, customerPhone) {
  return {
    customer_name: (customerForm.customer_name || "").trim(),
    company_name: (customerForm.company_name || "").trim(),
    customer_type: String(customerForm.customer_type || "retailer").trim().toLowerCase() || "retailer",
    status: String(customerForm.status || "active").trim().toLowerCase() || "active",
    email: (customerForm.email || "").trim().toLowerCase(),
    note: (customerForm.note || "").trim(),
    phone: digitsOf(customerPhone),
    tags: String(customerForm.tags || "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join(","),
  };
}

function customerFormFromDetail(d) {
  const tags = Array.isArray(d?.tags)
    ? d.tags.map((t) => (typeof t === "string" ? t : t?.tag_name)).filter(Boolean)
    : String(d?.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
  return {
    customer_name: d?.customer_name || "",
    company_name: d?.company_name || "",
    customer_type: d?.customer_type || "retailer",
    status: d?.status || "active",
    email: d?.email || "",
    tags: tags.join(", "),
    note: d?.note || "",
  };
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
  const { canCreate, canEdit, canDelete, readOnly } = useModulePermission("order-management");
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
  const [pendingBaselineCapture, setPendingBaselineCapture] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [actionError, setActionError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [actionMessage, setActionMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stockWarning, setStockWarning] = useState(null);
  const [initialLineKeys, setInitialLineKeys] = useState(() => new Set());
  const [orderNo, setOrderNo] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const formActionsRef = useRef(null);

  // Customer capture
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerForm, setCustomerForm] = useState(CUSTOMER_INITIAL);
  const [linkedCustomerId, setLinkedCustomerId] = useState(null);
  const [linkedOriginal, setLinkedOriginal] = useState(null);
  const [phonePrompt, setPhonePrompt] = useState(null);
  const [customerUpdatePrompt, setCustomerUpdatePrompt] = useState(false);
  const [saveDestination, setSaveDestination] = useState(INTEGRATION_DESTINATIONS.ERP);

  const { link: ecomLink, loading: linkLoading, isLinked: isStoreLinked, isShopifyLinked } = useEcomSyncLink(
    "order",
    orderId,
    { enabled: isEdit },
  );
  const {
    shopifyConnected,
    darazConnected,
    shopifyStoreName,
    darazStoreName,
    loading: storesLoading,
  } = useConnectedEcomStores();
  const formBusy = submitting || linkLoading || storesLoading || (isEdit && loadingProduct);
  const promptedDigitsRef = useRef("");
  const formRef = useRef(form);
  const itemsRef = useRef(items);
  const warehouseIdRef = useRef(warehouseId);
  const customerFormRef = useRef(customerForm);
  const customerPhoneRef = useRef(customerPhone);
  formRef.current = form;
  itemsRef.current = items;
  warehouseIdRef.current = warehouseId;
  customerFormRef.current = customerForm;
  customerPhoneRef.current = customerPhone;

  const disabled =
    readOnly ||
    (isEdit ? !canEdit : !canCreate) ||
    (isEdit && ["cancelled", "returned"].includes(String(form.order_status || "").toLowerCase()));
  const shopifyLockedLines =
    isEdit
    && isShopifyLinked
    && ["fulfilled", "partial"].includes(String(form.fulfillment_status || "").toLowerCase());
  const isLockedLine = (rowKey) => shopifyLockedLines && initialLineKeys.has(rowKey);
  const clearFieldError = (...keys) => {
    setFieldErrors((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of keys) {
        if (next[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };

  const set = (key, value) => {
    clearFieldError(key);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setCust = (key, value) => {
    const map = {
      customer_name: "customer_name",
      email: "customer_email",
    };
    clearFieldError(map[key] || key);
    if (key === "email") clearFieldError("customer_phone", "customer_email");
    setCustomerForm((c) => ({ ...c, [key]: value }));
  };

  const handleDestinationChange = (destination) => {
    clearFieldError("saveDestination");
    setSaveDestination(destination);
    const resolved = resolveIntegrationSave(destination, { shopifyConnected, darazConnected: false });
    if (!resolved.error && resolved.orderSource) {
      set("order_source", resolved.orderSource);
    }
  };

  const showActionError = (msg) => {
    setActionError(msg);
    setActionMessage("");
    requestAnimationFrame(() => {
      formActionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const resolveSaveDestination = () => (
    isEdit && isStoreLinked
      ? resolveLinkedEditSave(ecomLink, form.order_source)
      : resolveIntegrationSave(saveDestination, { shopifyConnected, darazConnected: false })
  );

  const setOrderStatus = (value) => {
    setForm((f) => ({
      ...f,
      order_status: value,
      ...(value === "delivered" ? { fulfillment_status: "fulfilled" } : {}),
    }));
  };

  const setFulfillmentStatus = (value) => {
    setForm((f) => ({
      ...f,
      fulfillment_status: value,
      // Fulfilled means delivered in our ERP status model (same as Shopify import mapping).
      ...(value === "fulfilled"
        && !["cancelled", "returned"].includes(String(f.order_status || "").toLowerCase())
        ? { order_status: "delivered" }
        : {}),
      ...(value === "partial"
        && !["cancelled", "returned", "delivered"].includes(String(f.order_status || "").toLowerCase())
        ? { order_status: "shipped" }
        : {}),
    }));
  };

  const isDirty = useMemo(() => {
    const snap = serializeState(form, items, warehouseId, customerForm, customerPhone);
    if (isEdit) return baseline !== null && snap !== baseline;
    return createBaseline !== null && snap !== createBaseline;
  }, [baseline, createBaseline, form, items, warehouseId, customerForm, customerPhone, isEdit]);

  const { dialogOpen, stayOnPage, leavePage, reloadPending, navigateSafely } = useUnsavedChangesGuard(isDirty, {
    enabled: isEdit
      ? baseline !== null && !loadingProduct && !refLoading
      : createBaseline !== null && !refLoading,
    mode: isEdit ? "edit" : "create",
  });

  useEffect(() => {
    if (isEdit || createBaseline || refLoading || loadingProduct) return;
    setCreateBaseline(serializeState(form, items, warehouseId, customerForm, customerPhone));
  }, [isEdit, createBaseline, refLoading, loadingProduct, form, items, warehouseId, customerForm, customerPhone]);

  const loadWarehouseProducts = useCallback(async (wid, source) => {
    if (!wid) {
      setWarehouseProducts([]);
      return;
    }
    setLoadingProducts(true);
    try {
      const qs = new URLSearchParams({ warehouse_id: String(wid) });
      if (source) qs.set("source", source);
      const res = await apiFetch(`/orders/warehouse-products?${qs}`, {}, authFetch);
      setWarehouseProducts(res.data || []);
    } catch {
      setWarehouseProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [authFetch]);

  const catalogSource = useMemo(
    () => productCatalogSource(saveDestination),
    [saveDestination],
  );

  useEffect(() => {
    if (!warehouseId) return;
    loadWarehouseProducts(warehouseId, catalogSource).catch(() => {});
  }, [warehouseId, catalogSource, loadWarehouseProducts]);

  // On edit (and create after warehouses load), preselect a warehouse so the product
  // picker is usable immediately — prefer a location-mapped warehouse for Shopify/Daraz.
  useEffect(() => {
    if (warehouseId || !warehouses.length || refLoading || loadingProduct) return undefined;
    let cancelled = false;
    (async () => {
      let preferred = String(warehouses[0].id);
      const platform =
        catalogSource === "shopify" || catalogSource === "daraz" ? catalogSource : null;
      if (platform) {
        try {
          const data = await ecomApiGet(platform, "locations", authFetch);
          const mapped = (data.locations || []).find((loc) => loc.warehouseId);
          if (
            mapped?.warehouseId &&
            warehouses.some((w) => String(w.id) === String(mapped.warehouseId))
          ) {
            preferred = String(mapped.warehouseId);
          }
        } catch {
          /* keep first-warehouse fallback */
        }
      }
      if (!cancelled) setWarehouseId(preferred);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    warehouseId,
    warehouses,
    refLoading,
    loadingProduct,
    catalogSource,
    authFetch,
  ]);

  const applyCustomerDetail = useCallback((d, phoneOverride) => {
    const phone = phoneOverride != null && String(phoneOverride).trim() !== ""
      ? String(phoneOverride)
      : (d?.phone || "");
    const nextForm = customerFormFromDetail(d);
    setCustomerForm(nextForm);
    setCustomerPhone(phone);
    setLinkedCustomerId(d.id);
    // Snapshot from the exact form + phone we just applied, so unchanged saves don't prompt.
    setLinkedOriginal(normalizeCustomerProfileSnapshot(nextForm, phone));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoadingProduct(true);
    setBaseline(null);
    setPendingBaselineCapture(false);
    apiFetch(`/orders/${orderId}`, {}, authFetch)
      .then(async (data) => {
        const orderSource = data.order_source || "manual";
        const nextForm = {
          customer_id: data.customer_id ? String(data.customer_id) : "",
          order_source: orderSource,
          order_status: data.order_status || "pending",
          payment_status: data.payment_status || "unpaid",
          fulfillment_status: data.fulfillment_status || "unfulfilled",
          discount_amount: String(data.discount_amount ?? 0),
          delivery_charges: String(data.delivery_charges ?? 0),
          city: data.city || "",
          delivery_address: data.delivery_address || "",
          delivery_state: data.delivery_state || "",
          delivery_postal_code: data.delivery_postal_code || "",
          delivery_country: data.delivery_country || "",
          tags: data.tags || "",
          notes: data.notes || "",
        };
        const nextItems = (data.items || []).map((item, i) => mapOrderItemFromApi({ ...item, id: item.id ?? i }));
        setForm(nextForm);
        setOrderNo(data.order_no || "");
        if (orderSource === "shopify") setSaveDestination(INTEGRATION_DESTINATIONS.SHOPIFY);
        else if (orderSource === "daraz") setSaveDestination(INTEGRATION_DESTINATIONS.DARAZ);
        setItems(nextItems);
        setInitialLineKeys(new Set(nextItems.map((item) => item._key)));

        if (data.customer_id) {
          try {
            const res = await apiFetch(`/orders/customers/${data.customer_id}`, {}, authFetch);
            const d = res.data;
            if (d) {
              applyCustomerDetail(d, d.phone || "");
              promptedDigitsRef.current = digitsOf(d.phone || "");
            }
          } catch {
            /* customer detail is best-effort */
          }
        }
        setPendingBaselineCapture(true);
      })
      .catch((e) => showActionError(e.message))
      .finally(() => setLoadingProduct(false));
  }, [isEdit, orderId, authFetch, applyCustomerDetail]);

  useEffect(() => {
    if (!isEdit || loadingProduct || !pendingBaselineCapture) return undefined;
    const timer = window.setTimeout(() => {
      setBaseline(
        serializeState(
          formRef.current,
          itemsRef.current,
          warehouseIdRef.current,
          customerFormRef.current,
          customerPhoneRef.current,
        ),
      );
      setPendingBaselineCapture(false);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [isEdit, loadingProduct, pendingBaselineCapture]);

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
      applyCustomerDetail(d, d.phone || customerPhone);
      setForm((f) => ({
        ...f,
        customer_id: String(d.id),
        city: d.city || f.city,
        delivery_address: d.delivery_address || f.delivery_address,
        delivery_state: d.delivery_state || f.delivery_state,
        delivery_postal_code: d.delivery_postal_code || f.delivery_postal_code,
        delivery_country: d.delivery_country || f.delivery_country,
      }));
    } catch (e) {
      showActionError(e.message);
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
      if (!p?.product_id || !p?.variant_id) continue;
      const name = String(p.product_name || "").trim();
      if (!name) continue;
      if (!map.has(p.product_id)) {
        map.set(p.product_id, { product_id: p.product_id, product_name: name, variants: [] });
      }
      map.get(p.product_id).variants.push(p);
    }
    return [...map.values()].filter((prod) => prod.variants.length > 0);
  }, [warehouseProducts]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    // Avoid rendering a wall of empty/partial rows before the user searches.
    if (q.length < 1) return [];
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

  const totals = computeOrderTotals(items, form.discount_amount, form.delivery_charges);
  const unitCount = items.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

  const validate = (syncToShopify = false) => {
    if (syncToShopify) {
      return validateOrderForShopify({
        form,
        customerForm,
        customerPhone,
        items,
        warehouseId,
        isEdit,
      });
    }
    return validateOrderForErp({ items, warehouseId, isEdit });
  };

  const checkStock = () => items.filter((row) => {
    if (row.available_qty == null) return false;
    const avail = Number(row.available_qty);
    const qty = Number(row.quantity) || 0;
    return Number.isFinite(avail) && qty > avail;
  });

  const customerChanged = () => {
    if (!linkedCustomerId || !linkedOriginal) return false;
    const current = normalizeCustomerProfileSnapshot(customerForm, customerPhone);
    return JSON.stringify(current) !== JSON.stringify(linkedOriginal);
  };

  const submitOrder = (e) => {
    e?.preventDefault();
    if (disabled) return;
    const resolved = resolveSaveDestination();
    if (!resolved || resolved.error) {
      const msg = resolved?.error || "Could not resolve save destination.";
      setFieldErrors({ saveDestination: msg });
      showActionError(msg);
      scrollToFirstFieldError();
      return;
    }
    const errors = validate(Boolean(resolved.syncToShopify));
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      showActionError(syncValidationSummary(errors));
      scrollToFirstFieldError();
      return;
    }
    setFieldErrors({});
    if (checkStock().length) { setStockWarning(checkStock()); return; }
    proceedToCustomer();
  };

  const attemptFinalize = async (updateExisting) => {
    const resolved = resolveSaveDestination();
    if (!resolved || resolved.error) {
      const msg = resolved?.error || "Could not resolve save destination.";
      setFieldErrors({ saveDestination: msg });
      showActionError(msg);
      scrollToFirstFieldError();
      return;
    }
    const errors = validate(Boolean(resolved.syncToShopify));
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      showActionError(syncValidationSummary(errors));
      scrollToFirstFieldError();
      return;
    }
    setFieldErrors({});
    finalizeSave({
      updateExisting,
      syncToShopify: resolved.syncToShopify,
      orderSource: resolved.orderSource,
      info: resolved.info,
    });
  };

  const proceedToCustomer = async () => {
    if (linkedCustomerId && customerChanged()) {
      setCustomerUpdatePrompt(true);
      return;
    }
    attemptFinalize(false);
  };

  const confirmCustomerUpdate = async (updateExisting) => {
    setCustomerUpdatePrompt(false);
    attemptFinalize(updateExisting);
  };

  const confirmOversold = () => {
    setStockWarning(null);
    proceedToCustomer();
  };

  const finalizeSave = async ({ updateExisting, syncToShopify = false, orderSource, info = "" }) => {
    setCustomerUpdatePrompt(false);
    setSubmitting(true);
    setActionError("");
    setActionMessage("");
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
        delivery_state: form.delivery_state,
        delivery_postal_code: form.delivery_postal_code,
        delivery_country: form.delivery_country,
      };
      if (linkedCustomerId && updateExisting) {
        await apiFetch(`/orders/customers/${linkedCustomerId}`, {
          method: "PUT",
          body: JSON.stringify({ ...custPayload, syncToShopify }),
        }, authFetch);
        setLinkedOriginal(normalizeCustomerProfileSnapshot(customerForm, customerPhone));
      } else if (!linkedCustomerId && custPayload.customer_name) {
        const created = await apiFetch("/orders/customers", {
          method: "POST",
          body: JSON.stringify({ ...custPayload, syncToShopify }),
        }, authFetch);
        resolvedCustomerId = created?.id ?? null;
      }

      const payload = {
        ...form,
        order_source: orderSource ?? form.order_source,
        syncToShopify,
        customer_id: resolvedCustomerId ? Number(resolvedCustomerId) : null,
        discount_amount: totals.orderDiscount,
        delivery_charges: totals.delivery,
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
      if (isEdit) {
        setActionMessage(syncToShopify ? "Order updated and synced to Shopify." : (info || "Order updated successfully."));
      } else {
        navigateSafely(`${MODULE_BASE}/orders/manage`);
      }
    } catch (err) {
      showActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddOption = async (fieldKey, value) => {
    await addFieldOption(fieldKey, value);
  };

  const handleWarehouseChange = (nextId) => {
    clearFieldError("warehouse_id");
    setWarehouseId(nextId);
    setProductSearch("");
    setProductPickerOpen(false);
    if (!isEdit && nextId !== warehouseId) {
      setItems([]);
    }
  };

  const openProductPicker = () => {
    if (disabled) return;
    if (!warehouseId) {
      showActionError(isEdit ? "Select a warehouse above to add products." : "Select a warehouse first to add products.");
      return;
    }
    setActionError("");
    setProductPickerOpen(true);
  };

  const closeProductPicker = () => {
    setProductPickerOpen(false);
    setProductSearch("");
  };

  const confirmDeleteOrder = async () => {
    if (!isEdit || !orderId) return;
    setDeleting(true);
    setActionError("");
    try {
      await apiFetch(`/orders/${orderId}`, { method: "DELETE" }, authFetch);
      setDeleteOpen(false);
      navigateSafely(`${MODULE_BASE}/orders/manage`);
    } catch (e) {
      setActionError(e.message);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const renderVariantPicker = () => {
    if (loadingProducts) {
      return <p className="wh-product-picker-empty">Loading products…</p>;
    }
    const q = productSearch.trim();
    if (!q) {
      const channelLabel =
        catalogSource === "shopify"
          ? "Shopify"
          : catalogSource === "daraz"
            ? "Daraz"
            : "ERP";
      const available = groupedProducts.length;
      return (
        <div className="wh-product-picker-empty">
          <p className="wh-product-picker-empty__title">Type to search {channelLabel} products</p>
          <p className="wh-muted">
            {available > 0
              ? `${available} product${available === 1 ? "" : "s"} available in this warehouse — search by name, variant, or SKU.`
              : `No ${channelLabel} products found in this warehouse.`}
          </p>
        </div>
      );
    }
    if (filteredProducts.length === 0) {
      return (
        <p className="wh-product-picker-empty">
          {groupedProducts.length === 0
            ? "No products found in this warehouse."
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
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/orders/manage`)}>
                Back to orders
              </Button>
              {isEdit && canDelete && (
                <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)} disabled={deleting}>
                  Delete
                </Button>
              )}
            </div>
          }
        />

        <FormPageAlerts error={loadError} />

        {isEdit && String(form.order_status || "").toLowerCase() === "cancelled" && (
          <p className="wh-field__error">This order is cancelled and cannot be edited (same as Shopify).</p>
        )}
        {isEdit && String(form.order_status || "").toLowerCase() === "returned" && (
          <p className="wh-field__error">This order is returned and cannot be edited (same as Shopify).</p>
        )}
        {shopifyLockedLines && (
          <p className="wh-muted" style={{ marginBottom: "0.75rem" }}>
            Fulfilled Shopify lines are locked. You can add new products, but cannot change or remove existing line quantities.
          </p>
        )}

        <form className="wh-form-stack" onSubmit={submitOrder}>
          <IntegrationDestinationField
            value={saveDestination}
            onChange={handleDestinationChange}
            disabled={disabled || formBusy}
            shopifyConnected={shopifyConnected}
            darazConnected={false}
            shopifyStoreName={shopifyStoreName}
            showDaraz={false}
            lockedPlatform={isEdit && isStoreLinked ? ecomLink.platform : null}
            lockedStoreName={ecomLink?.storeName || shopifyStoreName || darazStoreName}
            error={fieldErrors.saveDestination}
          />

          <FormBlock
            title="Products"
            description={
              catalogSource === "shopify"
                ? "Searching Shopify catalog products for this warehouse."
                : catalogSource === "daraz"
                  ? "Searching Daraz catalog products for this warehouse."
                  : isEdit
                    ? "Adjust existing line items or search ERP products to add more."
                    : "Choose a warehouse, then search ERP products to add variants."
            }
          >
            <FormField
              id="order-warehouse"
              label={isEdit ? "Warehouse (to add products)" : "Warehouse"}
              as="select"
              value={warehouseId}
              onChange={(e) => handleWarehouseChange(e.target.value)}
              disabled={disabled}
              error={fieldErrors.warehouse_id || fieldErrors.items}
            >
              <option value="">Select warehouse…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={String(w.id)}>{w.warehouse_name}</option>
              ))}
            </FormField>

            {!warehouseId && (
              <div className="wh-order-create-empty">
                <p className="wh-muted">
                  {isEdit
                    ? "Select a warehouse above to search and add more products to this order."
                    : "Select a warehouse above to search and add products."}
                </p>
              </div>
            )}

            {warehouseId && (
              <div className="wh-order-product-search">
                <FormField
                  id="order-product-search"
                  label={
                    catalogSource === "shopify"
                      ? "Search Shopify products"
                      : catalogSource === "daraz"
                        ? "Search Daraz products"
                        : "Search products"
                  }
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    openProductPicker();
                  }}
                  onFocus={openProductPicker}
                  placeholder={
                    catalogSource === "shopify"
                      ? "Search Shopify products by name, variant, or SKU…"
                      : catalogSource === "daraz"
                        ? "Search Daraz products by name, variant, or SKU…"
                        : "Search by product name, variant, or SKU…"
                  }
                  disabled={disabled}
                />
                <div className="wh-order-product-search__actions">
                  <Button type="button" variant="secondary" onClick={openProductPicker} disabled={disabled}>
                    {loadingProducts
                      ? "Loading…"
                      : isEdit
                        ? "Add product"
                        : "Browse products"}
                  </Button>
                  {items.length > 0 && (
                    <span className="wh-muted">{items.length} variant{items.length === 1 ? "" : "s"} selected</span>
                  )}
                </div>
              </div>
            )}

          </FormBlock>

          {(isEdit || items.length > 0) && (
            <Card className="wh-card--table wh-order-items-card">
              <OrderItemsCardHead
                itemCount={items.length}
                unitCount={unitCount}
                actions={
                  isEdit && !disabled ? (
                    <Button type="button" variant="secondary" onClick={openProductPicker} disabled={!warehouseId}>
                      Add product
                    </Button>
                  ) : null
                }
              />
              {items.length === 0 ? (
                <p className="wh-muted wh-order-items-card__empty">No products selected yet.</p>
              ) : (
                <>
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
                          {!disabled && !isLockedLine(row._key) && (
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
                              disabled={disabled || isLockedLine(row._key) || Number(row.quantity) <= 1}
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="wh-qty-stepper__value">{row.quantity}</span>
                            <button
                              type="button"
                              className="wh-qty-stepper__btn"
                              onClick={() => adjustQty(row._key, 1)}
                              disabled={disabled || isLockedLine(row._key)}
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

                  <div className="wh-order-summary-adjustments">
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
                      subtotal={totals.subtotal}
                      lineDiscountTotal={totals.lineDiscountTotal}
                      taxTotal={totals.taxTotal}
                      orderDiscount={totals.orderDiscount}
                      delivery={totals.delivery}
                      payable={totals.payable}
                    />
                  </div>
                </>
              )}
            </Card>
          )}

          <FormBlock title="Customer & delivery" description="Enter the customer's phone to match an existing record, or fill in the details to create a new customer.">
            <div className="wh-form-grid">
              <FormField
                id="order-customer-phone"
                label="Phone number"
                type="tel"
                value={customerPhone}
                onChange={(e) => {
                  clearFieldError("customer_phone", "customer_email");
                  setCustomerPhone(e.target.value);
                }}
                disabled={disabled}
                placeholder="Type phone to find an existing customer…"
                error={fieldErrors.customer_phone}
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
                error={fieldErrors.customer_name}
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
                error={fieldErrors.customer_email}
              />
              <FormField
                id="order-city"
                label="City"
                as="select"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                disabled={disabled}
                error={fieldErrors.city}
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
                  label="Street address"
                  as="textarea"
                  rows={2}
                  value={form.delivery_address}
                  onChange={(e) => set("delivery_address", e.target.value)}
                  disabled={disabled}
                  placeholder="Address line 1"
                  error={fieldErrors.delivery_address}
                />
              </div>
              <FormField
                id="order-delivery-state"
                label="State / Province"
                value={form.delivery_state}
                onChange={(e) => set("delivery_state", e.target.value)}
                disabled={disabled}
              />
              <FormField
                id="order-delivery-postal"
                label="Postal code"
                value={form.delivery_postal_code}
                onChange={(e) => set("delivery_postal_code", e.target.value)}
                disabled={disabled}
              />
              <FormField
                id="order-delivery-country"
                label="Country"
                value={form.delivery_country}
                onChange={(e) => set("delivery_country", e.target.value)}
                disabled={disabled}
                placeholder="e.g. Pakistan"
              />
              <div className="wh-form-grid__full">
                <FormField
                  id="order-tags"
                  label="Order tags"
                  value={form.tags}
                  onChange={(e) => set("tags", e.target.value)}
                  disabled={disabled}
                  placeholder="Comma-separated (e.g. wholesale, urgent)"
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
                  placeholder="Saved on the customer profile (synced to Shopify)"
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
                  placeholder="Synced to the Shopify order note"
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
                onChange={setOrderStatus}
                onAddOption={handleAddOption}
                labelFor={(v) => ORDER_STATUS_LABELS[v] || v.replace(/_/g, " ")}
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
                onChange={setFulfillmentStatus}
                onAddOption={handleAddOption}
                disabled={disabled}
              />
            </div>
          </FormBlock>

          <FormActions ref={formActionsRef} error={actionError} message={actionMessage}>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/orders/manage`)}>
              Cancel
            </Button>
            <Button type="submit" disabled={formBusy || disabled}>
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
          <Button type="button" modalPrimary onClick={closeProductPicker}>
            Done ({items.length} selected)
          </Button>
        }
      >
        <FormField
          id="order-product-search-modal"
          label={
            catalogSource === "shopify"
              ? "Search Shopify products"
              : catalogSource === "daraz"
                ? "Search Daraz products"
                : "Search products"
          }
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Type a product name, variant, or SKU…"
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
            <Button variant="secondary" modalPrimary onClick={() => setStockWarning(null)}>Cancel</Button>
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
            <Button modalPrimary onClick={useExistingCustomer}>Use this customer</Button>
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
        onClose={() => confirmCustomerUpdate(false)}
        title="Update customer info?"
        footer={
          <>
            <Button variant="secondary" onClick={() => confirmCustomerUpdate(false)} disabled={submitting}>
              Keep existing
            </Button>
            <Button modalPrimary onClick={() => confirmCustomerUpdate(true)} disabled={submitting}>
              Update customer
            </Button>
          </>
        }
      >
        <p>You changed details for the linked customer. Do you want to update this customer's saved information, or keep it as-is and only use the new details for this order?</p>
      </Modal>

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Delete order"
        recordName={orderNo || "this order"}
        onConfirm={confirmDeleteOrder}
        onClose={() => setDeleteOpen(false)}
        loading={deleting}
      />

      <UnsavedChangesDialog open={dialogOpen} onStay={stayOnPage} onDiscard={leavePage} reloadPending={reloadPending} />
    </div>
  );
}
