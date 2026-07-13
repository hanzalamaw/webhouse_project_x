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

function extractMultiWarehouseInventories(sku) {
  const raw =
    sku?.multiWarehouseInventories
    || sku?.MultiWarehouseInventories?.MultiWarehouseInventory
    || sku?.multi_warehouse_inventories
    || [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((row) => ({
      locationId: String(row.WarehouseCode ?? row.warehouseCode ?? row.warehouse_code ?? row.code ?? "").trim(),
      available: Math.max(0, Math.floor(Number(row.SellableQuantity ?? row.Quantity ?? row.quantity ?? row.sellable_quantity ?? 0) || 0)),
    }))
    .filter((row) => row.locationId);
}

export function normalizeDarazWarehouse(warehouse) {
  const code = String(
    warehouse.code
    || warehouse.warehouse_code
    || warehouse.warehouseCode
    || warehouse.WarehouseCode
    || "",
  ).trim();
  const status = String(warehouse.status || warehouse.Status || "ACTIVE").toUpperCase();
  return {
    externalId: code,
    platform: "daraz",
    name: warehouse.name || warehouse.warehouseName || warehouse.warehouse_name || code || "Daraz warehouse",
    address: warehouse.detailAddress || warehouse.detail_address || warehouse.address || "",
    city: warehouse.city || warehouse.locationLevel3Label || "",
    province: warehouse.province || warehouse.locationLevel2Label || "",
    country: warehouse.country || warehouse.locationLevel1Label || "",
    zip: warehouse.post_code || warehouse.postalCode || "",
    active: status !== "INACTIVE" && status !== "DISABLED" && warehouse.active !== false,
    defaultAddress: Boolean(warehouse.defaultAddress ?? warehouse.default_address),
  };
}

export function normalizeDarazProduct(product) {
  const skusRaw = product.skus || product.Skus?.Sku || [];
  const skusList = Array.isArray(skusRaw) ? skusRaw : skusRaw ? [skusRaw] : [];
  const firstSku = skusList[0] || {};
  const inventoryLevels = extractMultiWarehouseInventories(firstSku);

  return {
    erpProductId: erpId("daraz", String(product.item_id || product.product_id)),
    externalId: String(product.item_id || product.product_id || ""),
    platform: "daraz",
    sku: firstSku.SellerSku || firstSku.seller_sku || product.seller_sku || product.shop_sku || String(product.item_id || ""),
    name: product.name || product.attributes?.name || "",
    description: product.attributes?.description || product.description || "",
    price: parseFloat(firstSku.price ?? product.price ?? product.special_price ?? 0),
    currency: "PKR",
    status: product.status || firstSku.Status || "unknown",
    stock: firstSku.quantity ?? product.quantity ?? product.available ?? null,
    inventoryLevels,
    primaryCategory: product.primary_category || product.PrimaryCategory || null,
    skus: skusList.map((sku) => ({
      skuId: String(sku.SkuId ?? sku.sku_id ?? "").trim() || null,
      sellerSku: String(sku.SellerSku ?? sku.seller_sku ?? "").trim(),
      price: parseFloat(sku.price ?? sku.Price ?? 0) || 0,
      quantity: Math.max(0, Math.floor(Number(sku.quantity ?? sku.Quantity ?? 0) || 0)),
      status: sku.Status || sku.status || null,
      inventoryLevels: extractMultiWarehouseInventories(sku),
    })),
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
