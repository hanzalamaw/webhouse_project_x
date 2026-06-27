import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { usePosReference } from "../../hooks/usePosReference";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import CreateCategoryModal from "../../components/CreateCategoryModal";
import { PRODUCT_STATUS, PRODUCT_UNITS, MODULE_BASE } from "../../constants";
import { formatTotalPrice } from "../../utils/pricing";

const INITIAL = {
  product_name: "",
  sku: "",
  unit: "piece",
  status: "active",
  cost_price: "0",
  selling_price: "",
  discount: "0",
  tax: "0",
  category_id: "",
  outlet_id: "",
};

function emptyStoreEntry(key) {
  return {
    _key: key,
    warehouse_id: "",
    initial_qty: "0",
    reserved_qty: "0",
    damaged_qty: "0",
    stock_notes: "",
  };
}

function mapProductToForm(product) {
  return {
    product_name: product.product_name || "",
    sku: product.sku || "",
    unit: product.unit || "piece",
    status: product.status || "active",
    cost_price: product.cost_price ?? "0",
    selling_price: product.selling_price ?? "",
    discount: product.discount ?? "0",
    tax: product.tax ?? "0",
    category_id: product.category_id ? String(product.category_id) : "",
    outlet_id: product.outlet_id ? String(product.outlet_id) : "",
  };
}

export default function CreateProduct() {
  const navigate = useNavigate();
  const { productId } = useParams();
  const isEdit = Boolean(productId);
  const { authFetch } = useAuth();
  const [form, setForm] = useState(INITIAL);
  const { categories, outlets, loading: refLoading, reload } = usePosReference(form.outlet_id || null);
  const [stockLevels, setStockLevels] = useState([]);
  const storeKeyRef = useRef(0);
  const makeStoreEntry = useCallback(() => {
    storeKeyRef.current += 1;
    return emptyStoreEntry(`store-${storeKeyRef.current}`);
  }, []);
  const [storeStocks, setStoreStocks] = useState(() => {
    storeKeyRef.current = 1;
    return [emptyStoreEntry("store-1")];
  });
  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const categoryOptions = useMemo(
    () => categories
      .filter((c) => !form.outlet_id || String(c.outlet_id) === String(form.outlet_id))
      .map((c) => ({ value: String(c.id), label: c.category_name })),
    [categories, form.outlet_id]
  );

  const storeOptions = useMemo(
    () => outlets.map((o) => ({ value: String(o.id), label: o.outlet_name })),
    [outlets]
  );

  useEffect(() => {
    if (!isEdit) return;
    setLoadingProduct(true);
    apiFetch(`/pos/inventory/products/${productId}`, {}, authFetch)
      .then((data) => {
        setStockLevels(
          (data.stock_levels || []).map((sl) => ({
            ...sl,
            warehouse_id: sl.outlet_id,
            warehouse_name: sl.outlet_name,
          }))
        );
        setForm(mapProductToForm(data));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingProduct(false));
  }, [isEdit, productId, authFetch]);

  useEffect(() => {
    if (isEdit || !form.outlet_id) return;
    setStoreStocks((rows) =>
      rows.map((row, index) => (
        index === 0 && !row.warehouse_id
          ? { ...row, warehouse_id: String(form.outlet_id) }
          : row
      ))
    );
  }, [form.outlet_id, isEdit]);

  const setStockLevel = (outletId, field, value) => {
    setStockLevels((levels) =>
      levels.map((sl) =>
        String(sl.outlet_id ?? sl.warehouse_id) === String(outletId) ? { ...sl, [field]: value } : sl
      )
    );
  };

  const updateStoreStock = (key, field, value) => {
    setStoreStocks((rows) =>
      rows.map((row) => (row._key === key ? { ...row, [field]: value } : row))
    );
  };

  const addStoreStock = () => {
    setStoreStocks((rows) => [...rows, makeStoreEntry()]);
  };

  const removeStoreStock = (key) => {
    setStoreStocks((rows) => (rows.length <= 1 ? rows : rows.filter((row) => row._key !== key)));
  };

  const storeOptionsFor = (currentKey) => {
    const used = new Set(
      storeStocks
        .filter((row) => row._key !== currentKey && row.warehouse_id)
        .map((row) => row.warehouse_id)
    );
    const allowed = form.outlet_id
      ? storeOptions.filter((opt) => opt.value === String(form.outlet_id))
      : storeOptions;
    return allowed.filter((opt) => !used.has(opt.value));
  };

  const canAddStore = form.outlet_id && storeStocks.length < 1;

  const validate = () => {
    if (!form.outlet_id) return "Store is required";
    if (!form.product_name.trim()) return "Product name is required";
    if (!form.sku.trim()) return "SKU is required";
    if (form.selling_price === "" || Number(form.selling_price) < 0) return "Valid selling price is required";
    if (!form.category_id) return "Category is required";
    if (!isEdit) {
      const filled = storeStocks.filter((row) => row.warehouse_id);
      const ids = filled.map((row) => row.warehouse_id);
      if (new Set(ids).size !== ids.length) return "Each store can only be selected once";
      for (const row of filled) {
        if (String(row.warehouse_id) !== String(form.outlet_id)) {
          return "Stock store must match the product store";
        }
        const available = Number(row.initial_qty);
        const reserved = Number(row.reserved_qty);
        const damaged = Number(row.damaged_qty);
        if (!Number.isInteger(available) || available < 0) return "Available quantity must be a non-negative whole number";
        if (!Number.isInteger(reserved) || reserved < 0) return "Reserved quantity must be a non-negative whole number";
        if (!Number.isInteger(damaged) || damaged < 0) return "Damaged quantity must be a non-negative whole number";
        if (available > 0 && !row.warehouse_id) return "Select a store when setting available quantity";
      }
      const partial = storeStocks.filter((row) => !row.warehouse_id && (
        Number(row.initial_qty) > 0 || Number(row.reserved_qty) > 0 || Number(row.damaged_qty) > 0
      ));
      if (partial.length) return "Select a store for each stock entry with quantities";
    } else {
      for (const sl of stockLevels) {
        const reserved = Number(sl.reserved_qty);
        const damaged = Number(sl.damaged_qty);
        if (!Number.isInteger(reserved) || reserved < 0) return `Invalid reserved quantity for ${sl.outlet_name || sl.warehouse_name}`;
        if (!Number.isInteger(damaged) || damaged < 0) return `Invalid damaged quantity for ${sl.outlet_name || sl.warehouse_name}`;
      }
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
        sku: form.sku,
        unit: form.unit,
        status: form.status,
        outlet_id: Number(form.outlet_id),
        category_id: Number(form.category_id),
        cost_price: Number(form.cost_price) || 0,
        selling_price: Number(form.selling_price),
        discount: Number(form.discount) || 0,
        tax: Number(form.tax) || 0,
      };

      if (isEdit) {
        await apiFetch(
          `/pos/inventory/products/${productId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              ...payload,
              stock_levels: stockLevels.map((sl) => ({
                outlet_id: sl.outlet_id ?? sl.warehouse_id,
                reserved_qty: Number(sl.reserved_qty) || 0,
                damaged_qty: Number(sl.damaged_qty) || 0,
              })),
            }),
          },
          authFetch
        );
        setMessage("Product updated successfully.");
      } else {
        await apiFetch(
          "/pos/inventory/products",
          {
            method: "POST",
            body: JSON.stringify({
              ...payload,
              warehouse_stocks: storeStocks
                .filter((row) => row.warehouse_id)
                .map((row) => ({
                  warehouse_id: Number(row.warehouse_id),
                  initial_qty: Number(row.initial_qty) || 0,
                  reserved_qty: Number(row.reserved_qty) || 0,
                  damaged_qty: Number(row.damaged_qty) || 0,
                  stock_notes: row.stock_notes || null,
                })),
            }),
          },
          authFetch
        );
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

  if (loadingProduct || refLoading) {
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
          description={isEdit ? "Update product details and save changes." : "Add a product with category, pricing, store, and initial stock."}
          actions={
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/manage`)}>
              Manage Products
            </Button>
          }
        />

        <form onSubmit={handleSubmit} className="wh-form-stack">
        <FormBlock title="Basic information" description="Name, SKU, unit, store, and status for this product.">
          <div className="wh-form-grid">
            <SearchableSelect
              id="outlet_id"
              label="Store"
              options={storeOptions}
              value={form.outlet_id}
              onChange={(v) => {
                set("outlet_id", v);
                set("category_id", "");
              }}
              placeholder="Select store…"
              disabled={isEdit}
            />
            <FormField id="product_name" label="Product name" value={form.product_name} onChange={(e) => set("product_name", e.target.value)} required />
            <FormField id="sku" label="SKU" value={form.sku} onChange={(e) => set("sku", e.target.value)} required />
            <FormField id="unit" label="Unit" as="select" value={form.unit} onChange={(e) => set("unit", e.target.value)}>
              {PRODUCT_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </FormField>
            <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {PRODUCT_STATUS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FormField>
          </div>
        </FormBlock>

        <FormBlock title="Pricing" description="Cost defaults to zero. Selling price, discount, tax, and calculated total.">
          <div className="wh-form-grid">
            <FormField id="cost_price" label="Cost price (PKR)" type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => set("cost_price", e.target.value)} />
            <FormField id="selling_price" label="Selling price (PKR)" type="number" min="0" step="0.01" value={form.selling_price} onChange={(e) => set("selling_price", e.target.value)} required />
            <FormField id="discount" label="Discount (PKR)" type="number" min="0" step="0.01" value={form.discount} onChange={(e) => set("discount", e.target.value)} />
            <FormField id="tax" label="Tax (PKR)" type="number" min="0" step="0.01" value={form.tax} onChange={(e) => set("tax", e.target.value)} />
            <FormField
              id="total_price"
              label="Total price (PKR)"
              value={formatTotalPrice(form.selling_price, form.discount, form.tax)}
              displayOnly
            />
          </div>
          <p className="wh-form-block__desc">Total = (Selling price − Discount) + Tax</p>
        </FormBlock>

        <FormBlock title="Category" description="Assign this product to a category at the selected store.">
          {!form.outlet_id ? (
            <p className="wh-muted">Select a store first to choose a category.</p>
          ) : (
            <div className="wh-form-grid">
              {categoryOptions.length === 0 ? (
                <p className="wh-muted wh-form-grid__full">No categories yet for this store.</p>
              ) : (
                <SearchableSelect
                  id="category_id"
                  label="Category"
                  options={categoryOptions}
                  value={form.category_id}
                  onChange={(v) => set("category_id", v)}
                  placeholder="Search categories…"
                />
              )}
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <Button type="button" variant="secondary" onClick={() => setCreateCategoryOpen(true)}>
                  New category
                </Button>
              </div>
            </div>
          )}
        </FormBlock>

        {!isEdit ? (
          <FormBlock title="Inventory & store stock" description="Set initial stock for this product at its store.">
            {!form.outlet_id ? (
              <p className="wh-muted">Select a store first.</p>
            ) : storeOptionsFor(storeStocks[0]?._key).length === 0 ? (
              <p className="wh-field__error">No active stores found.</p>
            ) : (
              <>
                <div className="wh-inv-line-items">
                  {storeStocks.map((row, index) => (
                    <div key={row._key} className="wh-inv-line-item">
                      <div className="wh-inv-line-item__head">
                        <strong>Store stock {index + 1}</strong>
                        {storeStocks.length > 1 && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="wh-btn--sm"
                            onClick={() => removeStoreStock(row._key)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <SearchableSelect
                        id={`store_${row._key}`}
                        label="Store"
                        options={storeOptionsFor(row._key)}
                        value={row.warehouse_id || String(form.outlet_id)}
                        onChange={(v) => updateStoreStock(row._key, "warehouse_id", v)}
                        placeholder="Select store…"
                      />
                      <div className="wh-form-grid">
                        <FormField
                          id={`initial_qty_${row._key}`}
                          label="Available quantity"
                          type="number"
                          min="0"
                          step="1"
                          value={row.initial_qty}
                          onChange={(e) => updateStoreStock(row._key, "initial_qty", e.target.value)}
                        />
                        <FormField
                          id={`reserved_qty_${row._key}`}
                          label="Reserved quantity"
                          type="number"
                          min="0"
                          step="1"
                          value={row.reserved_qty}
                          onChange={(e) => updateStoreStock(row._key, "reserved_qty", e.target.value)}
                        />
                        <FormField
                          id={`damaged_qty_${row._key}`}
                          label="Damaged quantity"
                          type="number"
                          min="0"
                          step="1"
                          value={row.damaged_qty}
                          onChange={(e) => updateStoreStock(row._key, "damaged_qty", e.target.value)}
                        />
                      </div>
                      <FormField
                        id={`stock_notes_${row._key}`}
                        label="Stock notes"
                        as="textarea"
                        rows={2}
                        value={row.stock_notes}
                        onChange={(e) => updateStoreStock(row._key, "stock_notes", e.target.value)}
                        placeholder="Notes for the initial stock movement record"
                      />
                    </div>
                  ))}
                </div>
                {canAddStore && (
                  <div className="wh-inv-warehouse-add">
                    <Button type="button" variant="secondary" onClick={addStoreStock}>
                      Add store
                    </Button>
                  </div>
                )}
              </>
            )}
          </FormBlock>
        ) : (
          <FormBlock title="Stock levels" description="Reserved and damaged quantities by store. Use Stock In / Stock Out to change available quantity.">
            {stockLevels.length === 0 ? (
              <p className="wh-muted">No stock recorded for this product yet.</p>
            ) : (
              <div className="wh-inv-line-items">
                {stockLevels.map((sl) => (
                  <div key={sl.id} className="wh-inv-line-item">
                    <div className="wh-inv-line-item__head">
                      <strong>{sl.outlet_name || sl.warehouse_name}</strong>
                      <span className="wh-muted">
                        Available: {sl.available_qty} · Total: {sl.total_qty}
                      </span>
                    </div>
                    <div className="wh-form-grid">
                      <FormField
                        id={`reserved_${sl.outlet_id ?? sl.warehouse_id}`}
                        label="Reserved quantity"
                        type="number"
                        min="0"
                        step="1"
                        value={sl.reserved_qty ?? 0}
                        onChange={(e) => setStockLevel(sl.outlet_id ?? sl.warehouse_id, "reserved_qty", e.target.value)}
                      />
                      <FormField
                        id={`damaged_${sl.outlet_id ?? sl.warehouse_id}`}
                        label="Damaged quantity"
                        type="number"
                        min="0"
                        step="1"
                        value={sl.damaged_qty ?? 0}
                        onChange={(e) => setStockLevel(sl.outlet_id ?? sl.warehouse_id, "damaged_qty", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FormBlock>
        )}

        {error && <p className="wh-field__error">{error}</p>}
        {message && <p className="wh-form-message">{message}</p>}

        <FormActions>
          <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/manage`)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save Product" : "Create Product"}
          </Button>
        </FormActions>
        </form>

        <CreateCategoryModal
        open={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        authFetch={authFetch}
        outlets={outlets}
        defaultOutletId={form.outlet_id}
        onCreated={async (category) => {
          await reload();
          if (category?.id) set("category_id", String(category.id));
        }}
      />
      </FormPageLayout>
    </div>
  );
}
