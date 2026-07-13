import { FormBlock } from "../../../../../components/FormBlock";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";
import { SearchableSelect } from "../../../../../components/SearchableSelect";

/**
 * Daraz-specific listing fields for create product.
 * Uses ERP category only — Daraz PrimaryCategory is resolved on the server when pushing.
 */
export function DarazProductFormFields({
  daraz,
  onChange,
  erpCategoryOptions = [],
  erpCategoryId = "",
  onErpCategoryChange,
  onCreateErpCategory,
  warehouseOptions = [],
  disabled = false,
  refLoading = false,
  fieldErrors = {},
}) {
  const set = (key, value) => onChange({ ...daraz, [key]: value });
  const setPackage = (key, value) =>
    onChange({ ...daraz, package: { ...(daraz.package || {}), [key]: value } });

  return (
    <>
      <FormBlock
        title="Daraz listing"
        description="Marketplace fields for Daraz. Category uses your ERP category; Daraz maps it when syncing."
      >
        <div className="wh-form-grid">
          <FormField
            id="daraz_brand"
            label="Brand"
            value={daraz.brand || ""}
            onChange={(e) => set("brand", e.target.value)}
            placeholder="e.g. No Brand / Nike"
            disabled={disabled}
            required
            error={fieldErrors.daraz_brand}
          />
          <FormField
            id="daraz_seller_sku"
            label="Seller SKU"
            value={daraz.seller_sku || ""}
            onChange={(e) => set("seller_sku", e.target.value)}
            placeholder="Unique SKU on Daraz"
            disabled={disabled}
            required
            hint="Used as the Daraz SellerSku for this listing."
            error={fieldErrors.daraz_seller_sku}
          />
          <div className="wh-form-grid__full">
            <FormField
              id="daraz_short_description"
              label="Short description"
              as="textarea"
              rows={2}
              value={daraz.short_description || ""}
              onChange={(e) => set("short_description", e.target.value)}
              placeholder="Brief summary shown on Daraz (max ~250 chars)"
              disabled={disabled}
              hint={`${String(daraz.short_description || "").length}/250`}
            />
          </div>
        </div>
      </FormBlock>

      <FormBlock
        title="Package dimensions"
        description="Required by Daraz for shipping. Units: cm and kg."
      >
        <div className="wh-form-grid wh-daraz-package-grid">
          <FormField
            id="daraz_pkg_length"
            label="Length (cm)"
            type="number"
            min="0.1"
            step="0.1"
            value={daraz.package?.length ?? "10"}
            onChange={(e) => setPackage("length", e.target.value)}
            disabled={disabled}
            required
            error={fieldErrors.daraz_pkg_length}
          />
          <FormField
            id="daraz_pkg_width"
            label="Width (cm)"
            type="number"
            min="0.1"
            step="0.1"
            value={daraz.package?.width ?? "10"}
            onChange={(e) => setPackage("width", e.target.value)}
            disabled={disabled}
            required
            error={fieldErrors.daraz_pkg_width}
          />
          <FormField
            id="daraz_pkg_height"
            label="Height (cm)"
            type="number"
            min="0.1"
            step="0.1"
            value={daraz.package?.height ?? "10"}
            onChange={(e) => setPackage("height", e.target.value)}
            disabled={disabled}
            required
            error={fieldErrors.daraz_pkg_height}
          />
          <FormField
            id="daraz_pkg_weight"
            label="Weight (kg)"
            type="number"
            min="0.01"
            step="0.01"
            value={daraz.package?.weight ?? "0.5"}
            onChange={(e) => setPackage("weight", e.target.value)}
            disabled={disabled}
            required
            error={fieldErrors.daraz_pkg_weight}
          />
        </div>
      </FormBlock>

      <FormBlock
        title="Category & stock"
        description="Your ERP category, warehouse, and pricing — pushed to Daraz on save."
      >
        {refLoading ? (
          <p className="wh-muted">Loading categories…</p>
        ) : (
          <div className={erpCategoryOptions.length === 0 ? "wh-form-grid" : "wh-form-grid wh-form-grid--field-action"}>
            {erpCategoryOptions.length === 0 ? (
              <p className="wh-field__error wh-form-grid__full">No categories yet. Create one to continue.</p>
            ) : (
              <SearchableSelect
                id="category_id_daraz"
                label="Category"
                options={erpCategoryOptions}
                value={erpCategoryId}
                onChange={onErpCategoryChange}
                placeholder="Search categories…"
                disabled={disabled}
                error={fieldErrors.category_id}
              />
            )}
            <div className={erpCategoryOptions.length === 0 ? "wh-form-grid__actions" : "wh-form-grid--field-action__btn"}>
              <Button type="button" variant="secondary" onClick={onCreateErpCategory} disabled={disabled}>
                New category
              </Button>
            </div>
          </div>
        )}

        <div className="wh-form-grid" style={{ marginTop: "1rem" }}>
          <SearchableSelect
            id="daraz_warehouse_id"
            label="Warehouse"
            options={warehouseOptions}
            value={daraz.warehouse_id || ""}
            onChange={(v) => set("warehouse_id", v)}
            placeholder="Select warehouse…"
            disabled={disabled || !warehouseOptions.length}
            error={fieldErrors.daraz_warehouse_id}
          />
          <FormField
            id="daraz_quantity"
            label="Sellable quantity"
            type="number"
            min="0"
            step="1"
            value={daraz.quantity ?? "0"}
            onChange={(e) => set("quantity", e.target.value)}
            disabled={disabled}
            hint="Opening stock pushed to Daraz and ERP."
          />
          <FormField
            id="daraz_price"
            label="Selling price (PKR)"
            type="number"
            min="0"
            step="0.01"
            value={daraz.price ?? ""}
            onChange={(e) => set("price", e.target.value)}
            disabled={disabled}
            required
            error={fieldErrors.daraz_price}
          />
          <FormField
            id="daraz_cost"
            label="Cost price (PKR)"
            type="number"
            min="0"
            step="0.01"
            value={daraz.cost_price ?? ""}
            onChange={(e) => set("cost_price", e.target.value)}
            disabled={disabled}
          />
        </div>
      </FormBlock>
    </>
  );
}

export const EMPTY_DARAZ_FIELDS = {
  brand: "",
  seller_sku: "",
  short_description: "",
  quantity: "0",
  price: "",
  cost_price: "",
  warehouse_id: "",
  package: {
    length: "10",
    width: "10",
    height: "10",
    weight: "0.5",
  },
};
