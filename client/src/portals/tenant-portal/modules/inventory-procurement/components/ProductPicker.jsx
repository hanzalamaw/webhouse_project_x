import VariantPicker from "../../shared/inventory/VariantPicker";

/** Variant-level picker; accepts `variants` from reference API or legacy `products`. */
export default function ProductPicker({ products, variants, ...rest }) {
  const list =
    variants?.length > 0
      ? variants
      : (products || []).map((p) => ({
          id: p.id,
          product_name: p.product_name,
          variant_name: p.product_name,
          sku: p.skus || p.sku || "—",
          category_name: p.category_name,
        }));
  return <VariantPicker variants={list} {...rest} />;
}
