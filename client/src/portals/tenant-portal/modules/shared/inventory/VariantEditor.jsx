import { useRef, useCallback } from "react";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";
import { formatTotalPrice } from "../../inventory-procurement/utils/pricing";

function emptyAttribute(key) {
  return { _key: key, attribute_name: "", value: "" };
}

function emptyVariant(key, productName = "") {
  return {
    _key: key,
    id: null,
    sku: "",
    variant_name: productName || "Default",
    cost_price: "",
    selling_price: "",
    status: "active",
    attributes: [],
    warehouse_stocks: [],
    stock_levels: [],
  };
}

export function makeDefaultVariants(productName = "") {
  return [emptyVariant("v-1", productName)];
}

export function mapVariantsFromApi(variants = []) {
  return variants.map((v, i) => ({
    _key: `v-${v.id || i}`,
    id: v.id,
    sku: v.sku || "",
    variant_name: v.variant_name || "",
    cost_price: v.cost_price ?? "",
    selling_price: v.selling_price ?? "",
    status: v.status || "active",
    attributes: (v.attributes || []).map((a, j) => ({
      _key: `a-${j}`,
      attribute_name: a.attribute_name || a.name || "",
      value: a.value || "",
    })),
    stock_levels: v.stock_levels || [],
    warehouse_stocks: [],
  }));
}

export default function VariantEditor({
  variants,
  onChange,
  productName = "",
  statusOptions = ["active", "inactive"],
  isEdit = false,
  warehouseOptions = [],
  showWarehouseStock = false,
}) {
  const attrKeyRef = useRef(0);
  const whKeyRef = useRef(0);

  const updateVariant = (key, field, value) => {
    onChange(variants.map((v) => (v._key === key ? { ...v, [field]: value } : v)));
  };

  const addVariant = () => {
    const key = `v-new-${Date.now()}`;
    onChange([...variants, emptyVariant(key, productName)]);
  };

  const removeVariant = (key) => {
    if (variants.length <= 1) return;
    onChange(variants.filter((v) => v._key !== key));
  };

  const addAttribute = (variantKey) => {
    attrKeyRef.current += 1;
    onChange(
      variants.map((v) =>
        v._key === variantKey
          ? { ...v, attributes: [...v.attributes, emptyAttribute(`a-${attrKeyRef.current}`)] }
          : v
      )
    );
  };

  const updateAttribute = (variantKey, attrKey, field, value) => {
    onChange(
      variants.map((v) =>
        v._key === variantKey
          ? {
              ...v,
              attributes: v.attributes.map((a) =>
                a._key === attrKey ? { ...a, [field]: value } : a
              ),
            }
          : v
      )
    );
  };

  const removeAttribute = (variantKey, attrKey) => {
    onChange(
      variants.map((v) =>
        v._key === variantKey
          ? { ...v, attributes: v.attributes.filter((a) => a._key !== attrKey) }
          : v
      )
    );
  };

  const addWarehouseStock = useCallback((variantKey) => {
    whKeyRef.current += 1;
    const whKey = `wh-${whKeyRef.current}`;
    onChange(
      variants.map((v) =>
        v._key === variantKey
          ? {
              ...v,
              warehouse_stocks: [
                ...v.warehouse_stocks,
                {
                  _key: whKey,
                  warehouse_id: "",
                  initial_qty: "0",
                  reserved_qty: "0",
                  damaged_qty: "0",
                  stock_notes: "",
                },
              ],
            }
          : v
      )
    );
  }, [variants, onChange]);

  const updateWarehouseStock = (variantKey, whKey, field, value) => {
    onChange(
      variants.map((v) =>
        v._key === variantKey
          ? {
              ...v,
              warehouse_stocks: v.warehouse_stocks.map((row) =>
                row._key === whKey ? { ...row, [field]: value } : row
              ),
            }
          : v
      )
    );
  };

  const setStockLevel = (variantKey, warehouseId, field, value) => {
    onChange(
      variants.map((v) =>
        v._key === variantKey
          ? {
              ...v,
              stock_levels: v.stock_levels.map((sl) =>
                String(sl.warehouse_id) === String(warehouseId) ? { ...sl, [field]: value } : sl
              ),
            }
          : v
      )
    );
  };

  return (
    <div className="wh-inv-line-items">
      {variants.map((variant, index) => (
        <div key={variant._key} className="wh-inv-line-item">
          <div className="wh-inv-line-item__head">
            <strong>Variant {index + 1}{variant.id ? ` (#${variant.id})` : ""}</strong>
            {variants.length > 1 && (
              <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => removeVariant(variant._key)}>
                Remove variant
              </Button>
            )}
          </div>
          <div className="wh-form-grid">
            <FormField
              id={`sku_${variant._key}`}
              label="SKU"
              value={variant.sku}
              onChange={(e) => updateVariant(variant._key, "sku", e.target.value)}
              required
            />
            <FormField
              id={`variant_name_${variant._key}`}
              label="Variant name"
              value={variant.variant_name}
              onChange={(e) => updateVariant(variant._key, "variant_name", e.target.value)}
              placeholder="e.g. Red / Medium"
              required
            />
            <FormField
              id={`cost_${variant._key}`}
              label="Cost price (PKR)"
              type="number"
              min="0"
              step="0.01"
              value={variant.cost_price}
              onChange={(e) => updateVariant(variant._key, "cost_price", e.target.value)}
              required
            />
            <FormField
              id={`sell_${variant._key}`}
              label="Selling price (PKR)"
              type="number"
              min="0"
              step="0.01"
              value={variant.selling_price}
              onChange={(e) => updateVariant(variant._key, "selling_price", e.target.value)}
              required
            />
            <FormField
              id={`vstatus_${variant._key}`}
              label="Status"
              as="select"
              value={variant.status}
              onChange={(e) => updateVariant(variant._key, "status", e.target.value)}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FormField>
            <FormField
              id={`total_${variant._key}`}
              label="Line total (PKR)"
              value={formatTotalPrice(variant.selling_price, 0, 0)}
              displayOnly
            />
          </div>

          <div className="wh-inv-variant-attrs">
            <div className="wh-inv-line-item__head">
              <span className="wh-muted">Attributes (optional)</span>
              <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => addAttribute(variant._key)}>
                Add attribute
              </Button>
            </div>
            {variant.attributes.length === 0 ? (
              <p className="wh-muted wh-inv-picker-empty">No attributes — e.g. Color, Size</p>
            ) : (
              variant.attributes.map((attr) => (
                <div key={attr._key} className="wh-form-grid wh-form-grid--field-action">
                  <FormField
                    id={`attr_name_${attr._key}`}
                    label="Attribute"
                    value={attr.attribute_name}
                    onChange={(e) => updateAttribute(variant._key, attr._key, "attribute_name", e.target.value)}
                    placeholder="Color"
                  />
                  <FormField
                    id={`attr_val_${attr._key}`}
                    label="Value"
                    value={attr.value}
                    onChange={(e) => updateAttribute(variant._key, attr._key, "value", e.target.value)}
                    placeholder="Red"
                  />
                  <div className="wh-form-grid--field-action__btn">
                    <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => removeAttribute(variant._key, attr._key)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {showWarehouseStock && !isEdit && warehouseOptions.length > 0 && (
            <div className="wh-inv-variant-stock">
              <div className="wh-inv-line-item__head">
                <span className="wh-muted">Initial stock (optional)</span>
                <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => addWarehouseStock(variant._key)}>
                  Add warehouse
                </Button>
              </div>
              {variant.warehouse_stocks.map((row) => (
                <div key={row._key} className="wh-form-grid">
                  <FormField id={`wh_${row._key}`} label="Warehouse" as="select" value={row.warehouse_id} onChange={(e) => updateWarehouseStock(variant._key, row._key, "warehouse_id", e.target.value)}>
                    <option value="">Select…</option>
                    {warehouseOptions.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </FormField>
                  <FormField id={`iq_${row._key}`} label="Available" type="number" min="0" value={row.initial_qty} onChange={(e) => updateWarehouseStock(variant._key, row._key, "initial_qty", e.target.value)} />
                  <FormField id={`rq_${row._key}`} label="Reserved" type="number" min="0" value={row.reserved_qty} onChange={(e) => updateWarehouseStock(variant._key, row._key, "reserved_qty", e.target.value)} />
                  <FormField id={`dq_${row._key}`} label="Damaged" type="number" min="0" value={row.damaged_qty} onChange={(e) => updateWarehouseStock(variant._key, row._key, "damaged_qty", e.target.value)} />
                </div>
              ))}
            </div>
          )}

          {isEdit && variant.stock_levels?.length > 0 && (
            <div className="wh-inv-variant-stock">
              <p className="wh-muted">Stock by warehouse (reserved / damaged editable)</p>
              {variant.stock_levels.map((sl) => (
                <div key={sl.warehouse_id} className="wh-form-grid">
                  <FormField id={`whn_${sl.warehouse_id}`} label="Warehouse" value={sl.warehouse_name} displayOnly />
                  <FormField id={`av_${sl.warehouse_id}`} label="Available" value={sl.available_qty} displayOnly />
                  <FormField id={`rs_${sl.warehouse_id}`} label="Reserved" type="number" min="0" value={sl.reserved_qty ?? 0} onChange={(e) => setStockLevel(variant._key, sl.warehouse_id, "reserved_qty", e.target.value)} />
                  <FormField id={`dm_${sl.warehouse_id}`} label="Damaged" type="number" min="0" value={sl.damaged_qty ?? 0} onChange={(e) => setStockLevel(variant._key, sl.warehouse_id, "damaged_qty", e.target.value)} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={addVariant}>
        Add variant
      </Button>
    </div>
  );
}
