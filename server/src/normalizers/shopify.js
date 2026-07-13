function erpId(platform, externalId) {
  return `${platform}:${externalId}`;
}

function mapShopifyAddress(addr, isDefault = false) {
  if (!addr) return null;
  const line = [addr.address1, addr.address2].filter(Boolean).join(", ");
  if (!line && !addr.city) return null;
  return {
    address_type: isDefault ? "default" : "other",
    address: line,
    city: addr.city || "",
    state: addr.province || "",
    postal_code: addr.zip || "",
    country: addr.country || addr.country_name || "",
    is_default: isDefault,
  };
}

function normalizeShopifyLineItems(order) {
  const refundedByLineItemId = new Map();
  for (const refund of order.refunds || []) {
    for (const rli of refund.refund_line_items || []) {
      const id = String(rli.line_item_id ?? "");
      if (!id) continue;
      refundedByLineItemId.set(id, (refundedByLineItemId.get(id) || 0) + (Number(rli.quantity) || 0));
    }
  }

  return (order.line_items || [])
    .map((item) => {
      // Prefer current_quantity (post order-edit). Removed lines stay in the payload with qty 0.
      let qty;
      if (item.current_quantity != null && item.current_quantity !== "") {
        qty = Math.max(0, Math.floor(Number(item.current_quantity) || 0));
      } else {
        const original = Math.max(0, Math.floor(Number(item.quantity) || 0));
        const refunded = refundedByLineItemId.get(String(item.id)) || 0;
        qty = Math.max(0, original - refunded);
      }
      return {
        externalId: item.id != null ? String(item.id) : null,
        sku: item.sku || String(item.variant_id || item.product_id || ""),
        name: item.name || item.title || "",
        qty,
        unitPrice: parseFloat(item.price ?? 0),
      };
    })
    .filter((item) => item.qty > 0);
}

export function normalizeShopifyOrder(order) {
  const customer = order.customer || {};
  const billing = order.billing_address || {};
  const shipping = order.shipping_address || {};

  const refunds = (order.refunds || []).map((refund) => {
    const txAmount = (refund.transactions || []).reduce(
      (sum, tx) => sum + Math.abs(parseFloat(tx.amount ?? 0)),
      0,
    );
    return {
      externalId: String(refund.id),
      amount: txAmount || parseFloat(refund.amount ?? 0) || 0,
      createdAt: refund.created_at || null,
      note: refund.note || "",
    };
  });

  const transactions = (order.transactions || []).map((tx) => ({
    externalId: String(tx.id),
    amount: parseFloat(tx.amount ?? 0),
    kind: tx.kind || "",
    status: tx.status || "",
    gateway: tx.gateway || "",
    createdAt: tx.created_at || null,
  }));

  return {
    erpOrderId: erpId("shopify", String(order.id)),
    externalId: String(order.id),
    platform: "shopify",
    status: order.financial_status || order.fulfillment_status || order.status || "unknown",
    financialStatus: order.financial_status || null,
    fulfillmentStatus: order.fulfillment_status || null,
    cancelledAt: order.cancelled_at || null,
    closedAt: order.closed_at || null,
    cancelReason: order.cancel_reason || null,
    refunds,
    transactions,
    customer: {
      externalId: customer.id != null ? String(customer.id) : null,
      name:
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        [billing.first_name, billing.last_name].filter(Boolean).join(" ") ||
        [shipping.first_name, shipping.last_name].filter(Boolean).join(" ") ||
        order.email ||
        "Unknown",
      email: order.email || customer.email || billing.email || "",
      phone: order.phone || customer.phone || billing.phone || shipping.phone || "",
    },
    items: normalizeShopifyLineItems(order),
    total: parseFloat(order.current_total_price ?? order.total_price ?? 0),
    currency: order.currency || "USD",
    createdAt: order.created_at || null,
    city: shipping.city || billing.city || "",
    deliveryAddress: [shipping.address1, shipping.address2].filter(Boolean).join(", ") || billing.address1 || "",
    state: shipping.province || billing.province || "",
    postalCode: shipping.zip || billing.zip || "",
    country: shipping.country || billing.country || shipping.country_code || billing.country_code || "",
    tags: order.tags || "",
    note: order.note || "",
  };
}

function shopifyOptionNames(product) {
  return (product.options || []).map((o) => String(o?.name || "").trim());
}

function shopifyVariantAttributes(variant, optionNames = []) {
  const attributes = [];
  for (let i = 0; i < 3; i++) {
    const value = variant[`option${i + 1}`];
    if (!value) continue;
    const name = optionNames[i] || `Option ${i + 1}`;
    if (String(name).toLowerCase() === "title") continue;
    attributes.push({ attribute_name: name, value: String(value) });
  }
  return attributes;
}

export function normalizeShopifyProduct(product) {
  const optionNames = shopifyOptionNames(product);
  const options = (product.options || [])
    .map((o) => ({
      attribute_name: String(o?.name || "").trim(),
      values: [...new Set((o?.values || []).map((v) => String(v).trim()).filter(Boolean))],
    }))
    .filter((o) => o.attribute_name && o.attribute_name.toLowerCase() !== "title" && o.values.length);

  const variants = (product.variants || []).map((v) => {
    const attributes = shopifyVariantAttributes(v, optionNames);
    const variantName = attributes.length
      ? attributes.map((a) => a.value).join(" / ")
      : (v.title || product.title || "Default");
    return {
      externalId: String(v.id),
      sku: String(v.sku || "").trim() || `shopify:${v.id}`,
      variant_name: variantName,
      price: parseFloat(v.price ?? 0),
      compareAtPrice:
        v.compare_at_price != null && v.compare_at_price !== ""
          ? parseFloat(v.compare_at_price)
          : null,
      stock: v.inventory_quantity ?? null,
      inventoryItemId: v.inventory_item_id != null ? String(v.inventory_item_id) : null,
      attributes,
    };
  });

  const first = variants[0] || {};
  return {
    erpProductId: erpId("shopify", String(product.id)),
    externalId: String(product.id),
    platform: "shopify",
    sku: first.sku || String(first.externalId || product.id),
    name: product.title || "",
    description: product.body_html || "",
    options,
    variants,
    price: first.price ?? 0,
    currency: "USD",
    status: product.status || "unknown",
    stock: first.stock ?? null,
    inventoryItemId: first.inventoryItemId ?? null,
    createdAt: product.created_at || null,
  };
}

export function normalizeShopifyCustomer(customer) {
  const addresses = [];
  const defaultAddr = customer.default_address || null;
  const mappedDefault = mapShopifyAddress(defaultAddr, true);
  if (mappedDefault) addresses.push(mappedDefault);
  for (const addr of customer.addresses || []) {
    if (defaultAddr?.id != null && addr.id === defaultAddr.id) continue;
    const mapped = mapShopifyAddress(addr, false);
    if (mapped) addresses.push(mapped);
  }

  return {
    erpCustomerId: erpId("shopify", String(customer.id)),
    externalId: String(customer.id),
    platform: "shopify",
    name:
      [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
      customer.email ||
      "Unknown",
    email: customer.email || "",
    phone: customer.phone || "",
    company_name: defaultAddr?.company || customer.company || "",
    note: customer.note || "",
    tags: customer.tags || "",
    addresses,
    ordersCount: customer.orders_count ?? 0,
    totalSpent: parseFloat(customer.total_spent ?? 0),
    createdAt: customer.created_at || null,
  };
}

export function normalizeShopifyLocation(location) {
  const address = [location.address1, location.address2].filter(Boolean).join(", ");
  return {
    externalId: String(location.id),
    platform: "shopify",
    name: location.name || `Location ${location.id}`,
    address,
    city: location.city || "",
    province: location.province || "",
    country: location.country_name || location.country || "",
    zip: location.zip || "",
    phone: location.phone || "",
    active: location.active !== false,
    legacy: Boolean(location.legacy),
  };
}
