import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { useInventoryReference } from "../../hooks/useInventoryReference";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { UnsavedChangesDialog } from "../../../../../../components/UnsavedChangesDialog";
import { useUnsavedChangesGuard } from "../../../../../../hooks/useUnsavedChangesGuard";
import CreateCategoryModal from "../../components/CreateCategoryModal";
import ProductOptionsEditor, {
  makeDefaultOptions,
  mapOptionsFromApi,
  mapVariantRowsFromApi,
} from "../../../shared/inventory/ProductOptionsEditor";
import { PRODUCT_STATUS, PRODUCT_UNITS, MODULE_BASE } from "../../constants";
import { useEcomSyncLink } from "../../../ecommerce/hooks/useShopifySyncLink";
import { useConnectedEcomStores } from "../../../ecommerce/hooks/useConnectedEcomStores";
import { ecomApiGet } from "../../../ecommerce/api/ecommerceClient";
import { IntegrationDestinationField } from "../../../ecommerce/components/IntegrationDestinationField";
import { INTEGRATION_DESTINATIONS } from "../../../ecommerce/constants";
import { resolveIntegrationSave, resolveLinkedEditSave } from "../../../ecommerce/utils/integrationDestination";
import {
  validateProductForShopifyOrErp,
  validateProductForDaraz,
  syncValidationSummary,
  scrollToFirstFieldError,
} from "../../../ecommerce/utils/syncFieldValidation";
import { ProductSyncSetupSection } from "../../components/ProductSyncSetupSection";
import { applyDefaultWarehouseStocks } from "../../components/ProductInventorySetupField";
import { ProductChannelPicker } from "../../components/ProductChannelPicker";
import { DarazProductFormFields, EMPTY_DARAZ_FIELDS } from "../../components/DarazProductFormFields";

const INITIAL = {
  product_name: "",
  description: "",
  sku_prefix: "",
  unit: "piece",
  status: "active",
  default_cost_price: "",
  default_selling_price: "",
  delivery_charges: "0",
  discount: "0",
  tax: "0",
  category_id: "",
};

function toFormValue(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function mapProductToForm(product) {
  const variants = product.variants || [];
  const first = variants[0];
  return {
    product_name: product.product_name || "",
    description: product.description || "",
    sku_prefix: "",
    unit: product.unit || "piece",
    status: product.status || "active",
    default_cost_price: toFormValue(first?.cost_price),
    default_selling_price: toFormValue(first?.selling_price),
    delivery_charges: toFormValue(product.delivery_charges ?? 0),
    discount: toFormValue(product.discount ?? 0),
    tax: toFormValue(product.tax ?? 0),
    category_id: product.category_id ? String(product.category_id) : "",
  };
}

function buildVariantRowPayload(row, isEdit) {
  const attributes = Object.entries(row.combo || {}).map(([attribute_name, value]) => ({
    attribute_name,
    value,
  }));
  const base = {
    ...(row.id ? { id: row.id } : {}),
    combo_key: row.combo_key,
    sku: row.sku.trim(),
    variant_name: row.variant_name.trim(),
    cost_price: Number(row.cost_price),
    selling_price: Number(row.selling_price),
    status: row.status,
    attributes,
  };
  if (isEdit) {
    base.stock_levels = (row.stock_levels || []).map((sl) => ({
      warehouse_id: sl.warehouse_id,
      reserved_qty: Number(sl.reserved_qty) || 0,
      damaged_qty: Number(sl.damaged_qty) || 0,
    }));
  } else {
    base.warehouse_stocks = (row.warehouse_stocks || [])
      .filter((r) => r.warehouse_id)
      .map((r) => ({
        warehouse_id: Number(r.warehouse_id),
        initial_qty: Number(r.initial_qty) || 0,
        reserved_qty: Number(r.reserved_qty) || 0,
        damaged_qty: Number(r.damaged_qty) || 0,
        stock_notes: r.stock_notes || null,
      }));
  }
  return base;
}

function normalizeOptions(opts) {
  return opts
    .map(({ attribute_name, values }) => ({
      attribute_name: String(attribute_name || "").trim(),
      values: [...(values || [])],
    }))
    .sort((a, b) => a.attribute_name.localeCompare(b.attribute_name));
}

function normalizeVariantRows(rows) {
  return rows.map((row) => ({
    id: row.id ?? null,
    combo_key: row.combo_key ?? "",
    sku: String(row.sku || "").trim(),
    variant_name: String(row.variant_name || "").trim(),
    cost_price: toFormValue(row.cost_price),
    selling_price: toFormValue(row.selling_price),
    status: row.status || "active",
    combo: row.combo || {},
    stock_levels: (row.stock_levels || []).map((sl) => ({
      warehouse_id: sl.warehouse_id != null ? Number(sl.warehouse_id) : null,
      reserved_qty: Number(sl.reserved_qty) || 0,
      damaged_qty: Number(sl.damaged_qty) || 0,
    })),
    warehouse_stocks: (row.warehouse_stocks || []).map((ws) => ({
      warehouse_id: ws.warehouse_id != null ? Number(ws.warehouse_id) : null,
      initial_qty: Number(ws.initial_qty) || 0,
      reserved_qty: Number(ws.reserved_qty) || 0,
      damaged_qty: Number(ws.damaged_qty) || 0,
      stock_notes: ws.stock_notes || null,
    })),
  }));
}

function serializeProductState(form, options, variantRows, daraz, saveDestination) {
  return JSON.stringify({
    form,
    options: normalizeOptions(options),
    variantRows: normalizeVariantRows(variantRows),
    daraz,
    saveDestination,
  });
}

function buildDarazVariantPayload(form, daraz) {
  const sku = String(daraz.seller_sku || "").trim();
  const qty = Math.max(0, Number(daraz.quantity) || 0);
  const warehouseId = daraz.warehouse_id ? Number(daraz.warehouse_id) : null;
  return {
    combo_key: "default",
    sku,
    variant_name: form.product_name.trim() || sku,
    cost_price: Number(daraz.cost_price) || 0,
    selling_price: Number(daraz.price) || 0,
    status: form.status || "active",
    attributes: [],
    warehouse_stocks: warehouseId
      ? [{
          warehouse_id: warehouseId,
          initial_qty: qty,
          reserved_qty: 0,
          damaged_qty: 0,
          stock_notes: "Opening stock for Daraz listing",
        }]
      : [],
  };
}

export default function CreateProduct() {
  const navigate = useNavigate();
  const { productId } = useParams();
  const isEdit = Boolean(productId);
  const { authFetch } = useAuth();
  const { canDelete } = useModulePermission("inventory-procurement");
  const { categories, warehouses, loading: refLoading, reload } = useInventoryReference();
  const [form, setForm] = useState(INITIAL);
  const [options, setOptions] = useState(() => makeDefaultOptions());
  const [variantRows, setVariantRows] = useState([]);
  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [createBaseline, setCreateBaseline] = useState(null);
  const [pendingBaselineCapture, setPendingBaselineCapture] = useState(false);
  const [entitySource, setEntitySource] = useState("manual");
  const [saveDestination, setSaveDestination] = useState(INTEGRATION_DESTINATIONS.ERP);
  const [daraz, setDaraz] = useState(() => ({ ...EMPTY_DARAZ_FIELDS }));
  const [inventoryStockEnabled, setInventoryStockEnabled] = useState(true);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState("");
  const [defaultInitialQty, setDefaultInitialQty] = useState("0");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openOrderCount, setOpenOrderCount] = useState(0);
  const formRef = useRef(form);
  const optionsRef = useRef(options);
  const variantRowsRef = useRef(variantRows);
  formRef.current = form;
  optionsRef.current = options;
  variantRowsRef.current = variantRows;

  const setVariantRowsLive = useCallback((next) => {
    const resolved = typeof next === "function" ? next(variantRowsRef.current) : next;
    variantRowsRef.current = resolved;
    setVariantRows(resolved);
  }, []);

  const { link: ecomLink, loading: linkLoading, isLinked: isStoreLinked } = useEcomSyncLink(
    "product",
    productId,
    { enabled: isEdit },
  );
  const {
    shopifyConnected,
    darazConnected,
    shopifyStoreName,
    darazStoreName,
    shopifyConnection,
    darazConnection,
    loading: storesLoading,
    refresh: refreshStores,
  } = useConnectedEcomStores();
  const formBusy = loadingProduct || linkLoading || submitting || storesLoading;
  const isDarazFlow = !isEdit && saveDestination === INTEGRATION_DESTINATIONS.DARAZ;
  const isShopifyFlow = !isEdit && saveDestination === INTEGRATION_DESTINATIONS.SHOPIFY;

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

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: String(c.id), label: c.category_name })),
    [categories]
  );
  const warehouseOptions = useMemo(
    () => warehouses.map((w) => ({ value: String(w.id), label: w.warehouse_name })),
    [warehouses]
  );

  const importPlatform = shopifyConnected ? "shopify" : darazConnected ? "daraz" : null;
  const importConnection = shopifyConnected ? shopifyConnection : darazConnection;
  const importShopQuery = shopifyConnection?.shop
    ? `?shop=${encodeURIComponent(shopifyConnection.shop)}`
    : "";

  const variantStockKey = useMemo(
    () => variantRows.map((r) => r.combo_key).join("|"),
    [variantRows],
  );

  useEffect(() => {
    if (isEdit || !warehouseOptions.length) return;
    setDefaultWarehouseId((prev) => prev || warehouseOptions[0].value);
    setDaraz((prev) => ({
      ...prev,
      warehouse_id: prev.warehouse_id || warehouseOptions[0].value,
    }));
  }, [isEdit, warehouseOptions]);

  // Prefer the ERP warehouse already mapped to a Daraz warehouse code.
  useEffect(() => {
    if (isEdit || !darazConnected || !warehouseOptions.length) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await ecomApiGet("daraz", "locations", authFetch);
        const mapped = (data.locations || []).find((loc) => loc.warehouseId);
        if (cancelled || !mapped?.warehouseId) return;
        const value = String(mapped.warehouseId);
        if (!warehouseOptions.some((o) => o.value === value)) return;
        setDaraz((prev) => ({ ...prev, warehouse_id: value }));
        setDefaultWarehouseId(value);
      } catch {
        // Keep first-warehouse fallback when locations API is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, darazConnected, warehouseOptions, authFetch]);

  useEffect(() => {
    if (isEdit || isDarazFlow || !inventoryStockEnabled) return;
    setVariantRowsLive((rows) =>
      applyDefaultWarehouseStocks(rows, {
        enabled: inventoryStockEnabled,
        warehouseId: defaultWarehouseId,
        initialQty: defaultInitialQty,
      }),
    );
  }, [
    isEdit,
    isDarazFlow,
    inventoryStockEnabled,
    defaultWarehouseId,
    defaultInitialQty,
    variantStockKey,
    setVariantRowsLive,
  ]);

  const currentSnapshot = useMemo(
    () => serializeProductState(form, options, variantRows, daraz, saveDestination),
    [form, options, variantRows, daraz, saveDestination]
  );

  const isDirty = useMemo(() => {
    if (isEdit) return baseline !== null && currentSnapshot !== baseline;
    return createBaseline !== null && currentSnapshot !== createBaseline;
  }, [baseline, createBaseline, currentSnapshot, isEdit]);

  const { dialogOpen, stayOnPage, leavePage, reloadPending, navigateSafely } = useUnsavedChangesGuard(isDirty, {
    enabled: isEdit ? baseline !== null && !loadingProduct && !refLoading : createBaseline !== null && !refLoading,
    mode: isEdit ? "edit" : "create",
  });

  const confirmDelete = async () => {
    if (!isEdit || !productId) return;
    setDeleting(true);
    setError("");
    try {
      await apiFetch(`/inventory/products/${productId}`, { method: "DELETE" }, authFetch);
      setDeleteOpen(false);
      navigateSafely(`${MODULE_BASE}/products/manage`);
    } catch (e) {
      setError(e.message);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (isEdit || createBaseline || refLoading || loadingProduct) return undefined;
    const timer = window.setTimeout(() => {
      setCreateBaseline(serializeProductState(form, options, variantRows, daraz, saveDestination));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isEdit, createBaseline, refLoading, loadingProduct, form, options, variantRows, daraz, saveDestination]);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setLoadingProduct(true);
    setBaseline(null);
    setPendingBaselineCapture(false);
    apiFetch(`/inventory/products/${productId}`, {}, authFetch)
      .then((data) => {
        if (!active) return;
        const nextForm = mapProductToForm(data);
        const nextOptions = data.options?.length
          ? data.options.map((o, i) => ({
              _key: `o-${i}`,
              attribute_name: o.attribute_name,
              values: o.values || [],
              valueInput: "",
            }))
          : mapOptionsFromApi(data.variants || []);
        const nextRows = mapVariantRowsFromApi(data.variants || []);
        setForm(nextForm);
        setOptions(nextOptions);
        setVariantRows(nextRows);
        setOpenOrderCount(Number(data.open_order_count) || 0);
        const source = data.source || "manual";
        setEntitySource(source);
        if (source === "shopify") setSaveDestination(INTEGRATION_DESTINATIONS.SHOPIFY);
        else if (source === "daraz") setSaveDestination(INTEGRATION_DESTINATIONS.DARAZ);
        else setSaveDestination(INTEGRATION_DESTINATIONS.ERP);
        setPendingBaselineCapture(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoadingProduct(false);
      });
    return () => {
      active = false;
    };
  }, [isEdit, productId, authFetch]);

  useEffect(() => {
    if (!isEdit || loadingProduct || !pendingBaselineCapture) return undefined;
    const timer = window.setTimeout(() => {
      setBaseline(
        serializeProductState(
          formRef.current,
          optionsRef.current,
          variantRowsRef.current,
          daraz,
          saveDestination,
        ),
      );
      setPendingBaselineCapture(false);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [isEdit, loadingProduct, pendingBaselineCapture, daraz, saveDestination]);

  const onChannelChange = (channel) => {
    setSaveDestination(channel);
    setCreateBaseline(null);
    setError("");
    setFieldErrors({});
    setMessage("");
  };

  const saveProduct = async (payload, { syncToShopify = false, syncToDaraz = false, source = "manual", info = "" } = {}) => {
    const body = { ...payload, syncToShopify, syncToDaraz, source };
    if (!isEdit && !isDarazFlow && inventoryStockEnabled && defaultWarehouseId) {
      body.default_warehouse_stock = {
        enabled: true,
        warehouse_id: Number(defaultWarehouseId),
        initial_qty: Number(defaultInitialQty) || 0,
      };
    }
    if (isEdit) {
      await apiFetch(`/inventory/products/${productId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
      setMessage(
        syncToShopify
          ? "Product updated and synced to Shopify."
          : syncToDaraz
            ? "Product updated and synced to Daraz."
            : (info || "Product updated successfully."),
      );
      setBaseline(serializeProductState(form, options, variantRows, daraz, saveDestination));
    } else {
      const created = await apiFetch("/inventory/products", { method: "POST", body: JSON.stringify(body) }, authFetch);
      setMessage(
        syncToShopify
          ? "Product created and synced to Shopify."
          : syncToDaraz
            ? "Product created and synced to Daraz."
            : (info || "Product created successfully."),
      );
      navigateSafely(`${MODULE_BASE}/products/edit/${created.id}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = isDarazFlow
      ? validateProductForDaraz({ form, daraz, warehouseOptions })
      : validateProductForShopifyOrErp({ form, options, variantRows });
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError(syncValidationSummary(errors));
      scrollToFirstFieldError();
      return;
    }
    setFieldErrors({});

    let payload;
    if (isDarazFlow && !isEdit) {
      const variant = buildDarazVariantPayload(form, daraz);
      payload = {
        product_name: form.product_name,
        description: form.description.trim() || null,
        sku_prefix: form.sku_prefix.trim() || undefined,
        unit: form.unit,
        status: form.status,
        category_id: Number(form.category_id),
        delivery_charges: Number(form.delivery_charges) || 0,
        discount: Number(form.discount) || 0,
        tax: Number(form.tax) || 0,
        default_cost_price: daraz.cost_price !== "" ? Number(daraz.cost_price) : undefined,
        default_selling_price: daraz.price !== "" ? Number(daraz.price) : undefined,
        options: [],
        variants: [variant],
        daraz_brand: daraz.brand.trim(),
        daraz_short_description: (daraz.short_description || form.description).trim().slice(0, 250),
        daraz_package: {
          length: String(daraz.package?.length || "10"),
          width: String(daraz.package?.width || "10"),
          height: String(daraz.package?.height || "10"),
          weight: String(daraz.package?.weight || "0.5"),
        },
      };
    } else {
      const rowsForSave = !isEdit && inventoryStockEnabled
        ? applyDefaultWarehouseStocks(variantRowsRef.current, {
            enabled: inventoryStockEnabled,
            warehouseId: defaultWarehouseId,
            initialQty: defaultInitialQty,
          })
        : variantRowsRef.current;

      payload = {
        product_name: form.product_name,
        description: form.description.trim() || null,
        sku_prefix: form.sku_prefix.trim() || undefined,
        unit: form.unit,
        status: form.status,
        category_id: Number(form.category_id),
        delivery_charges: Number(form.delivery_charges) || 0,
        discount: Number(form.discount) || 0,
        tax: Number(form.tax) || 0,
        default_cost_price: form.default_cost_price !== "" ? Number(form.default_cost_price) : undefined,
        default_selling_price: form.default_selling_price !== "" ? Number(form.default_selling_price) : undefined,
        options: options
          .filter((o) => o.attribute_name.trim() && o.values.length)
          .map((o) => ({ attribute_name: o.attribute_name.trim(), values: o.values })),
        variants: rowsForSave.map((row) => buildVariantRowPayload(row, isEdit)),
      };
    }

    const resolved = isEdit && isStoreLinked
      ? resolveLinkedEditSave(ecomLink, entitySource)
      : resolveIntegrationSave(saveDestination, {
          shopifyConnected,
          darazConnected,
        });
    if (!resolved || resolved.error) {
      setFieldErrors({ saveDestination: resolved?.error || "Could not resolve save destination." });
      setError(resolved?.error || "Could not resolve save destination.");
      scrollToFirstFieldError();
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await saveProduct(payload, {
        syncToShopify: resolved.syncToShopify,
        syncToDaraz: resolved.syncToDaraz,
        source: resolved.source,
        info: resolved.info,
      });
    } catch (saveErr) {
      setError(saveErr.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingProduct) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <p className="wh-muted">Loading product…</p>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={isEdit ? "Edit Product" : "Create New Product"}
          description={
            isEdit
              ? "Update product details, variants, and stock."
              : isDarazFlow
                ? "Daraz listing — brand, seller SKU, package size, and stock."
                : isShopifyFlow
                  ? "Shopify-style options & variants — generated automatically (e.g. Color × Size)."
                  : "Create an ERP inventory product with optional variants and stock."
          }
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/manage`)}>
                Manage Products
              </Button>
              {isEdit && canDelete && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setDeleteOpen(true)}
                  disabled={deleting || openOrderCount > 0}
                  title={openOrderCount > 0 ? "Products on open orders cannot be deleted." : undefined}
                >
                  Delete
                </Button>
              )}
            </div>
          }
        />

        <form onSubmit={handleSubmit} className="wh-form-stack">
          {!isEdit && (
            <ProductChannelPicker
              value={saveDestination}
              onChange={onChannelChange}
              shopifyConnected={shopifyConnected}
              darazConnected={darazConnected}
              shopifyStoreName={shopifyStoreName}
              darazStoreName={darazStoreName}
              disabled={formBusy}
              error={fieldErrors.saveDestination}
            />
          )}

          {isEdit && (
            <IntegrationDestinationField
              value={saveDestination || INTEGRATION_DESTINATIONS.ERP}
              onChange={setSaveDestination}
              disabled={formBusy}
              shopifyConnected={shopifyConnected}
              darazConnected={darazConnected}
              shopifyStoreName={shopifyStoreName}
              darazStoreName={darazStoreName}
              lockedPlatform={isStoreLinked ? ecomLink.platform : null}
              lockedStoreName={ecomLink?.storeName || shopifyStoreName || darazStoreName}
              error={fieldErrors.saveDestination}
            />
          )}

          <FormBlock
            title="Basic information"
            description={
              isDarazFlow
                ? "Name and full description shown on Daraz."
                : "Product name, description, unit, and SKU prefix for auto-generated variant SKUs."
            }
          >
            <div className="wh-form-grid">
              <FormField
                id="product_name"
                label="Product name"
                value={form.product_name}
                onChange={(e) => set("product_name", e.target.value)}
                required
                error={fieldErrors.product_name}
              />
              <div className="wh-form-grid__full">
                <FormField
                  id="description"
                  label={isDarazFlow ? "Full description" : "Description"}
                  as="textarea"
                  rows={isDarazFlow ? 5 : 4}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder={
                    isDarazFlow
                      ? "Detailed product description for the Daraz listing"
                      : "Product description (syncs to Shopify)"
                  }
                  required={isDarazFlow}
                  error={fieldErrors.description}
                />
              </div>
              {!isDarazFlow && (
                <FormField
                  id="sku_prefix"
                  label="SKU prefix"
                  value={form.sku_prefix}
                  onChange={(e) => set("sku_prefix", e.target.value)}
                  placeholder="e.g. TS"
                />
              )}
              <FormField id="unit" label="Unit" as="select" value={form.unit} onChange={(e) => set("unit", e.target.value)}>
                {PRODUCT_UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
              </FormField>
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => set("status", e.target.value)}>
                {PRODUCT_STATUS.map((s) => (<option key={s} value={s}>{s}</option>))}
              </FormField>
            </div>
          </FormBlock>

          {isDarazFlow ? (
            <DarazProductFormFields
              daraz={daraz}
              onChange={(next) => {
                setFieldErrors((prev) => {
                  const keys = Object.keys(prev).filter((k) => k.startsWith("daraz_"));
                  if (!keys.length && !prev.category_id) return prev;
                  const copy = { ...prev };
                  keys.forEach((k) => delete copy[k]);
                  delete copy.category_id;
                  return copy;
                });
                setDaraz(next);
              }}
              erpCategoryOptions={categoryOptions}
              erpCategoryId={form.category_id}
              onErpCategoryChange={(v) => set("category_id", v)}
              onCreateErpCategory={() => setCreateCategoryOpen(true)}
              warehouseOptions={warehouseOptions}
              disabled={formBusy}
              refLoading={refLoading}
              fieldErrors={fieldErrors}
            />
          ) : (
            <>
              <FormBlock title="Default variant pricing" description="Applied to new generated variants. Override per variant below.">
                <div className="wh-form-grid">
                  <FormField id="default_cost_price" label="Default cost price (PKR)" type="number" min="0" step="0.01" value={form.default_cost_price} onChange={(e) => set("default_cost_price", e.target.value)} />
                  <FormField id="default_selling_price" label="Default selling price (PKR)" type="number" min="0" step="0.01" value={form.default_selling_price} onChange={(e) => set("default_selling_price", e.target.value)} />
                </div>
              </FormBlock>

              <FormBlock title="Product pricing" description="Delivery, discount, and tax at product level.">
                <div className="wh-form-grid">
                  <FormField id="delivery_charges" label="Delivery charges (PKR)" type="number" min="0" step="0.01" value={form.delivery_charges} onChange={(e) => set("delivery_charges", e.target.value)} />
                  <FormField id="discount" label="Discount (PKR)" type="number" min="0" step="0.01" value={form.discount} onChange={(e) => set("discount", e.target.value)} />
                  <FormField id="tax" label="Tax (PKR)" type="number" min="0" step="0.01" value={form.tax} onChange={(e) => set("tax", e.target.value)} />
                </div>
              </FormBlock>

              <FormBlock title="Category" description="Assign this product to a category.">
                {refLoading ? (
                  <p className="wh-muted">Loading categories…</p>
                ) : (
                  <div className={categoryOptions.length === 0 ? "wh-form-grid" : "wh-form-grid wh-form-grid--field-action"}>
                    {categoryOptions.length === 0 ? (
                      <p className="wh-field__error wh-form-grid__full">No categories yet. Create one to continue.</p>
                    ) : (
                      <SearchableSelect
                        id="category_id"
                        label="Category"
                        options={categoryOptions}
                        value={form.category_id}
                        onChange={(v) => set("category_id", v)}
                        placeholder="Search categories…"
                        error={fieldErrors.category_id}
                      />
                    )}
                    <div className={categoryOptions.length === 0 ? "wh-form-grid__actions" : "wh-form-grid--field-action__btn"}>
                      <Button type="button" variant="secondary" onClick={() => setCreateCategoryOpen(true)}>New category</Button>
                    </div>
                  </div>
                )}
              </FormBlock>

              <FormBlock title="Options & variants" description="Add options and values (like Shopify). Variants are generated automatically — set price and stock per row.">
                {fieldErrors.variants || fieldErrors.options ? (
                  <p className="wh-field__error">{fieldErrors.variants || fieldErrors.options}</p>
                ) : null}
                {warehouseOptions.length === 0 && !isEdit ? (
                  <p className="wh-field__error">No warehouses found. Create a warehouse first to set initial stock.</p>
                ) : (
                  <ProductOptionsEditor
                    key={productId || "new"}
                    options={options}
                    onOptionsChange={setOptions}
                    variantRows={variantRows}
                    onVariantRowsChange={setVariantRowsLive}
                    productName={form.product_name}
                    skuPrefix={form.sku_prefix}
                    defaultCostPrice={form.default_cost_price}
                    defaultSellingPrice={form.default_selling_price}
                    statusOptions={PRODUCT_STATUS}
                    isEdit={isEdit}
                    warehouseOptions={warehouseOptions}
                    showWarehouseStock={!isEdit && warehouseOptions.length > 0}
                    fieldErrors={fieldErrors}
                  />
                )}
              </FormBlock>

              {!isEdit && (
                <ProductSyncSetupSection
                  authFetch={authFetch}
                  importPlatform={importPlatform}
                  importConnection={importConnection}
                  importShopQuery={importShopQuery}
                  onStoreImported={() => refreshStores().catch(() => {})}
                  inventoryStockEnabled={inventoryStockEnabled}
                  onInventoryStockEnabledChange={setInventoryStockEnabled}
                  defaultWarehouseId={defaultWarehouseId}
                  onDefaultWarehouseIdChange={setDefaultWarehouseId}
                  defaultInitialQty={defaultInitialQty}
                  onDefaultInitialQtyChange={setDefaultInitialQty}
                  warehouseOptions={warehouseOptions}
                  saveDestination={saveDestination}
                  shopifyConnected={shopifyConnected}
                  disabled={formBusy}
                />
              )}
            </>
          )}

          {error && <p className="wh-field__error">{error}</p>}
          {message && <p className="wh-form-message">{message}</p>}

          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/manage`)}>Cancel</Button>
            <Button type="submit" disabled={formBusy}>
              {submitting
                ? "Saving…"
                : isEdit
                  ? "Save Product"
                  : isDarazFlow
                    ? "Create & push to Daraz"
                    : isShopifyFlow
                      ? "Create & sync to Shopify"
                      : "Create Product"}
            </Button>
          </FormActions>
        </form>

        <CreateCategoryModal
          open={createCategoryOpen}
          onClose={() => setCreateCategoryOpen(false)}
          authFetch={authFetch}
          onCreated={async (category) => {
            await reload();
            if (category?.id) set("category_id", String(category.id));
          }}
        />
      </FormPageLayout>

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Delete product"
        recordName={form.product_name || "this product"}
        onConfirm={confirmDelete}
        onClose={() => setDeleteOpen(false)}
        loading={deleting}
      />

      <UnsavedChangesDialog
        open={dialogOpen}
        onStay={stayOnPage}
        onDiscard={leavePage}
        reloadPending={reloadPending}
      />
    </div>
  );
}
