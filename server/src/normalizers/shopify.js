function erpId(platform, externalId) {
  return `${platform}:${externalId}`;
}

export function normalizeShopifyOrder(order) {
  const customer = order.customer || {};
  const billing = order.billing_address || {};
  const shipping = order.shipping_address || {};

  return {
    erpOrderId: erpId("shopify", String(order.id)),
    externalId: String(order.id),
    platform: "shopify",
    status: order.financial_status || order.fulfillment_status || order.status || "unknown",
    customer: {
      name:
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        [billing.first_name, billing.last_name].filter(Boolean).join(" ") ||
        [shipping.first_name, shipping.last_name].filter(Boolean).join(" ") ||
        order.email ||
        "Unknown",
      email: order.email || customer.email || billing.email || "",
      phone: order.phone || customer.phone || billing.phone || shipping.phone || "",
    },
    items: (order.line_items || []).map((item) => ({
      sku: item.sku || String(item.variant_id || item.product_id || ""),
      name: item.name || item.title || "",
      qty: item.quantity ?? 0,
      unitPrice: parseFloat(item.price ?? 0),
    })),
    total: parseFloat(order.total_price ?? 0),
    currency: order.currency || "USD",
    createdAt: order.created_at || null,
  };
}

export function normalizeShopifyProduct(product) {
  const variant = product.variants?.[0] || {};
  return {
    erpProductId: erpId("shopify", String(product.id)),
    externalId: String(product.id),
    platform: "shopify",
    sku: variant.sku || String(variant.id || product.id),
    name: product.title || "",
    price: parseFloat(variant.price ?? 0),
    currency: "USD",
    status: product.status || "unknown",
    stock: variant.inventory_quantity ?? null,
    createdAt: product.created_at || null,
  };
}

export function normalizeShopifyCustomer(customer) {
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
    ordersCount: customer.orders_count ?? 0,
    totalSpent: parseFloat(customer.total_spent ?? 0),
    createdAt: customer.created_at || null,
  };
}
