import {
  getEntityLinkByInternalId,
  getWarehouseLocationLink,
  getStoreById,
  listLocationLinks,
} from "../../repositories/ecommerceRepository.js";
import { orderRepository } from "../../repositories/orderRepository.js";
import { inventoryRepository } from "../../repositories/inventoryRepository.js";
import { shopifyClient } from "./shopifyClient.js";

export const SHOPIFY_POLICY = {
  CUSTOMER_HAS_ORDERS:
    "This Shopify-linked customer has orders and cannot be deleted (same as Shopify).",
  CANCELLED_ORDER: "Cancelled orders cannot be edited (same as Shopify).",
  RETURNED_ORDER: "Returned orders cannot be edited (same as Shopify).",
  FULFILLED_LINE_EDIT:
    "Line items on fulfilled Shopify orders cannot be changed. You can only add new products.",
  PRODUCT_ON_ORDERS: "Products on open orders cannot be deleted.",
  UNMAPPED_WAREHOUSE_STOCK:
    "Map this warehouse to a Shopify location in Integrations before changing stock for linked products.",
  SHOPIFY_PAYMENT_LOCKED:
    "Payments on this Shopify-linked order are managed in Shopify.",
  SHOPIFY_PAYMENT_MUTATION:
    "Payments on Shopify-linked orders cannot be edited or removed in the ERP.",
  SHOPIFY_REFUND_NO_TX:
    "Refunds require a successful Shopify payment transaction. Process refunds in Shopify admin if the order was paid there.",
  LINKED_REQUIRES_SYNC:
    "This record is linked to Shopify. Changes must be synced — local-only save is not allowed.",
  RETURN_NOT_SUPPORTED:
    "Returns on Shopify-linked orders are not supported yet. Process returns in Shopify admin.",
  EXCHANGE_NOT_SUPPORTED:
    "Exchanges on Shopify-linked orders are not supported yet. Process exchanges in Shopify admin.",
  WAREHOUSE_ALREADY_MAPPED:
    "Each warehouse can map to only one Shopify location. Choose a different warehouse.",
  LOCATION_ALREADY_MAPPED:
    "Each Shopify location can map to only one warehouse.",
};

const LOCKED_PAYMENT_STATUSES = new Set(["paid", "partial", "partially_paid", "refunded"]);

export async function isShopifyLinked(tenantId, entityType, internalId) {
  if (entityType === "warehouse") {
    const locLink = await getWarehouseLocationLink(tenantId, internalId);
    return Boolean(locLink?.shopify_location_id);
  }
  const link = await getEntityLinkByInternalId(tenantId, entityType, internalId, "shopify");
  return Boolean(link);
}

function orderItemKey(item) {
  return `${Number(item.product_id) || 0}:${String(item.sku || "").trim().toLowerCase()}`;
}

function normalizeOrderItemsForPolicy(items = []) {
  return (items || []).map((item, index) => ({
    id: item.id != null ? Number(item.id) : null,
    index,
    product_id: Number(item.product_id) || 0,
    sku: String(item.sku || "").trim().toLowerCase(),
    quantity: Number(item.quantity) || 0,
  }));
}

export function assertOrderStatusEditable(order) {
  const status = String(order?.order_status || "").toLowerCase();
  if (status === "cancelled") throw new Error(SHOPIFY_POLICY.CANCELLED_ORDER);
  if (status === "returned") throw new Error(SHOPIFY_POLICY.RETURNED_ORDER);
}

export async function assertRequireShopifySyncOnSave(tenantId, entityType, internalId, syncToShopify) {
  if (syncToShopify) return;
  const linked = await isShopifyLinked(tenantId, entityType, internalId);
  if (linked) throw new Error(SHOPIFY_POLICY.LINKED_REQUIRES_SYNC);
}

export async function assertShopifyOrderLineItemsEditable(tenantId, order, beforeItems, afterItems) {
  assertOrderStatusEditable(order);
  const linked = await isShopifyLinked(tenantId, "order", order.id);
  if (!linked) return;

  const fulfillment = String(order.fulfillment_status || "").toLowerCase();
  if (!["fulfilled", "partial"].includes(fulfillment)) return;

  const before = normalizeOrderItemsForPolicy(beforeItems);
  const after = normalizeOrderItemsForPolicy(afterItems);

  if (after.length < before.length) {
    throw new Error(SHOPIFY_POLICY.FULFILLED_LINE_EDIT);
  }

  for (const bItem of before) {
    let aItem = null;
    if (bItem.id) {
      aItem = after.find((item) => item.id === bItem.id);
    }
    if (!aItem) {
      aItem = after[bItem.index];
      if (!aItem || orderItemKey(aItem) !== orderItemKey(bItem)) {
        throw new Error(SHOPIFY_POLICY.FULFILLED_LINE_EDIT);
      }
    }
    if (Number(bItem.quantity) !== Number(aItem.quantity)) {
      throw new Error(SHOPIFY_POLICY.FULFILLED_LINE_EDIT);
    }
  }
}

export async function assertCustomerCanDelete(tenantId, customerId) {
  const linked = await isShopifyLinked(tenantId, "customer", customerId);
  if (!linked) return;
  const orderCount = await orderRepository.countOrdersForCustomer(tenantId, customerId);
  if (orderCount > 0) throw new Error(SHOPIFY_POLICY.CUSTOMER_HAS_ORDERS);
}

export async function assertProductCanDelete(tenantId, productId) {
  const openOrders = await orderRepository.countOpenOrdersForProduct(tenantId, productId);
  if (openOrders > 0) throw new Error(SHOPIFY_POLICY.PRODUCT_ON_ORDERS);
}

export async function assertLinkedStockWarehouseMapped(tenantId, variantId, warehouseId) {
  const variant = await inventoryRepository.getVariantById(tenantId, variantId);
  if (!variant?.product_id) return;
  const linked = await isShopifyLinked(tenantId, "product", variant.product_id);
  if (!linked) return;
  const locLink = await getWarehouseLocationLink(tenantId, warehouseId);
  if (!locLink?.shopify_location_id) {
    throw new Error(SHOPIFY_POLICY.UNMAPPED_WAREHOUSE_STOCK);
  }
}

export async function assertShopifyPaymentAllowed(tenantId, orderId) {
  const linked = await isShopifyLinked(tenantId, "order", orderId);
  if (!linked) return;
  const order = await orderRepository.getOrder(tenantId, orderId);
  const paymentStatus = String(order?.payment_status || "").toLowerCase();
  if (LOCKED_PAYMENT_STATUSES.has(paymentStatus)) {
    throw new Error(SHOPIFY_POLICY.SHOPIFY_PAYMENT_LOCKED);
  }
}

export async function assertShopifyPaymentMutationAllowed(tenantId, orderId) {
  const linked = await isShopifyLinked(tenantId, "order", orderId);
  if (!linked) return;
  throw new Error(SHOPIFY_POLICY.SHOPIFY_PAYMENT_MUTATION);
}

export async function assertShopifyReturnBlocked(tenantId, orderId) {
  const linked = await isShopifyLinked(tenantId, "order", orderId);
  if (linked) throw new Error(SHOPIFY_POLICY.RETURN_NOT_SUPPORTED);
}

export async function assertShopifyExchangeBlocked(tenantId, orderId) {
  const linked = await isShopifyLinked(tenantId, "order", orderId);
  if (linked) throw new Error(SHOPIFY_POLICY.EXCHANGE_NOT_SUPPORTED);
}

async function shopifyOrderHasRefundableTransaction(store, externalId) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const { data } = await client.get(`/orders/${externalId}.json`);
  const order = data?.order;
  return (order?.transactions || []).some(
    (tx) =>
      ["sale", "capture"].includes(String(tx.kind || "").toLowerCase())
      && String(tx.status || "").toLowerCase() === "success",
  );
}

export async function assertShopifyRefundAllowed(tenantId, orderId) {
  const link = await getEntityLinkByInternalId(tenantId, "order", orderId, "shopify");
  if (!link) return;
  const store = await getStoreById(link.store_id, tenantId);
  if (!store || store.status !== "connected") {
    throw new Error(SHOPIFY_POLICY.SHOPIFY_REFUND_NO_TX);
  }
  const hasTx = await shopifyOrderHasRefundableTransaction(store, link.external_id);
  if (!hasTx) throw new Error(SHOPIFY_POLICY.SHOPIFY_REFUND_NO_TX);
}

/** Enforce 1:1 warehouse ↔ Shopify location across a batch of mapping selections. */
export function assertOneToOneLocationSelections(selections = [], existingLinks = []) {
  const warehouseToLocation = new Map();
  const locationToWarehouse = new Map();

  for (const link of existingLinks) {
    const locId = String(link.shopify_location_id);
    const whId = Number(link.warehouse_id);
    if (whId) warehouseToLocation.set(whId, locId);
    if (whId) locationToWarehouse.set(locId, whId);
  }

  for (const sel of selections) {
    const locId = String(sel.shopifyLocationId);
    let warehouseId = null;

    if (sel.warehouseAction === "existing") {
      warehouseId = Number(sel.warehouseId) || null;
    } else if (sel.warehouseAction === "create") {
      continue;
    }

    if (!warehouseId) continue;

    const otherLoc = warehouseToLocation.get(warehouseId);
    if (otherLoc && otherLoc !== locId) {
      throw new Error(SHOPIFY_POLICY.WAREHOUSE_ALREADY_MAPPED);
    }

    const otherWh = locationToWarehouse.get(locId);
    if (otherWh && otherWh !== warehouseId) {
      throw new Error(SHOPIFY_POLICY.LOCATION_ALREADY_MAPPED);
    }

    warehouseToLocation.set(warehouseId, locId);
    locationToWarehouse.set(locId, warehouseId);
  }
}

export async function assertOneToOneLocationSelection(tenantId, storeId, selection, existingLinks = null) {
  const links = existingLinks || (await listLocationLinks(storeId));
  assertOneToOneLocationSelections([selection], links);
}
