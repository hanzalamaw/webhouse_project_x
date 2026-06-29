function erpId(platform, externalId) {
  return `${platform}:${externalId}`;
}

export function normalizeDarazOrder(order) {
  const address = order.address_billing || order.address_shipping || {};

  return {
    erpOrderId: erpId("daraz", String(order.order_id || order.order_number)),
    externalId: String(order.order_id || order.order_number || ""),
    platform: "daraz",
    status: order.statuses?.[0] || order.status || "unknown",
    customer: {
      name: address.first_name
        ? [address.first_name, address.last_name].filter(Boolean).join(" ")
        : order.customer_first_name
          ? [order.customer_first_name, order.customer_last_name].filter(Boolean).join(" ")
          : "Unknown",
      email: address.customer_email || order.buyer_email || "",
      phone: address.phone || address.phone2 || order.buyer_phone || "",
    },
    items: (order.order_items || order.items || []).map((item) => ({
      sku: item.sku || item.shop_sku || item.seller_sku || String(item.order_item_id || ""),
      name: item.name || item.product_name || "",
      qty: item.quantity ?? item.qty ?? 1,
      unitPrice: parseFloat(item.item_price ?? item.paid_price ?? item.price ?? 0),
    })),
    total: parseFloat(order.price ?? order.total_amount ?? 0),
    currency: order.currency || "PKR",
    createdAt: order.created_at || order.create_time || null,
  };
}

export function normalizeDarazProduct(product) {
  return {
    erpProductId: erpId("daraz", String(product.item_id || product.product_id)),
    externalId: String(product.item_id || product.product_id || ""),
    platform: "daraz",
    sku: product.seller_sku || product.shop_sku || String(product.item_id || ""),
    name: product.name || product.attributes?.name || "",
    price: parseFloat(product.price ?? product.special_price ?? 0),
    currency: "PKR",
    status: product.status || "unknown",
    stock: product.quantity ?? product.available ?? null,
    createdAt: product.created_time || product.create_time || null,
  };
}

export function normalizeDarazCustomer(buyer) {
  return {
    erpCustomerId: erpId("daraz", String(buyer.buyer_id || buyer.customer_id || buyer.id)),
    externalId: String(buyer.buyer_id || buyer.customer_id || buyer.id || ""),
    platform: "daraz",
    name: buyer.name || buyer.buyer_name || buyer.first_name || "Unknown",
    email: buyer.email || buyer.buyer_email || "",
    phone: buyer.phone || buyer.phone_number || "",
    ordersCount: buyer.order_count ?? null,
    totalSpent: null,
    createdAt: buyer.created_at || null,
  };
}
