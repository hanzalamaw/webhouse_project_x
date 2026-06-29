import { useEffect, useState } from "react";
import { apiFetch } from "../../../../../api/client";
import { Modal } from "../../../../../components/Modal";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";
import { SearchableSelect } from "../../../../../components/SearchableSelect";
import { PRODUCT_STATUS } from "../constants";
import ProductPicker from "./ProductPicker";

const EMPTY_FORM = { category_name: "", status: "active", outlet_id: "", product_ids: [] };

export default function CreateCategoryModal({
  open,
  onClose,
  authFetch,
  onCreated,
  products = [],
  outlets = [],
  defaultOutletId = "",
  showProductPicker = false,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const outletOptions = outlets.map((o) => ({ value: String(o.id), label: o.outlet_name }));
  const storeProducts = products.filter((p) => !form.outlet_id || String(p.outlet_id) === String(form.outlet_id));

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM, outlet_id: defaultOutletId ? String(defaultOutletId) : "" });
    setProductSearch("");
    setProductCategoryFilter("");
    setError("");
  }, [open, defaultOutletId]);

  const toggleProduct = (id) => {
    const sid = String(id);
    setForm((f) => ({
      ...f,
      product_ids: f.product_ids.includes(sid)
        ? f.product_ids.filter((x) => x !== sid)
        : [...f.product_ids, sid],
    }));
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.category_name.trim()) {
      setError("Category name is required");
      return;
    }
    if (!form.outlet_id) {
      setError("Store is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch(
        "/pos/inventory/categories",
        {
          method: "POST",
          body: JSON.stringify({
            category_name: form.category_name.trim(),
            status: form.status,
            outlet_id: Number(form.outlet_id),
            product_ids: form.product_ids.map(Number),
          }),
        },
        authFetch
      );
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Create category" onClose={handleClose} wide className="wh-modal--category">
      <form onSubmit={handleSubmit} className="wh-form">
        <div className="wh-form-grid">
          <SearchableSelect
            id="cat_outlet"
            label="Store"
            options={outletOptions}
            value={form.outlet_id}
            onChange={(v) => setForm((f) => ({ ...f, outlet_id: v, product_ids: [] }))}
            placeholder="Select store…"
          />
          <FormField
            id="cat_name"
            label="Category name"
            value={form.category_name}
            onChange={(e) => setForm((f) => ({ ...f, category_name: e.target.value }))}
            required
            autoFocus
          />
          <FormField
            id="cat_status"
            label="Status"
            as="select"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {PRODUCT_STATUS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormField>
        </div>
        {showProductPicker && storeProducts.length > 0 && (
          <ProductPicker
            products={storeProducts}
            selectedIds={form.product_ids}
            onToggle={toggleProduct}
            search={productSearch}
            onSearchChange={setProductSearch}
            categoryFilter={productCategoryFilter}
            onCategoryFilterChange={setProductCategoryFilter}
            showCategoryFilter
            showWarning
            showCategoryTag
            description="Assign products (optional). Products already in another category will be moved."
          />
        )}
        {error && <p className="wh-field__error">{error}</p>}
        <div className="wh-modal__actions">
          <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create Category"}</Button>
        </div>
      </form>
    </Modal>
  );
}
