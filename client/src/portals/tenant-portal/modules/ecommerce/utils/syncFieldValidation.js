import { validatePhoneNumber, toShopifyPhone } from "../../../../../utils/phoneE164";

/**
 * Field-level validation for Shopify / Daraz pushes.
 * Returns a map of fieldKey → error message. Empty object = valid.
 */

export function syncValidationSummary(errors = {}) {
  const messages = Object.values(errors).filter(Boolean);
  if (!messages.length) return "";
  if (messages.length === 1) return messages[0];
  return `Complete ${messages.length} required fields before syncing to the store.`;
}

export function scrollToFirstFieldError() {
  requestAnimationFrame(() => {
    document
      .querySelector(".wh-field--error, .wh-save-dest--error, .wh-inv-price-input-wrap--error")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function trim(value) {
  return String(value ?? "").trim();
}

function hasPhoneOrEmail(phone, email) {
  return Boolean(trim(phone) || trim(email));
}

function applyPhoneFieldError(errors, phone, { required = false, forShopify = false } = {}) {
  const msg = validatePhoneNumber(phone, { required, forShopify });
  if (msg) errors.phone = msg;
  return errors;
}

/** ERP-only customer: name is enough; phone validated when provided. */
export function validateCustomerForErp({ form }) {
  const errors = {};
  if (!trim(form?.customer_name)) {
    errors.customer_name = "Customer name is required";
  }
  applyPhoneFieldError(errors, form?.phone, { required: false, forShopify: false });
  return errors;
}

/**
 * Shopify customer push needs contact + address so phone/company/address actually sync.
 */
export function validateCustomerForShopify({ form, addresses = [] }) {
  const errors = validateCustomerForErp({ form });
  // Re-run phone with Shopify-oriented message / required when no email.
  delete errors.phone;
  if (!hasPhoneOrEmail(form?.phone, form?.email)) {
    errors.phone = "Phone or email is required to sync to Shopify";
    errors.email = "Phone or email is required to sync to Shopify";
  } else if (trim(form?.phone)) {
    applyPhoneFieldError(errors, form.phone, { required: true, forShopify: true });
  }

  const filled = (addresses || []).filter((row) => trim(row.address));
  if (!filled.length) {
    errors.addresses = "Add a street address to sync to Shopify";
    const first = addresses?.[0];
    if (first?._key) {
      errors[`address_${first._key}`] = "Street address is required for Shopify";
    }
  } else {
    filled.forEach((row) => {
      if (!trim(row.city)) {
        errors[`city_${row._key}`] = "City is required for each address synced to Shopify";
      }
    });
  }

  return errors;
}

export { toShopifyPhone, validatePhoneNumber };

export function validateWarehouseForErp({ form }) {
  const errors = {};
  if (!trim(form?.warehouse_name)) {
    errors.warehouse_name = "Warehouse name is required";
  }
  return errors;
}

/** Shopify location needs name + address bits. */
export function validateWarehouseForShopify({ form }) {
  const errors = validateWarehouseForErp({ form });
  if (!trim(form?.location)) {
    errors.location = "Location / street address is required for Shopify";
  }
  if (!trim(form?.city)) {
    errors.city = "City is required for Shopify";
  }
  return errors;
}

export function validateOrderForErp({ items, warehouseId, isEdit }) {
  const errors = {};
  if (!warehouseId && !isEdit) {
    errors.warehouse_id = "Select a warehouse for line items";
  }
  if (!items?.length) {
    errors.items = "Add at least one product";
  } else {
    items.forEach((row, index) => {
      const label = `Item ${index + 1}`;
      if (!trim(row.product_name)) errors[`item_${index}_product_name`] = `${label}: product name is required`;
      if (!trim(row.sku)) errors[`item_${index}_sku`] = `${label}: SKU is required`;
      if (!Number(row.quantity) || Number(row.quantity) < 1) {
        errors[`item_${index}_quantity`] = `${label}: quantity must be at least 1`;
      }
      if (Number(row.unit_price) < 0) {
        errors[`item_${index}_unit_price`] = `${label}: unit price is invalid`;
      }
    });
  }
  return errors;
}

/**
 * Shopify order also creates/updates the customer — require contact + delivery address.
 */
export function validateOrderForShopify({
  form,
  customerForm,
  customerPhone,
  items,
  warehouseId,
  isEdit,
}) {
  const errors = validateOrderForErp({ items, warehouseId, isEdit });

  if (!trim(customerForm?.customer_name)) {
    errors.customer_name = "Customer name is required to sync to Shopify";
  }
  if (!hasPhoneOrEmail(customerPhone, customerForm?.email)) {
    errors.customer_phone = "Phone or email is required to sync to Shopify";
    errors.customer_email = "Phone or email is required to sync to Shopify";
  } else if (trim(customerPhone)) {
    const phoneMsg = validatePhoneNumber(customerPhone, { required: true, forShopify: true });
    if (phoneMsg) errors.customer_phone = phoneMsg;
  }
  if (!trim(form?.delivery_address)) {
    errors.delivery_address = "Delivery address is required for Shopify";
  }
  if (!trim(form?.city)) {
    errors.city = "City is required for Shopify";
  }

  return errors;
}

export function validateProductForShopifyOrErp({ form, options = [], variantRows = [] }) {
  const errors = {};
  if (!trim(form?.product_name)) errors.product_name = "Product name is required";
  if (!form?.category_id) errors.category_id = "Category is required";
  if (!variantRows.length) errors.variants = "At least one variant is required";

  for (const opt of options) {
    if (trim(opt.attribute_name) && !(opt.values || []).length) {
      errors.options = `Add at least one value for attribute "${opt.attribute_name}"`;
      break;
    }
  }

  const skus = new Set();
  for (let i = 0; i < variantRows.length; i++) {
    const v = variantRows[i];
    const key = v.combo_key || String(i);
    const label = v.variant_name || `Variant ${i + 1}`;
    if (!trim(v.sku)) {
      errors[`variant_${key}_sku`] = `SKU is required for ${label}`;
      errors.variants = errors.variants || `SKU is required for ${label}`;
    } else if (skus.has(trim(v.sku))) {
      errors[`variant_${key}_sku`] = `Duplicate SKU: ${v.sku}`;
      errors.variants = errors.variants || `Duplicate SKU: ${v.sku}`;
    } else {
      skus.add(trim(v.sku));
    }
    if (v.cost_price === "" || Number(v.cost_price) < 0) {
      errors[`variant_${key}_cost_price`] = `Valid cost price is required for ${label}`;
      errors.variants = errors.variants || `Valid cost price is required for ${label}`;
    }
    if (v.selling_price === "" || Number(v.selling_price) < 0) {
      errors[`variant_${key}_selling_price`] = `Valid selling price is required for ${label}`;
      errors.variants = errors.variants || `Valid selling price is required for ${label}`;
    }
  }

  return errors;
}

export function validateProductForDaraz({ form, daraz = {}, warehouseOptions = [], priceDecimals = 0 } = {}) {
  const errors = {};
  if (!trim(form?.product_name)) errors.product_name = "Product name is required";
  if (!trim(form?.description)) errors.description = "Description is required for Daraz";
  const brand = trim(daraz.brand) || "No Brand";
  if (!brand) errors.daraz_brand = "Brand is required for Daraz";
  if (!trim(daraz.seller_sku)) errors.daraz_seller_sku = "Seller SKU is required for Daraz";
  if (!form?.category_id) errors.category_id = "Category is required";
  if (daraz.price === "" || Number(daraz.price) < 0 || Number.isNaN(Number(daraz.price))) {
    errors.daraz_price = "Valid selling price is required for Daraz";
  } else {
    const price = Number(daraz.price);
    const decimals = Number.isFinite(Number(priceDecimals)) ? Number(priceDecimals) : 0;
    if (decimals === 0) {
      if (!Number.isInteger(price) && Math.round(price) !== price) {
        errors.daraz_price = "Use a whole-number price only (e.g. 1500) — no decimals";
      } else if (String(daraz.price).includes(".")) {
        errors.daraz_price = "Use a whole-number price only (e.g. 1500) — no decimals";
      }
    } else if (decimals > 0) {
      const factor = 10 ** decimals;
      if (Math.round(price * factor) / factor !== price) {
        errors.daraz_price = `Price may have at most ${decimals} decimal place${decimals === 1 ? "" : "s"} for Daraz`;
      }
    }
  }
  const pkg = daraz.package || {};
  if (!pkg.length || Number(pkg.length) <= 0) {
    errors.daraz_pkg_length = "Package length is required for Daraz";
  }
  if (!pkg.width || Number(pkg.width) <= 0) {
    errors.daraz_pkg_width = "Package width is required for Daraz";
  }
  if (!pkg.height || Number(pkg.height) <= 0) {
    errors.daraz_pkg_height = "Package height is required for Daraz";
  }
  if (!pkg.weight || Number(pkg.weight) <= 0) {
    errors.daraz_pkg_weight = "Package weight is required for Daraz";
  }
  // Warehouse is optional when the tenant has none yet; if options exist, prefer one selected.
  // Single-warehouse Daraz accounts do not need multi-warehouse mapping to create.
  if (warehouseOptions.length > 1 && !daraz.warehouse_id) {
    errors.daraz_warehouse_id = "Select the ERP warehouse that holds this stock";
  }
  return errors;
}
