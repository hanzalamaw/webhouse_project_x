import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { useInventoryReference } from "../../hooks/useInventoryReference";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import CreateCategoryModal from "../../components/CreateCategoryModal";
import ProductOptionsEditor, {
  makeDefaultOptions,
  mapOptionsFromApi,
  mapVariantRowsFromApi,
} from "../../../shared/inventory/ProductOptionsEditor";
import { PRODUCT_STATUS, PRODUCT_UNITS, MODULE_BASE } from "../../constants";

const INITIAL = {
  product_name: "",
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

function mapProductToForm(product) {
  const variants = product.variants || [];
  const first = variants[0];
  return {
    product_name: product.product_name || "",
    sku_prefix: "",
    unit: product.unit || "piece",
    status: product.status || "active",
    default_cost_price: first?.cost_price ?? "",
    default_selling_price: first?.selling_price ?? "",
    delivery_charges: product.delivery_charges ?? "0",
    discount: product.discount ?? "0",
    tax: product.tax ?? "0",
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

export default function CreateProduct() {
  const navigate = useNavigate();
  const { productId } = useParams();
  const isEdit = Boolean(productId);
  const { authFetch } = useAuth();
  const { categories, warehouses, loading: refLoading, reload } = useInventoryReference();
  const [form, setForm] = useState(INITIAL);
  const [options, setOptions] = useState(() => makeDefaultOptions());
  const [variantRows, setVariantRows] = useState([]);
  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: String(c.id), label: c.category_name })),
    [categories]
  );
  const warehouseOptions = useMemo(
    () => warehouses.map((w) => ({ value: String(w.id), label: w.warehouse_name })),
    [warehouses]
  );

  useEffect(() => {
    if (!isEdit) return;
    setLoadingProduct(true);
    apiFetch(`/inventory/products/${productId}`, {}, authFetch)
      .then((data) => {
        setForm(mapProductToForm(data));
        setOptions(data.options?.length ? data.options.map((o, i) => ({
          _key: `o-${i}`,
          attribute_name: o.attribute_name,
          values: o.values || [],
          valueInput: "",
        })) : mapOptionsFromApi(data.variants || []));
        setVariantRows(mapVariantRowsFromApi(data.variants || []));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingProduct(false));
  }, [isEdit, productId, authFetch]);

  const validate = () => {
    if (!form.product_name.trim()) return "Product name is required";
    if (!form.category_id) return "Category is required";
    if (!variantRows.length) return "At least one variant is required";

    for (const opt of options) {
      if (opt.attribute_name.trim() && !opt.values.length) {
        return `Add at least one value for attribute "${opt.attribute_name}"`;
      }
    }

    const skus = new Set();
    for (let i = 0; i < variantRows.length; i++) {
      const v = variantRows[i];
      const label = v.variant_name || `Variant ${i + 1}`;
      if (!v.sku.trim()) return `SKU is required for ${label}`;
      if (skus.has(v.sku.trim())) return `Duplicate SKU: ${v.sku}`;
      skus.add(v.sku.trim());
      if (v.cost_price === "" || Number(v.cost_price) < 0) return `Valid cost price is required for ${label}`;
      if (v.selling_price === "" || Number(v.selling_price) < 0) return `Valid selling price is required for ${label}`;
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        product_name: form.product_name,
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
        variants: variantRows.map((row) => buildVariantRowPayload(row, isEdit)),
      };

      if (isEdit) {
        await apiFetch(`/inventory/products/${productId}`, { method: "PUT", body: JSON.stringify(payload) }, authFetch);
        setMessage("Product updated successfully.");
      } else {
        await apiFetch("/inventory/products", { method: "POST", body: JSON.stringify(payload) }, authFetch);
        setMessage("Product created successfully.");
        await reload();
      }
      setTimeout(() => navigate(`${MODULE_BASE}/products/manage`), 700);
    } catch (e) {
      setError(e.message);
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
          description="Define attributes and values — variants are generated automatically (e.g. Color × Size)."
          actions={
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/manage`)}>
              Manage Products
            </Button>
          }
        />

        <form onSubmit={handleSubmit} className="wh-form-stack">
          <FormBlock title="Basic information" description="Product name, unit, and SKU prefix for auto-generated variant SKUs.">
            <div className="wh-form-grid">
              <FormField id="product_name" label="Product name" value={form.product_name} onChange={(e) => set("product_name", e.target.value)} required />
              <FormField id="sku_prefix" label="SKU prefix" value={form.sku_prefix} onChange={(e) => set("sku_prefix", e.target.value)} placeholder="e.g. TS" />
              <FormField id="unit" label="Unit" as="select" value={form.unit} onChange={(e) => set("unit", e.target.value)}>
                {PRODUCT_UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
              </FormField>
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => set("status", e.target.value)}>
                {PRODUCT_STATUS.map((s) => (<option key={s} value={s}>{s}</option>))}
              </FormField>
            </div>
          </FormBlock>

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
                  <SearchableSelect id="category_id" label="Category" options={categoryOptions} value={form.category_id} onChange={(v) => set("category_id", v)} placeholder="Search categories…" />
                )}
                <div className={categoryOptions.length === 0 ? "wh-form-grid__actions" : "wh-form-grid--field-action__btn"}>
                  <Button type="button" variant="secondary" onClick={() => setCreateCategoryOpen(true)}>New category</Button>
                </div>
              </div>
            )}
          </FormBlock>

          <FormBlock title="Options & variants" description="Add options and values (like Shopify). Variants are generated automatically — set price and stock per row.">
            {warehouseOptions.length === 0 && !isEdit ? (
              <p className="wh-field__error">No warehouses found. Create a warehouse first to set initial stock.</p>
            ) : (
              <ProductOptionsEditor
                options={options}
                onOptionsChange={setOptions}
                variantRows={variantRows}
                onVariantRowsChange={setVariantRows}
                productName={form.product_name}
                skuPrefix={form.sku_prefix}
                defaultCostPrice={form.default_cost_price}
                defaultSellingPrice={form.default_selling_price}
                statusOptions={PRODUCT_STATUS}
                isEdit={isEdit}
                warehouseOptions={warehouseOptions}
                showWarehouseStock={!isEdit && warehouseOptions.length > 0}
              />
            )}
          </FormBlock>

          {error && <p className="wh-field__error">{error}</p>}
          {message && <p className="wh-form-message">{message}</p>}

          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/manage`)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : isEdit ? "Save Product" : "Create Product"}</Button>
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
    </div>
  );
}
