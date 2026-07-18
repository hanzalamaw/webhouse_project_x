import {
  getEntityLink,
  getEntityLinkByInternalId,
  getStoreById,
  getStoreByPlatform,
  getWarehouseLocationLink,
  getSyncedRecords,
  getSyncedRecordByExternalId,
  listLocationLinks,
  upsertEntityLink,
  upsertSyncedRecord,
  softDeleteEntityLinkByInternalId,
  upsertLocationLink,
  schedulePendingShopifyDelete,
} from "../../repositories/ecommerceRepository.js";
import { orderRepository } from "../../repositories/orderRepository.js";
import { crmRepository } from "../../repositories/crmRepository.js";
import { inventoryRepository } from "../../repositories/inventoryRepository.js";
import { normalizeShopifyProduct } from "../../normalizers/shopify.js";
import { shopifyClient } from "./shopifyClient.js";
import {
  pushCustomerToShopify,
  pushProductToShopify,
  pushOrderToShopify,
  pushInventoryLevel,
  pushInventoryLevelAdjust,
  logPushResult,
  createCustomerInShopify,
  createProductInShopify,
  createOrderInShopify,
  createLocationInShopify,
  pushLocationToShopify,
  markCustomerPendingDeleteInShopify,
  markOrderPendingDeleteInShopify,
  markProductPendingDeleteInShopify,
  deactivateLocationInShopify,
  deleteLocationFromShopify,
  recordPaymentInShopify,
  createRefundInShopify,
  pushReturnNoteToShopify,
  pushExchangeNoteToShopify,
  resolveShopifyVariantIdForItem,
} from "./shopifyWrite.js";
import {
  createProductInDaraz,
  pushProductToDaraz,
  pushProductPriceQuantityToDaraz,
  deactivateProductInDaraz,
  fetchDarazProductRaw,
  logDarazPushResult,
  extractDarazSkus,
  extractDarazPrimaryCategory,
  matchDarazSkusToErpVariants,
  totalAvailableQty,
} from "./darazWrite.js";
import {
  SHOPIFY_HARD_DELETE_DELAY_MS,
  shopifyHardDeleteDelayLabel,
  shopifyPendingDeleteNote,
} from "../../utils/shopifyDeferredDelete.js";
import { darazPendingDeleteNote } from "../../utils/marketplaceDeferredDelete.js";

function mysqlDateTimeFromMs(msFromNow) {
  return new Date(Date.now() + msFromNow).toISOString().slice(0, 19).replace("T", " ");
}

function logDeferredDeleteScheduled(entityType, internalId, externalId, platform = "shopify") {
  console.log(
    `[${platform}-deferred-delete] delete request made for ${entityType}:${internalId} `
    + `(${platform}:${externalId}) — will delete after ${shopifyHardDeleteDelayLabel()}`,
  );
}

async function scheduleMarketplaceHardDelete({
  tenantId,
  store,
  entityType,
  externalId,
  internalId,
  phase1Action,
  note,
  platform = "shopify",
}) {
  const deleteAfter = mysqlDateTimeFromMs(SHOPIFY_HARD_DELETE_DELAY_MS);
  await schedulePendingShopifyDelete({
    tenantId,
    storeId: store.id,
    entityType,
    externalId,
    internalId,
    deleteAfter,
    phase1Action,
    note,
    platform,
  });
  logDeferredDeleteScheduled(entityType, internalId, externalId, platform);
  return {
    scheduled: true,
    deleteAfter,
    delayMs: SHOPIFY_HARD_DELETE_DELAY_MS,
    delayLabel: shopifyHardDeleteDelayLabel(),
  };
}

/** @deprecated Use scheduleMarketplaceHardDelete — kept name for Shopify call sites. */
async function scheduleShopifyHardDelete(args) {
  return scheduleMarketplaceHardDelete({ ...args, platform: args.platform || "shopify" });
}

async function loadStoreForLink(tenantId, link) {
  return getStoreById(link.store_id, tenantId);
}

async function enrichOrderWithCustomer(tenantId, order) {
  if (!order) return null;
  let customerEmail = null;
  let customerPhone = null;
  let customerName = null;
  if (order.customer_id) {
    const cust = await crmRepository.getCustomer(tenantId, order.customer_id);
    customerEmail = cust?.email || null;
    customerPhone = cust?.phone || null;
    customerName = cust?.customer_name || null;
  }
  return {
    ...order,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    customer_name: customerName,
  };
}

async function getConnectedShopifyStore(tenantId) {
  const store = await getStoreByPlatform(tenantId, "shopify");
  if (!store || store.status !== "connected") return null;
  return store;
}

async function getConnectedDarazStore(tenantId) {
  const store = await getStoreByPlatform(tenantId, "daraz");
  if (!store || store.status !== "connected") return null;
  return store;
}

async function buildStockByVariantId(tenantId, erpVariants = []) {
  const stockByVariantId = {};
  for (const erpV of erpVariants) {
    if (!erpV?.id) continue;
    const levels = await inventoryRepository.getVariantStockLevels(tenantId, erpV.id);
    stockByVariantId[erpV.id] = totalAvailableQty(levels);
  }
  return stockByVariantId;
}

/**
 * Per-variant Daraz warehouse quantities from ERP stock + location links.
 * Returns { stockByVariantId, warehouseQtyByVariantId, error }.
 */
async function buildDarazStockMaps(tenantId, storeId, erpVariants = []) {
  const locationLinks = await listLocationLinks(storeId);
  const mappedLinks = locationLinks.filter((ll) => ll.warehouse_id && ll.shopify_location_id);
  // Single mapped warehouse (typical Daraz PK account): push aggregate Quantity only.
  // Multi-warehouse XML is only needed when 2+ Daraz warehouses are mapped.
  const useMultiWarehouse = mappedLinks.length > 1;
  const stockByVariantId = {};
  const warehouseQtyByVariantId = {};

  for (const erpV of erpVariants) {
    if (!erpV?.id) continue;
    const levels = await inventoryRepository.getVariantStockLevels(tenantId, erpV.id);
    stockByVariantId[erpV.id] = totalAvailableQty(levels);

    if (!useMultiWarehouse) {
      warehouseQtyByVariantId[erpV.id] = [];
      continue;
    }

    const { locationTotals, primaryLocationId, error } = buildLocationQuantityMap(levels, locationLinks);
    if (error === "unmapped_warehouse_stock") {
      return {
        stockByVariantId,
        warehouseQtyByVariantId,
        error: "Map every warehouse with stock to a Daraz warehouse in Integrations.",
      };
    }

    const rows = [...locationTotals.entries()].map(([warehouseCode, quantity]) => ({
      warehouseCode,
      quantity,
    }));

    if (!rows.length && primaryLocationId && stockByVariantId[erpV.id] > 0) {
      rows.push({ warehouseCode: primaryLocationId, quantity: stockByVariantId[erpV.id] });
    }

    warehouseQtyByVariantId[erpV.id] = rows;
  }

  return { stockByVariantId, warehouseQtyByVariantId };
}

async function resolveDarazRawForProduct(tenantId, storeId, externalId) {
  const staged = await getSyncedRecordByExternalId(storeId, tenantId, "product", externalId);
  if (staged?.raw) return staged.raw;
  return null;
}

async function resolveDarazCategoryForCreate(tenantId, store, options = {}) {
  if (options.primaryCategoryId) return String(options.primaryCategoryId);

  // Prefer category from the product we are linking/updating when known.
  if (options.externalId) {
    const staged = await getSyncedRecordByExternalId(store.id, tenantId, "product", options.externalId);
    const cat = extractDarazPrimaryCategory(staged?.raw) || staged?.normalized?.primaryCategory;
    if (cat) return String(cat);
  }

  const staged = await getSyncedRecords(store.id, tenantId, "product", 20);
  for (const row of staged) {
    const cat = extractDarazPrimaryCategory(row.raw) || row.normalized?.primaryCategory;
    if (cat) return String(cat);
  }
  return null;
}

async function pushProductInventoryLevels(tenantId, store, erpVariants, inventoryByErpVariantId, logExternalId) {
  for (const erpV of erpVariants) {
    const inventoryItemId = inventoryByErpVariantId?.[erpV.id];
    if (!inventoryItemId) continue;
    const stockLevels = await inventoryRepository.getVariantStockLevels(tenantId, erpV.id);
    await pushVariantStockLevelsToShopify({
      tenantId,
      store,
      stockLevels,
      inventoryItemId,
      logExternalId,
    });
  }
}

function buildLocationQuantityMap(stockLevels, locationLinks) {
  const warehouseToLocation = new Map();
  let primaryLocationId = null;
  for (const ll of locationLinks) {
    if (ll.warehouse_id && ll.shopify_location_id) {
      warehouseToLocation.set(Number(ll.warehouse_id), String(ll.shopify_location_id));
      if (!primaryLocationId) primaryLocationId = String(ll.shopify_location_id);
    }
  }

  const locationTotals = new Map();
  let unmappedQty = 0;
  for (const level of stockLevels) {
    const qty = Math.max(0, Math.floor(Number(level.available_qty) || 0));
    const locId = warehouseToLocation.get(Number(level.warehouse_id));
    if (locId) {
      locationTotals.set(locId, (locationTotals.get(locId) || 0) + qty);
    } else if (qty > 0) {
      unmappedQty += qty;
    }
  }

  if (unmappedQty > 0) {
    return {
      locationTotals,
      primaryLocationId,
      error: "unmapped_warehouse_stock",
    };
  }

  if (!locationTotals.size && primaryLocationId) {
    const total = stockLevels.reduce(
      (sum, level) => sum + Math.max(0, Math.floor(Number(level.available_qty) || 0)),
      0,
    );
    if (total > 0) locationTotals.set(primaryLocationId, total);
  }

  return { locationTotals, primaryLocationId };
}

async function pushVariantStockLevelsToShopify({
  tenantId,
  store,
  stockLevels,
  inventoryItemId,
  logExternalId,
}) {
  const locationLinks = await listLocationLinks(store.id);
  const { locationTotals, primaryLocationId, error } = buildLocationQuantityMap(stockLevels, locationLinks);
  const results = [];

  if (error === "unmapped_warehouse_stock") {
    return {
      ok: false,
      skipped: true,
      reason: "no_mapped_warehouse_locations",
      error: "Map every warehouse with stock to a Shopify location in Integrations.",
    };
  }

  for (const [locationId, available] of locationTotals) {
    const invResult = await pushInventoryLevel(store, {
      locationId,
      inventoryItemId,
      available,
      productExternalId: logExternalId,
    });
    await logPushResult(store.id, tenantId, "inventory", logExternalId, invResult);
    results.push(invResult);
  }

  if (!results.length) {
    const totalQty = stockLevels.reduce(
      (sum, level) => sum + Math.max(0, Math.floor(Number(level.available_qty) || 0)),
      0,
    );
    return {
      ok: false,
      skipped: true,
      reason: primaryLocationId ? "no_stock" : "no_mapped_warehouse_locations",
      error: totalQty > 0
        ? "Stock exists in ERP but no mapped Shopify location received a quantity update."
        : undefined,
    };
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    const detail = failed.map((r) => r.error).filter(Boolean).join("; ");
    return {
      ok: false,
      error: detail || "Shopify rejected one or more inventory updates.",
      results,
    };
  }
  return { ok: true, results };
}

async function resolveShopifyInventoryItemIdFromStaging(tenantId, storeId, shopifyProductExternalId, erpVariant) {
  const records = await getSyncedRecords(storeId, tenantId, "product", 5000);
  const rec = records.find((row) => String(row.externalId) === String(shopifyProductExternalId));
  if (!rec) return null;

  const normalized =
    rec.raw && String(rec.platform || "shopify") === "shopify"
      ? normalizeShopifyProduct(rec.raw)
      : rec.normalized || {};
  const variants = normalized.variants || [];
  const skuKey = String(erpVariant.sku || "").trim().toLowerCase();

  if (skuKey) {
    const match = variants.find((v) => String(v.sku || "").trim().toLowerCase() === skuKey);
    if (match?.inventoryItemId) return match.inventoryItemId;
  }
  if (variants.length === 1 && variants[0]?.inventoryItemId) {
    return variants[0].inventoryItemId;
  }
  if (normalized.inventoryItemId) return normalized.inventoryItemId;
  return null;
}

async function resolveShopifyInventoryItemId(tenantId, store, storeId, shopifyProductExternalId, erpVariant) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    const { data } = await client.get(`/products/${shopifyProductExternalId}.json`);
    const variants = data?.product?.variants || [];
    const skuKey = String(erpVariant.sku || "").trim().toLowerCase();
    if (skuKey) {
      const match = variants.find((v) => String(v.sku || "").trim().toLowerCase() === skuKey);
      if (match?.inventory_item_id) return match.inventory_item_id;
    }
    if (variants.length === 1 && variants[0]?.inventory_item_id) {
      return variants[0].inventory_item_id;
    }
  } catch {
    /* fall back to staged copy */
  }

  return resolveShopifyInventoryItemIdFromStaging(tenantId, storeId, shopifyProductExternalId, erpVariant);
}

async function buildOrderLineItems(store, tenantId, order) {
  const lineItems = [];
  const unmatched = [];
  for (const item of order.items || []) {
    const variantId = await resolveShopifyVariantIdForItem(
      store,
      tenantId,
      item.product_id,
      item.sku,
      { productName: item.product_name },
    );
    if (!variantId) {
      unmatched.push(item.product_name || item.sku || "line item");
      continue;
    }
    lineItems.push({
      variant_id: variantId,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      price: String(item.unit_price ?? 0),
    });
  }
  if (unmatched.length) {
    throw new Error(
      `Could not match ${unmatched.length} order line(s) in Shopify (${unmatched.join(", ")}). Link products and match SKUs first.`,
    );
  }
  if (!lineItems.length && (order.items || []).length) {
    throw new Error("No order lines could be matched in Shopify. Link products and match SKUs first.");
  }
  return lineItems;
}

export async function getEcomLinkStatus(tenantId, entityType, internalId) {
  if (entityType === "warehouse") {
    const locLink = await getWarehouseLocationLink(tenantId, internalId);
    if (!locLink?.shopify_location_id) return { linked: false };
    const store = await getStoreById(locLink.store_id, tenantId);
    return {
      linked: true,
      platform: "shopify",
      storeName: store?.store_name,
      externalId: locLink.shopify_location_id,
    };
  }

  for (const platform of ["shopify", "daraz"]) {
    const link = await getEntityLinkByInternalId(tenantId, entityType, internalId, platform);
    if (link) {
      return {
        linked: true,
        platform,
        storeName: link.store_name,
        externalId: link.external_id,
      };
    }
  }

  return { linked: false };
}

export async function getShopifyLinkStatus(tenantId, entityType, internalId) {
  const status = await getEcomLinkStatus(tenantId, entityType, internalId);
  if (!status.linked || status.platform !== "shopify") return { linked: false };
  return status;
}

/** Push updates for records already linked to Shopify. */
export async function pushEntityToShopify(tenantId, entityType, internalId, options = {}) {
  const link = await getEntityLinkByInternalId(tenantId, entityType, internalId, "shopify");
  if (!link) return { ok: false, skipped: true, reason: "not_linked" };

  const store = await loadStoreForLink(tenantId, link);
  if (!store) return { ok: false, skipped: true, reason: "store_disconnected" };

  let result;
  if (entityType === "customer") {
    const customer = await crmRepository.getCustomerProfile(tenantId, internalId);
    if (!customer) return { ok: false, error: "Customer not found" };
    result = await pushCustomerToShopify(store, link.external_id, customer, {
      beforeCustomer: options.beforeCustomer || null,
    });
  } else if (entityType === "order") {
    const order = await orderRepository.getOrder(tenantId, internalId);
    if (!order) return { ok: false, error: "Order not found" };
    const beforeOrder = options.beforeOrder
      ? await enrichOrderWithCustomer(tenantId, options.beforeOrder)
      : null;
    const enrichedOrder = await enrichOrderWithCustomer(tenantId, order);
    result = await pushOrderToShopify(store, link.external_id, enrichedOrder, {
      tenantId,
      skipLineItems: Boolean(options.skipOrderLineItems),
      beforeOrder,
    });
  } else if (entityType === "product") {
    const product = await inventoryRepository.getProductById(tenantId, internalId);
    if (!product) return { ok: false, error: "Product not found" };
    const erpVariants = await inventoryRepository.getVariantsByProductId(tenantId, internalId);
    result = await pushProductToShopify(store, link.external_id, product, erpVariants, {
      beforeProduct: options.beforeProduct || null,
    });
    if (result.ok && result.inventoryByErpVariantId) {
      await pushProductInventoryLevels(
        tenantId,
        store,
        erpVariants,
        result.inventoryByErpVariantId,
        link.external_id,
      );
    }
  } else if (entityType === "warehouse") {
    const warehouse = await inventoryRepository.getWarehouseById(tenantId, internalId);
    if (!warehouse) return { ok: false, error: "Warehouse not found" };
    const locLink = await getWarehouseLocationLink(tenantId, internalId);
    if (!locLink?.shopify_location_id) {
      return { ok: false, skipped: true, reason: "not_linked" };
    }
    result = await pushLocationToShopify(store, locLink.shopify_location_id, warehouse, {
      beforeWarehouse: options.beforeWarehouse || null,
    });
  } else {
    return { ok: false, skipped: true, reason: "unsupported_entity" };
  }

  await logPushResult(store.id, tenantId, entityType, link.external_id, result);
  return result;
}

/** Push ERP stock levels to Shopify for a single variant when the parent product is linked. */
export async function syncVariantInventoryToShopify(tenantId, variantId, options = {}) {
  const variant = await inventoryRepository.getVariantById(tenantId, variantId);
  if (!variant?.product_id) return { ok: false, skipped: true, reason: "variant_not_found" };

  const link = await getEntityLinkByInternalId(tenantId, "product", variant.product_id, "shopify");
  if (!link) return { ok: false, skipped: true, reason: "not_linked" };

  const store = await loadStoreForLink(tenantId, link);
  if (!store) return { ok: false, skipped: true, reason: "store_disconnected" };

  const inventoryItemId = await resolveShopifyInventoryItemId(
    tenantId,
    store,
    store.id,
    link.external_id,
    variant,
  );
  if (!inventoryItemId) return { ok: false, skipped: true, reason: "shopify_variant_not_found" };

  const { warehouseId, qtyDelta } = options;
  if (warehouseId != null && qtyDelta != null && qtyDelta !== 0) {
    const locLink = await getWarehouseLocationLink(tenantId, warehouseId);
    if (!locLink?.shopify_location_id) {
      return {
        ok: false,
        skipped: true,
        reason: "no_mapped_warehouse_locations",
        error: "Map this warehouse to a Shopify location in Integrations.",
      };
    }
    const result = await pushInventoryLevelAdjust(store, {
      locationId: locLink.shopify_location_id,
      inventoryItemId,
      adjustment: qtyDelta,
      productExternalId: link.external_id,
    });
    await logPushResult(store.id, tenantId, "inventory", link.external_id, result);
    return result;
  }

  const stockLevels = await inventoryRepository.getVariantStockLevels(tenantId, variantId);
  return pushVariantStockLevelsToShopify({
    tenantId,
    store,
    stockLevels,
    inventoryItemId,
    logExternalId: link.external_id,
  });
}

/**
 * Create in Shopify when not linked yet, or push updates when already linked.
 * Used when saving ERP records with syncToShopify enabled.
 */
export async function syncEntityToShopify(tenantId, entityType, internalId, options = {}) {
  const link = await getEntityLinkByInternalId(tenantId, entityType, internalId, "shopify");
  if (link) {
    return pushEntityToShopify(tenantId, entityType, internalId, options);
  }

  const store = await getConnectedShopifyStore(tenantId);
  if (!store) return { ok: false, skipped: true, reason: "no_store" };

  let result;
  let externalIdForLog = null;

  if (entityType === "customer") {
    const customer = await crmRepository.getCustomerProfile(tenantId, internalId);
    if (!customer) return { ok: false, error: "Customer not found" };
    result = await createCustomerInShopify(store, customer);
    if (result.ok) {
      await upsertEntityLink({
        tenantId,
        storeId: store.id,
        platform: "shopify",
        entityType: "customer",
        externalId: result.externalId,
        internalId,
      });
      externalIdForLog = result.externalId;
    }
  } else if (entityType === "product") {
    const product = await inventoryRepository.getProductById(tenantId, internalId);
    if (!product) return { ok: false, error: "Product not found" };
    const erpVariants = await inventoryRepository.getVariantsByProductId(tenantId, internalId);
    result = await createProductInShopify(store, product, erpVariants);
    if (result.ok) {
      await upsertEntityLink({
        tenantId,
        storeId: store.id,
        platform: "shopify",
        entityType: "product",
        externalId: result.externalId,
        internalId,
      });
      externalIdForLog = result.externalId;
      if (result.inventoryByErpVariantId) {
        await pushProductInventoryLevels(
          tenantId,
          store,
          erpVariants,
          result.inventoryByErpVariantId,
          result.externalId,
        );
      }
    }
  } else if (entityType === "order") {
    const order = await orderRepository.getOrder(tenantId, internalId);
    if (!order) return { ok: false, error: "Order not found" };
    let customerExternalId = null;
    let customerEmail = null;
    let customerPhone = null;
    let customerName = null;
    if (order.customer_id) {
      const cust = await crmRepository.getCustomer(tenantId, order.customer_id);
      customerEmail = cust?.email || null;
      customerPhone = cust?.phone || null;
      customerName = cust?.customer_name || null;
      const custLink = await getEntityLinkByInternalId(tenantId, "customer", order.customer_id, "shopify");
      customerExternalId = custLink?.external_id || null;
    }
    let lineItems;
    try {
      lineItems = await buildOrderLineItems(store, tenantId, order);
    } catch (err) {
      return { ok: false, error: err.message || "Could not build Shopify order lines" };
    }
    result = await createOrderInShopify(
      store,
      {
        ...order,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_name: customerName,
      },
      { customerExternalId },
      lineItems,
    );
    if (result.ok) {
      await upsertEntityLink({
        tenantId,
        storeId: store.id,
        platform: "shopify",
        entityType: "order",
        externalId: result.externalId,
        internalId,
      });
      // Persist customer link when Shopify matched an existing customer by email/phone.
      if (order.customer_id && result.customerExternalId && !customerExternalId) {
        await upsertEntityLink({
          tenantId,
          storeId: store.id,
          platform: "shopify",
          entityType: "customer",
          externalId: result.customerExternalId,
          internalId: order.customer_id,
        });
      }
      externalIdForLog = result.externalId;
    }
  } else if (entityType === "warehouse") {
    const warehouse = await inventoryRepository.getWarehouseById(tenantId, internalId);
    if (!warehouse) return { ok: false, error: "Warehouse not found" };
    const existingLoc = await getWarehouseLocationLink(tenantId, internalId);
    if (existingLoc?.shopify_location_id) {
      result = await pushLocationToShopify(store, existingLoc.shopify_location_id, warehouse, {
        beforeWarehouse: options.beforeWarehouse || null,
      });
      externalIdForLog = existingLoc.shopify_location_id;
    } else {
      result = await createLocationInShopify(store, warehouse);
      if (result.ok) {
        await upsertLocationLink({
          tenantId,
          storeId: store.id,
          shopifyLocationId: result.externalId,
          locationName: warehouse.warehouse_name,
          warehouseId: internalId,
          outletId: null,
          active: warehouse.status !== "inactive",
        });
        externalIdForLog = result.externalId;
      }
    }
  } else {
    return { ok: false, skipped: true, reason: "unsupported_entity" };
  }

  if (externalIdForLog) {
    await logPushResult(store.id, tenantId, entityType, externalIdForLog, result);
  }
  return result;
}

/** Stage Shopify customer delete: note + tag now, hard-delete later. ERP deletes only if this succeeds. */
export async function deleteLinkedCustomerFromShopify(tenantId, customerId) {
  const link = await getEntityLinkByInternalId(tenantId, "customer", customerId, "shopify");
  if (!link) return { ok: true, skipped: true, reason: "not_linked" };

  const store = await loadStoreForLink(tenantId, link);
  if (!store) return { ok: false, skipped: true, reason: "store_disconnected" };

  const note = shopifyPendingDeleteNote("customer");
  const result = await markCustomerPendingDeleteInShopify(store, link.external_id, note);
  await logPushResult(store.id, tenantId, "customer", link.external_id, result);
  if (!result.ok) return result;

  const schedule = await scheduleShopifyHardDelete({
    tenantId,
    store,
    entityType: "customer",
    externalId: link.external_id,
    internalId: customerId,
    phase1Action: result.action,
    note,
  });
  return { ...result, ...schedule, shopifyNote: note };
}

/** Stage Shopify order delete: cancel + note now, hard-delete later. ERP deletes only if cancel succeeds. */
export async function deleteLinkedOrderFromShopify(tenantId, orderId) {
  const link = await getEntityLinkByInternalId(tenantId, "order", orderId, "shopify");
  if (!link) return { ok: true, skipped: true, reason: "not_linked" };

  const store = await loadStoreForLink(tenantId, link);
  if (!store) return { ok: false, skipped: true, reason: "store_disconnected" };

  const note = shopifyPendingDeleteNote("order");
  const result = await markOrderPendingDeleteInShopify(store, link.external_id, note);
  await logPushResult(store.id, tenantId, "order", link.external_id, result);

  if (!result.ok) {
    // Keep ERP order + link intact when Shopify cannot cancel.
    return result;
  }

  // Keep entity link until hard-delete job finishes (needed to map Shopify id).
  const schedule = await scheduleShopifyHardDelete({
    tenantId,
    store,
    entityType: "order",
    externalId: link.external_id,
    internalId: orderId,
    phase1Action: result.action,
    note,
  });
  return { ...result, ...schedule, shopifyNote: note };
}

/** Stage Shopify product delete: draft + note now, hard-delete later. ERP deletes only if this succeeds. */
export async function deleteLinkedProductFromShopify(tenantId, productId) {
  const link = await getEntityLinkByInternalId(tenantId, "product", productId, "shopify");
  if (!link) return { ok: true, skipped: true, reason: "not_linked" };

  const store = await loadStoreForLink(tenantId, link);
  if (!store) return { ok: false, skipped: true, reason: "store_disconnected" };

  const note = shopifyPendingDeleteNote("product");
  const result = await markProductPendingDeleteInShopify(store, link.external_id, note);
  await logPushResult(store.id, tenantId, "product", link.external_id, result);
  if (!result.ok) return result;

  const schedule = await scheduleShopifyHardDelete({
    tenantId,
    store,
    entityType: "product",
    externalId: link.external_id,
    internalId: productId,
    phase1Action: result.action,
    note,
  });
  return { ...result, ...schedule, shopifyNote: note };
}

/** Stage Shopify location delete: deactivate now, hard-delete later. ERP deletes only if this succeeds. */
export async function deleteLinkedWarehouseFromShopify(tenantId, warehouseId) {
  const locLink = await getWarehouseLocationLink(tenantId, warehouseId);
  if (!locLink?.shopify_location_id) return { ok: true, skipped: true, reason: "not_linked" };

  const store = await getStoreById(locLink.store_id, tenantId);
  if (!store?.access_token) return { ok: false, skipped: true, reason: "store_disconnected" };

  const note = shopifyPendingDeleteNote("location");
  const result = await deactivateLocationInShopify(store, locLink.shopify_location_id);
  await logPushResult(store.id, tenantId, "warehouse", locLink.shopify_location_id, {
    ...result,
    shopifyNote: note,
  });
  if (!result.ok) return result;

  // Keep location link until hard-delete job finishes (needed to map Shopify id).
  const schedule = await scheduleShopifyHardDelete({
    tenantId,
    store,
    entityType: "warehouse",
    externalId: locLink.shopify_location_id,
    internalId: warehouseId,
    phase1Action: result.action,
    note,
  });
  return { ...result, ...schedule, shopifyNote: note };
}

async function pushToLinkedOrder(tenantId, orderId, fn) {
  const link = await getEntityLinkByInternalId(tenantId, "order", orderId, "shopify");
  if (!link) return { ok: true, skipped: true, reason: "not_linked" };
  const store = await loadStoreForLink(tenantId, link);
  if (!store) return { ok: false, skipped: true, reason: "store_disconnected" };
  const result = await fn(store, link.external_id);
  await logPushResult(store.id, tenantId, "order", link.external_id, result);
  return result;
}

export function pushOrderPaymentToShopify(tenantId, orderId, payment) {
  return pushToLinkedOrder(tenantId, orderId, (store, externalId) =>
    recordPaymentInShopify(store, externalId, {
      amount: payment.amount,
      paymentMethod: payment.payment_method,
    }),
  );
}

export function pushOrderRefundToShopify(tenantId, orderId, refund) {
  return pushToLinkedOrder(tenantId, orderId, (store, externalId) =>
    createRefundInShopify(store, externalId, {
      amount: refund.refund_amount,
      reason: refund.reason,
    }),
  );
}

export function pushOrderReturnToShopify(tenantId, orderId, returnRecord) {
  return pushToLinkedOrder(tenantId, orderId, (store, externalId) =>
    pushReturnNoteToShopify(store, externalId, {
      reason: returnRecord.reason,
      returnStatus: returnRecord.return_status,
    }),
  );
}

export function pushOrderExchangeToShopify(tenantId, orderId, exchange) {
  return pushToLinkedOrder(tenantId, orderId, (store, externalId) =>
    pushExchangeNoteToShopify(store, externalId, {
      reason: exchange.reason,
      exchangeStatus: exchange.exchange_status,
      oldProductId: exchange.old_product_id,
      newProductId: exchange.new_product_id,
    }),
  );
}

/** Re-attempt a failed push using the entity type + external id recorded on the log. */
export async function retryPushByExternalId(tenantId, storeId, entityType, externalId) {
  const link = await getEntityLink(storeId, entityType, externalId);
  if (!link) {
    return { ok: false, error: "This record is no longer linked to the store." };
  }
  if (link.platform === "daraz") {
    return pushEntityToDaraz(tenantId, entityType, link.internal_id);
  }
  return pushEntityToShopify(tenantId, entityType, link.internal_id);
}

/** Push updates for records already linked to Daraz. */
export async function pushEntityToDaraz(tenantId, entityType, internalId, options = {}) {
  const link = await getEntityLinkByInternalId(tenantId, entityType, internalId, "daraz");
  if (!link) return { ok: false, skipped: true, reason: "not_linked" };

  const store = await loadStoreForLink(tenantId, link);
  if (!store) return { ok: false, skipped: true, reason: "store_disconnected" };

  let result;
  if (entityType === "product") {
    const product = await inventoryRepository.getProductById(tenantId, internalId);
    if (!product) return { ok: false, error: "Product not found" };
    const erpVariants = await inventoryRepository.getVariantsByProductId(tenantId, internalId);
    const stockMaps = await buildDarazStockMaps(tenantId, store.id, erpVariants);
    if (stockMaps.error) {
      return { ok: false, skipped: true, reason: "no_mapped_warehouse_locations", error: stockMaps.error };
    }
    // Always prefer live item/get; staged raw is fallback only.
    let darazRaw = null;
    try {
      darazRaw = await fetchDarazProductRaw(store, link.external_id);
    } catch {
      darazRaw = await resolveDarazRawForProduct(tenantId, store.id, link.external_id);
    }
    result = await pushProductToDaraz(store, link.external_id, product, erpVariants, {
      beforeProduct: options.beforeProduct || null,
      stockByVariantId: stockMaps.stockByVariantId,
      warehouseQtyByVariantId: stockMaps.warehouseQtyByVariantId,
      darazRaw,
      forceFullPush: Boolean(options.forceFullPush),
    });
  } else {
    return { ok: false, skipped: true, reason: "unsupported_entity" };
  }

  await logDarazPushResult(store.id, tenantId, entityType, link.external_id, result);
  return result;
}

/**
 * Create in Daraz when not linked yet, or push updates when already linked.
 * Used when saving ERP products with syncToDaraz enabled.
 */
export async function syncEntityToDaraz(tenantId, entityType, internalId, options = {}) {
  const link = await getEntityLinkByInternalId(tenantId, entityType, internalId, "daraz");
  if (link) {
    return pushEntityToDaraz(tenantId, entityType, internalId, options);
  }

  const store = await getConnectedDarazStore(tenantId);
  if (!store) return { ok: false, skipped: true, reason: "no_store" };

  if (entityType !== "product") {
    return { ok: false, skipped: true, reason: "unsupported_entity" };
  }

  const product = await inventoryRepository.getProductById(tenantId, internalId);
  if (!product) return { ok: false, error: "Product not found" };
  const erpVariants = await inventoryRepository.getVariantsByProductId(tenantId, internalId);
  const stockMaps = await buildDarazStockMaps(tenantId, store.id, erpVariants);
  if (stockMaps.error) {
    return { ok: false, skipped: true, reason: "no_mapped_warehouse_locations", error: stockMaps.error };
  }
  const primaryCategoryId = await resolveDarazCategoryForCreate(tenantId, store, options);

  const result = await createProductInDaraz(store, product, erpVariants, {
    primaryCategoryId,
    stockByVariantId: stockMaps.stockByVariantId,
    warehouseQtyByVariantId: stockMaps.warehouseQtyByVariantId,
    brand: options.brand || "",
    shortDescription: options.shortDescription || "",
    packageDims: options.packageDims || {},
  });

  if (result.ok) {
    await upsertEntityLink({
      tenantId,
      storeId: store.id,
      platform: "daraz",
      entityType: "product",
      externalId: result.externalId,
      internalId,
    });
    // Persist category/brand so later updates do not re-guess from unrelated staged products.
    const normalizedStub = {
      externalId: String(result.externalId),
      platform: "daraz",
      primaryCategory: result.primaryCategory || primaryCategoryId || null,
      brand: options.brand || null,
      name: product.product_name,
    };
    await upsertSyncedRecord(
      store.id,
      tenantId,
      "product",
      result.externalId,
      {
        item_id: result.externalId,
        primary_category: result.primaryCategory || primaryCategoryId || null,
        attributes: {
          name: product.product_name,
          brand: options.brand || undefined,
        },
      },
      normalizedStub,
      "erp_push",
      "daraz",
    );
    await logDarazPushResult(store.id, tenantId, entityType, result.externalId, result);
  } else {
    await logDarazPushResult(store.id, tenantId, entityType, result.externalId || "new", result);
  }

  return result;
}

/** Push ERP stock totals to Daraz for a single variant when the parent product is linked. */
export async function syncVariantInventoryToDaraz(tenantId, variantId) {
  const variant = await inventoryRepository.getVariantById(tenantId, variantId);
  if (!variant?.product_id) return { ok: false, skipped: true, reason: "variant_not_found" };

  const link = await getEntityLinkByInternalId(tenantId, "product", variant.product_id, "daraz");
  if (!link) return { ok: false, skipped: true, reason: "not_linked" };

  const store = await loadStoreForLink(tenantId, link);
  if (!store) return { ok: false, skipped: true, reason: "store_disconnected" };

  const levels = await inventoryRepository.getVariantStockLevels(tenantId, variantId);
  const locationLinks = await listLocationLinks(store.id);
  const hasMappedWarehouses = locationLinks.some((ll) => ll.warehouse_id && ll.shopify_location_id);
  const quantity = totalAvailableQty(levels);

  let warehouseQuantities = [];
  if (hasMappedWarehouses) {
    const { locationTotals, primaryLocationId, error } = buildLocationQuantityMap(levels, locationLinks);
    if (error === "unmapped_warehouse_stock") {
      return {
        ok: false,
        skipped: true,
        reason: "no_mapped_warehouse_locations",
        error: "Map every warehouse with stock to a Daraz warehouse in Integrations.",
      };
    }
    warehouseQuantities = [...locationTotals.entries()].map(([warehouseCode, qty]) => ({
      warehouseCode,
      quantity: qty,
    }));
    if (!warehouseQuantities.length && primaryLocationId && quantity > 0) {
      warehouseQuantities.push({ warehouseCode: primaryLocationId, quantity });
    }
  }

  let darazRaw = await resolveDarazRawForProduct(tenantId, store.id, link.external_id);
  if (!darazRaw) {
    try {
      darazRaw = await fetchDarazProductRaw(store, link.external_id);
    } catch {
      darazRaw = null;
    }
  }

  const darazSkus = extractDarazSkus(darazRaw);
  const matched = matchDarazSkusToErpVariants([variant], darazSkus);
  const darazSku = matched[0]?.darazSku || {
    sellerSku: variant.sku,
    skuId: null,
  };

  const result = await pushProductPriceQuantityToDaraz(store, {
    itemId: link.external_id,
    rows: [{
      skuId: darazSku.skuId,
      sellerSku: variant.sku || darazSku.sellerSku,
      quantity: warehouseQuantities.length ? undefined : quantity,
      warehouseQuantities,
      price: Number(variant.selling_price) || undefined,
    }],
  });

  await logDarazPushResult(store.id, tenantId, "product", link.external_id, result);
  return result;
}

/** Phase 1: deactivate on Daraz now; schedule hard-remove in 7 days. Keep entity link until then. */
export async function deleteLinkedProductFromDaraz(tenantId, productId) {
  const link = await getEntityLinkByInternalId(tenantId, "product", productId, "daraz");
  if (!link) return { ok: true, skipped: true, reason: "not_linked" };

  const store = await loadStoreForLink(tenantId, link);
  if (!store) return { ok: false, skipped: true, reason: "store_disconnected" };

  const note = darazPendingDeleteNote("product");
  const result = await deactivateProductInDaraz(store, link.external_id);
  await logDarazPushResult(store.id, tenantId, "product", link.external_id, {
    ...result,
    darazNote: note,
  });
  if (!result.ok) return result;

  const schedule = await scheduleMarketplaceHardDelete({
    tenantId,
    store,
    entityType: "product",
    externalId: link.external_id,
    internalId: productId,
    phase1Action: result.action,
    note,
    platform: "daraz",
  });
  return { ...result, ...schedule, darazNote: note };
}
