/** Product-level PKR amounts from inventory (per unit for discount/tax, per line for delivery). */

export function productDeliveryTotal(items) {
  return items.reduce((sum, row) => sum + (Number(row.product_delivery) || 0), 0);
}

export function productTaxTotal(items) {
  return items.reduce(
    (sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.product_tax) || 0),
    0
  );
}

export function lineDiscountForQty(qty, productDiscountPerUnit) {
  return (Number(qty) || 0) * (Number(productDiscountPerUnit) || 0);
}

export function lineTaxForQty(qty, productTaxPerUnit) {
  return (Number(qty) || 0) * (Number(productTaxPerUnit) || 0);
}

export function calcLineTotal(row) {
  const qty = Number(row.quantity) || 0;
  const price = Number(row.unit_price) || 0;
  const discount = Number(row.discount) || 0;
  const tax = lineTaxForQty(qty, row.product_tax);
  return Math.max(0, qty * price - discount + tax);
}

export function buildLineItemFromProduct(product) {
  const productDiscount = Number(product.discount) || 0;
  const productTax = Number(product.tax) || 0;
  const productDelivery = Number(product.delivery_charges) || 0;
  const qty = 1;

  return {
    _key: `item-${product.product_id}-${product.variant_id}`,
    product_id: String(product.product_id),
    variant_id: String(product.variant_id),
    product_name: product.product_name,
    sku: product.sku,
    quantity: String(qty),
    unit_price: String(product.selling_price ?? ""),
    product_discount: String(productDiscount),
    product_tax: String(productTax),
    product_delivery: String(productDelivery),
    discount: String(lineDiscountForQty(qty, productDiscount)),
    available_qty: Number(product.available_qty ?? 0),
  };
}

export function mapOrderItemFromApi(item) {
  const productDiscount = Number(item.product_discount_unit ?? item.product_discount ?? 0);
  const productTax = Number(item.product_tax_unit ?? item.product_tax ?? 0);
  const qty = Number(item.quantity) || 1;

  return {
    _key: `item-${item.id}`,
    product_id: item.product_id ? String(item.product_id) : "",
    variant_id: item.variant_id ? String(item.variant_id) : "",
    product_name: item.product_name || "",
    sku: item.sku || "",
    quantity: String(item.quantity ?? 1),
    unit_price: String(item.unit_price ?? ""),
    product_discount: String(productDiscount),
    product_tax: String(productTax),
    product_delivery: String(Number(item.product_delivery) || 0),
    discount: String(item.discount ?? lineDiscountForQty(qty, productDiscount)),
    available_qty: null,
  };
}
