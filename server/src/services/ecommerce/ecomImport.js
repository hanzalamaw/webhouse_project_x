import { writeDb, readDb } from "../../database/db.js";
import { normalizeShopifyProduct, normalizeShopifyOrder } from "../../normalizers/shopify.js";
import { inventoryRepository } from "../../repositories/inventoryRepository.js";
import { crmRepository } from "../../repositories/crmRepository.js";
import { orderRepository } from "../../repositories/orderRepository.js";
import { financeRepository } from "../../repositories/financeRepository.js";
import { TRANSACTION_TYPES } from "../../utils/financeConstants.js";
import {
  getSyncedRecords,
  getEntityCounts,
  addSyncLog,
  getEntityLink,
  upsertEntityLink,
  markSyncedRecordImported,
  updateErpImportStatus,
  updateExternalOrderInternalId,
  listLocationLinks,
  getStoreById,
  upsertSyncedRecord,
} from "../../repositories/ecommerceRepository.js";

const MARKETPLACE_CATEGORY = "Marketplace";
const DEFAULT_WAREHOUSE = "Main Warehouse";
const SAMPLE_LIMIT = 8;

const categoryCache = new Map();
const warehouseCache = new Map();
const importActorCache = new Map();

/** First active tenant user — used as actor for Shopify-imported after-sales records. */
async function getImportActorId(tenantId) {
  if (importActorCache.has(tenantId)) return importActorCache.get(tenantId);
  const [rows] = await readDb.query(
    `SELECT id FROM users WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
    [tenantId],
  );
  const id = rows[0]?.id;
  if (id) importActorCache.set(tenantId, id);
  return id;
}

async function syncCustomerAddressesFromShopify(tenantId, customerId, addresses = []) {
  if (!customerId || !Array.isArray(addresses) || !addresses.length) return;
  const customer = await crmRepository.getCustomer(tenantId, customerId);
  if (!customer) return;
  const existing = customer.addresses || [];

  const isDefaultRow = (a) => a?.is_default === true || a?.is_default === 1 || a?.is_default === "1";

  for (const addr of addresses) {
    const line = String(addr.address || "").trim();
    if (!line && !addr.city) continue;
    const data = {
      address_type: addr.is_default ? "default" : (addr.address_type || "other"),
      address: line,
      city: addr.city || null,
      state: addr.state || null,
      postal_code: addr.postal_code || null,
      country: addr.country || null,
      is_default: Boolean(addr.is_default),
    };
    const match = addr.is_default
      ? existing.find((a) => isDefaultRow(a))
      : existing.find((a) => a.address === line && (a.city || "") === (addr.city || ""));
    if (match?.id) {
      await crmRepository.updateAddress(tenantId, match.id, data);
    } else {
      await crmRepository.createAddress(tenantId, customerId, data);
    }
  }
}

function mapOrderShippingFields(normalized, existing = {}) {
  return {
    city: normalized.city || existing.city || null,
    delivery_address: normalized.deliveryAddress || existing.delivery_address || null,
    delivery_state: normalized.state || existing.delivery_state || null,
    delivery_postal_code: normalized.postalCode || existing.delivery_postal_code || null,
    delivery_country: normalized.country || existing.delivery_country || null,
    notes: normalized.note || existing.notes || null,
    tags: normalized.tags || existing.tags || null,
  };
}

function mapShopifyPaymentMethod(gateway) {
  const g = String(gateway || "").toLowerCase();
  if (g.includes("cash") || g.includes("cod")) return "cod";
  if (g.includes("bank")) return "bank_transfer";
  if (g.includes("card") || g.includes("stripe") || g.includes("paypal")) return "card";
  if (g) return "online";
  return "online";
}

/** Mirror cancelled/refunded Shopify orders into after-sales tables + finance records. */
async function syncAfterSalesFromShopify(tenantId, orderId, normalized, statuses) {
  const actorId = await getImportActorId(tenantId);
  if (!actorId) return;

  const orderStatus = String(statuses.orderStatus || "").toLowerCase();
  const paymentStatus = String(statuses.paymentStatus || "").toLowerCase();
  const source = normalized.platform || "shopify";
  const externalRef = `${String(source).toUpperCase()}-${normalized.externalId}`;

  if (orderStatus === "cancelled") {
    const existing = await orderRepository.listCancellations(tenantId);
    const reason = normalized.cancelReason
      ? `Imported from Shopify: ${normalized.cancelReason}`
      : `Imported from Shopify order #${normalized.externalId}`;
    const cancelledAt = normalized.cancelledAt || normalized.createdAt || null;
    const existingRow = existing.find((r) => Number(r.order_id) === Number(orderId));

    if (existingRow) {
      if (cancelledAt && String(existingRow.reason || "").includes("Imported from Shopify")) {
        await orderRepository.updateCancellation(tenantId, existingRow.id, {
          cancelled_at: toMysqlDateTime(cancelledAt),
        });
      }
    } else {
      await orderRepository.createCancellation(tenantId, actorId, {
        order_id: Number(orderId),
        reason,
        cancelled_at: cancelledAt ? toMysqlDateTime(cancelledAt) : undefined,
      });
    }
  }

  if (paymentStatus === "refunded") {
    const existingRefunds = await orderRepository.listRefunds(tenantId);
    const hasRefund = existingRefunds.some((r) => Number(r.order_id) === Number(orderId));
    if (!hasRefund) {
      const refundRows = Array.isArray(normalized.refunds) ? normalized.refunds : [];
      const refundAmount = refundRows.length
        ? refundRows.reduce((sum, r) => sum + Math.max(0, Number(r.amount) || 0), 0)
        : Math.max(0, Number(normalized.total) || 0);
      if (refundAmount > 0) {
        const refundNote = refundRows[0]?.note || `Imported from Shopify order #${normalized.externalId}`;
        await orderRepository.createRefund(tenantId, actorId, {
          order_id: Number(orderId),
          refund_amount: refundAmount,
          refund_method: "original_payment",
          refund_status: "processed",
          reason: refundNote,
          refunded_at: refundRows[0]?.createdAt ? new Date(refundRows[0].createdAt) : new Date(),
        });

        const [existingTx] = await readDb.query(
          `SELECT id FROM finance_transactions
           WHERE tenant_id = ? AND deleted_at IS NULL AND reference = ? LIMIT 1`,
          [tenantId, `Refund ${externalRef}`],
        );
        if (!existingTx.length) {
          await financeRepository.createTransaction(tenantId, {
            transaction_type: TRANSACTION_TYPES.ADJUSTMENT,
            amount: refundAmount,
            payment_method: mapShopifyPaymentMethod(normalized.transactions?.[0]?.gateway),
            reference: `Refund ${externalRef}`,
            notes: `Refund imported from Shopify order #${normalized.externalId}`,
            transaction_at: refundRows[0]?.createdAt || normalized.createdAt || new Date(),
          });
        }
      }
    }
  }
}

/** Record Shopify payments in order_payments + finance_transactions (idempotent). */
async function importFinanceFromShopify(tenantId, orderId, normalized, statuses) {
  const paymentStatus = String(statuses.paymentStatus || "").toLowerCase();
  if (!["paid", "partial"].includes(paymentStatus)) return;

  const source = normalized.platform || "shopify";
  const externalRef = `${String(source).toUpperCase()}-${normalized.externalId}`;
  const amount = Math.max(0, Number(normalized.total) || 0);
  if (!amount) return;

  const existingPayments = await orderRepository.listPaymentsForOrder(tenantId, orderId);
  const hasPaid = existingPayments.some((p) => ["paid", "partial"].includes(String(p.payment_status).toLowerCase()));
  if (!hasPaid) {
    const gateway = normalized.transactions?.find((t) => t.kind === "sale" || t.kind === "capture")?.gateway
      || normalized.transactions?.[0]?.gateway;
    await orderRepository.createPayment(tenantId, {
      payment_method: mapShopifyPaymentMethod(gateway),
      amount,
      payment_status: paymentStatus === "partial" ? "partial" : "paid",
      paid_at: normalized.createdAt ? new Date(normalized.createdAt) : new Date(),
      order_id: orderId,
    });
  }

  const [existingTx] = await readDb.query(
    `SELECT id FROM finance_transactions
     WHERE tenant_id = ? AND deleted_at IS NULL AND reference = ? LIMIT 1`,
    [tenantId, externalRef],
  );
  if (!existingTx.length) {
    const gateway = normalized.transactions?.find((t) => t.kind === "sale" || t.kind === "capture")?.gateway
      || normalized.transactions?.[0]?.gateway;
    await financeRepository.createTransaction(tenantId, {
      transaction_type: TRANSACTION_TYPES.CUSTOMER_PAYMENT,
      amount,
      payment_method: mapShopifyPaymentMethod(gateway),
      reference: externalRef,
      notes: `Payment imported from Shopify order #${normalized.externalId}`,
      transaction_at: normalized.createdAt || new Date(),
    });
  }
}

/** Convert a Shopify ISO timestamp to a MySQL DATETIME (UTC); null when missing/invalid. */
function toMysqlDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// table is an internal constant, never user input.
const CREATED_AT_TABLES = new Set(["orders", "crm_customers", "inventory_products"]);
/** Backfill the true marketplace creation date onto an already-imported row (re-sync repair). */
async function repairCreatedAt(table, id, tenantId, createdAtIso) {
  if (!CREATED_AT_TABLES.has(table) || !id) return;
  const dt = toMysqlDateTime(createdAtIso);
  if (!dt) return;
  await writeDb.query(
    `UPDATE ${table} SET created_at = ? WHERE id = ? AND tenant_id = ?`,
    [dt, id, tenantId],
  );
}

function mapProductStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["inactive", "deleted", "suspended", "rejected", "delisted"].includes(s)) {
    return "inactive";
  }
  return "active";
}

function resolveSku(normalized) {
  const sku = String(normalized.sku || "").trim();
  if (sku) return sku.slice(0, 100);
  const platform = normalized.platform || "ecom";
  return `${platform}:${normalized.externalId}`.slice(0, 100);
}

function shopifyVariantsForImport(normalized) {
  if (Array.isArray(normalized.variants) && normalized.variants.length) {
    return normalized.variants;
  }
  return [
    {
      externalId: normalized.externalId,
      sku: resolveSku(normalized),
      variant_name: normalized.name || "Default",
      price: normalized.price ?? 0,
      compareAtPrice: normalized.compareAtPrice ?? null,
      stock: normalized.stock ?? null,
      inventoryItemId: normalized.inventoryItemId ?? null,
      attributes: [],
    },
  ];
}

function resolveCostPriceFromShopify(shopifyVariant, fallback = 0) {
  if (shopifyVariant?.compareAtPrice != null && shopifyVariant.compareAtPrice !== "") {
    const parsed = Number(shopifyVariant.compareAtPrice);
    if (!Number.isNaN(parsed)) return Math.max(0, parsed);
  }
  return Math.max(0, Number(fallback) || 0);
}

/** Re-normalize from raw Shopify JSON when staging predates multi-variant import. */
function resolveProductNormalized(normalized, raw, platform = "shopify") {
  if (raw && String(platform || normalized?.platform || "shopify") === "shopify") {
    return normalizeShopifyProduct(raw);
  }
  if (Array.isArray(normalized?.variants) && normalized.variants.length) return normalized;
  return normalized || {};
}

/** Re-normalize orders from raw so removed lines (current_quantity=0) are dropped. */
function resolveOrderNormalized(normalized, raw, platform = "shopify") {
  if (raw && String(platform || normalized?.platform || "shopify") === "shopify") {
    return normalizeShopifyOrder(raw);
  }
  return normalized || {};
}

/** Create or update all Shopify variants (with option types) on an ERP product. */
async function syncShopifyProductVariants(tenantId, storeId, productId, normalized, { status = "active" } = {}) {
  const shopifyVariants = shopifyVariantsForImport(normalized);
  const existing = await inventoryRepository.getVariantsByProductId(tenantId, productId);
  const existingBySku = new Map(
    existing.map((v) => [String(v.sku || "").trim().toLowerCase(), v]),
  );

  for (const sv of shopifyVariants) {
    const sku = String(sv.sku || "").trim() || resolveSku({ ...normalized, externalId: sv.externalId });
    const sellingPrice = Math.max(0, Number(sv.price) || 0);
    const variantName = String(sv.variant_name || normalized.name || sku).trim();
    const match = existingBySku.get(sku.toLowerCase());

    let variantId;
    if (match) {
      const costPrice = resolveCostPriceFromShopify(sv, match.cost_price ?? 0);
      await inventoryRepository.updateVariant(tenantId, match.id, {
        sku,
        variant_name: variantName,
        cost_price: costPrice,
        selling_price: sellingPrice,
        status: status || match.status || "active",
      });
      variantId = match.id;
    } else {
      const costPrice = resolveCostPriceFromShopify(sv, 0);
      variantId = await inventoryRepository.createVariant(tenantId, {
        product_id: productId,
        sku,
        variant_name: variantName,
        cost_price: costPrice,
        selling_price: sellingPrice,
        status,
      });
      existingBySku.set(sku.toLowerCase(), { id: variantId, sku, cost_price: costPrice, status });
    }

    await inventoryRepository.setVariantAttributes(tenantId, variantId, sv.attributes || []);

    const stock =
      sv.stock != null && !Number.isNaN(Number(sv.stock))
        ? Math.max(0, Math.floor(Number(sv.stock)))
        : null;
    await applyProductStock(
      tenantId,
      storeId,
      variantId,
      { ...normalized, inventoryItemId: sv.inventoryItemId ?? normalized.inventoryItemId },
      stock,
    );
  }
}

// Maps Shopify order signals onto the ERP vocabularies:
//   order_status: pending | confirmed | processing | shipped | delivered | cancelled | returned
//   payment_status: unpaid | partial | paid | refunded | failed
//   fulfillment_status: unfulfilled | partial | fulfilled
const ORDER_STATUS_RANK = {
  pending: 1,
  confirmed: 2,
  processing: 3,
  shipped: 4,
  delivered: 5,
};

function preserveErpOrderStatus(existingStatus, incomingStatus) {
  const existing = String(existingStatus || "").toLowerCase();
  const incoming = String(incomingStatus || "").toLowerCase();
  if (["cancelled", "returned"].includes(existing)) return existing;
  const existingRank = ORDER_STATUS_RANK[existing] ?? 0;
  const incomingRank = ORDER_STATUS_RANK[incoming] ?? 0;
  return existingRank > incomingRank ? existing : incoming;
}

const PAYMENT_STATUS_RANK = {
  failed: 0,
  unpaid: 1,
  partial: 2,
  paid: 3,
  refunded: 4,
};

/** Don't let a lagging Shopify unpaid webhook wipe an ERP mark-as-paid. */
function preserveErpPaymentStatus(existingStatus, incomingStatus) {
  const existing = String(existingStatus || "").toLowerCase();
  const incoming = String(incomingStatus || "").toLowerCase();
  if (incoming === "refunded" || incoming === "failed") return incoming;
  const existingRank = PAYMENT_STATUS_RANK[existing] ?? 0;
  const incomingRank = PAYMENT_STATUS_RANK[incoming] ?? 0;
  return existingRank > incomingRank ? existing : incoming;
}

function mapOrderStatuses(normalized) {
  const financial = String(normalized.financialStatus || "").toLowerCase();
  const fulfillment = String(normalized.fulfillmentStatus || "").toLowerCase();
  // Fallback for older records that only stored the collapsed `status` string.
  const raw = String(normalized.status || "").toLowerCase();
  const isCancelled = Boolean(normalized.cancelledAt) || raw.includes("cancel");

  // Payment
  let paymentStatus = "unpaid";
  if (financial === "paid" || raw === "paid") paymentStatus = "paid";
  else if (financial === "partially_paid") paymentStatus = "partial";
  else if (financial === "refunded" || financial === "partially_refunded" || raw.includes("refund")) paymentStatus = "refunded";
  else if (financial === "voided") paymentStatus = "failed";

  // Fulfillment
  let fulfillmentStatus = "unfulfilled";
  if (fulfillment === "fulfilled" || raw.includes("fulfilled") || raw.includes("delivered")) {
    fulfillmentStatus = "fulfilled";
  } else if (fulfillment === "partial" || raw.includes("shipped")) {
    fulfillmentStatus = "partial";
  }

  // Overall order status — cancellation takes priority.
  let orderStatus;
  if (isCancelled) {
    orderStatus = "cancelled";
  } else if (fulfillmentStatus === "fulfilled") {
    orderStatus = "delivered";
  } else if (fulfillmentStatus === "partial") {
    orderStatus = "shipped";
  } else if (paymentStatus === "paid") {
    orderStatus = "confirmed";
  } else {
    orderStatus = "pending";
  }

  return { orderStatus, paymentStatus, fulfillmentStatus };
}

function summarizeRecord(entityType, normalized, action, extra = {}) {
  const base = {
    externalId: normalized.externalId,
    platform: normalized.platform,
    action,
    ...extra,
  };
  if (entityType === "product") {
    return {
      ...base,
      name: normalized.name,
      sku: resolveSku(normalized),
      price: normalized.price,
      stock: normalized.stock,
    };
  }
  if (entityType === "customer") {
    return {
      ...base,
      name: normalized.name,
      email: normalized.email,
      phone: normalized.phone,
    };
  }
  return {
    ...base,
    orderNo: `${String(normalized.platform || "ecom").toUpperCase()}-${normalized.externalId}`,
    customer: normalized.customer?.name,
    total: normalized.total,
    status: normalized.status,
    itemCount: normalized.items?.length || 0,
  };
}

async function ensureMarketplaceCategory(tenantId) {
  if (categoryCache.has(tenantId)) return categoryCache.get(tenantId);

  let cat = await inventoryRepository.findCategoryByName(tenantId, MARKETPLACE_CATEGORY);
  if (!cat) {
    const id = await inventoryRepository.createCategory(tenantId, {
      category_name: MARKETPLACE_CATEGORY,
      status: "active",
    });
    categoryCache.set(tenantId, id);
    return id;
  }

  categoryCache.set(tenantId, cat.id);
  return cat.id;
}

async function ensureDefaultWarehouse(tenantId) {
  if (warehouseCache.has(tenantId)) return warehouseCache.get(tenantId);

  const warehouses = await inventoryRepository.listAllWarehousesBrief(tenantId);
  const active = warehouses.find((w) => w.status === "active") || warehouses[0];
  if (active) {
    warehouseCache.set(tenantId, active.id);
    return active.id;
  }

  const id = await inventoryRepository.createWarehouse(tenantId, {
    warehouse_name: DEFAULT_WAREHOUSE,
    location: null,
    city: null,
    status: "active",
  });
  warehouseCache.set(tenantId, id);
  return id;
}

/** Primary warehouse mapped to this store's Shopify/Daraz locations (fallback: tenant default). */
async function resolveStoreWarehouse(tenantId, storeId) {
  if (storeId) {
    const links = await listLocationLinks(storeId);
    const linked = links.find((l) => l.warehouse_id);
    if (linked) return linked.warehouse_id;
  }
  return ensureDefaultWarehouse(tenantId);
}

async function getStoreLocationWarehouses(storeId) {
  const links = await listLocationLinks(storeId);
  const map = new Map();
  for (const l of links) {
    if (l.warehouse_id) map.set(String(l.shopify_location_id), l.warehouse_id);
  }
  return map;
}

// Short-lived cache so a full import loop doesn't re-scan inventory rows per product.
const inventoryMapCache = new Map();
async function getStoreInventoryByItem(storeId, tenantId) {
  const cached = inventoryMapCache.get(storeId);
  if (cached && Date.now() - cached.at < 15000) return cached.map;

  const records = await getSyncedRecords(storeId, tenantId, "inventory", 5000);
  const map = new Map();
  for (const r of records) {
    const n = r.normalized || {};
    const itemId = String(n.inventoryItemId ?? "");
    if (!itemId) continue;
    if (!map.has(itemId)) map.set(itemId, []);
    map.get(itemId).push({ locationId: String(n.locationId), available: Number(n.available) || 0 });
  }
  inventoryMapCache.set(storeId, { at: Date.now(), map });
  return map;
}

/**
 * Place a store product's stock into the warehouse(s) mapped to its Shopify location(s).
 * - Uses real per-location inventory levels when available.
 * - Otherwise puts the aggregate into the store's mapped warehouse (never an unrelated default).
 * - Clears any stale stock this product left in non-store warehouses (fixes the "old warehouse" case).
 */
async function applyProductStock(tenantId, storeId, variantId, normalized, aggregateStock) {
  if (!variantId) return;

  const locWarehouses = storeId ? await getStoreLocationWarehouses(storeId) : new Map();
  const storeWarehouseIds = new Set([...locWarehouses.values()]);

  let placedAny = false;
  if (storeId && normalized.inventoryItemId) {
    const invByItem = await getStoreInventoryByItem(storeId, tenantId);
    const levels = invByItem.get(String(normalized.inventoryItemId)) || [];
    for (const lvl of levels) {
      const warehouseId = locWarehouses.get(String(lvl.locationId));
      if (!warehouseId) continue;
      await inventoryRepository.setStockLevelAbsolute(tenantId, variantId, warehouseId, {
        available_qty: Math.max(0, Math.floor(lvl.available)),
        reserved_qty: 0,
        damaged_qty: 0,
      });
      placedAny = true;
    }
  }

  // Daraz multi-warehouse inventories (WarehouseCode → ERP warehouse via location links).
  if (!placedAny && storeId && Array.isArray(normalized.inventoryLevels) && normalized.inventoryLevels.length) {
    for (const lvl of normalized.inventoryLevels) {
      const warehouseId = locWarehouses.get(String(lvl.locationId));
      if (!warehouseId) continue;
      await inventoryRepository.setStockLevelAbsolute(tenantId, variantId, warehouseId, {
        available_qty: Math.max(0, Math.floor(Number(lvl.available) || 0)),
        reserved_qty: 0,
        damaged_qty: 0,
      });
      placedAny = true;
    }
  }

  if (!placedAny && aggregateStock !== null) {
    const warehouseId = await resolveStoreWarehouse(tenantId, storeId);
    await inventoryRepository.setStockLevelAbsolute(tenantId, variantId, warehouseId, {
      available_qty: aggregateStock,
      reserved_qty: 0,
      damaged_qty: 0,
    });
    storeWarehouseIds.add(warehouseId);
  }

  // A store product's stock should only live in its store-mapped warehouses.
  // Zero out anything left behind elsewhere (e.g. a previously used default warehouse).
  if (storeId && storeWarehouseIds.size) {
    const levels = await inventoryRepository.getVariantStockLevels(tenantId, variantId);
    for (const lvl of levels) {
      if (storeWarehouseIds.has(lvl.warehouse_id)) continue;
      if (!lvl.available_qty && !lvl.reserved_qty && !lvl.damaged_qty) continue;
      await inventoryRepository.setStockLevelAbsolute(tenantId, variantId, lvl.warehouse_id, {
        available_qty: 0,
        reserved_qty: 0,
        damaged_qty: 0,
      });
    }
  }
}

async function classifyProduct(tenantId, storeId, normalized) {
  const link = await getEntityLink(storeId, "product", normalized.externalId);
  if (link) return { action: "already_imported", existingId: link.internal_id };

  const sku = resolveSku(normalized);
  const existing = await inventoryRepository.findVariantBySku(tenantId, sku);
  if (!existing) return { action: "create" };

  const product = await inventoryRepository.getProductById(tenantId, existing.product_id);
  const source = product?.source || "manual";
  if (source === "manual") return { action: "skip", reason: "SKU matches a manually added product" };
  if (source === normalized.platform) {
    return { action: "update", existingId: existing.product_id, variantId: existing.id };
  }
  return { action: "skip", reason: `SKU matches a product from ${source}` };
}

async function classifyCustomer(tenantId, storeId, normalized) {
  const link = await getEntityLink(storeId, "customer", normalized.externalId);
  if (link) return { action: "already_imported", existingId: link.internal_id };

  const match = await crmRepository.findCustomerByPhoneOrEmail(
    tenantId,
    normalized.phone,
    normalized.email,
  );
  if (!match) return { action: "create" };

  const source = match.source || "manual";
  if (source === "manual" || source === normalized.platform) {
    return { action: "update", existingId: match.id };
  }
  return { action: "skip", reason: `Matches a customer from ${source}`, existingId: match.id };
}

async function classifyOrder(storeId, normalized) {
  const link = await getEntityLink(storeId, "order", normalized.externalId);
  if (link) return { action: "update", existingId: link.internal_id };
  return { action: "create" };
}

async function ensureCustomerShopifyLink(tenantId, storeId, platform, customerId, normalized) {
  const externalId = normalized?.customer?.externalId;
  if (!storeId || !customerId || !externalId) return;
  const source = platform || normalized.platform || "shopify";
  await upsertEntityLink({
    tenantId,
    storeId,
    platform: source,
    entityType: "customer",
    externalId: String(externalId),
    internalId: customerId,
  });
  await writeDb.query(
    `UPDATE crm_customers SET source = ?
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
       AND (source IS NULL OR source = '' OR source = 'manual')`,
    [source, customerId, tenantId],
  );
}

/**
 * Resolve the ERP customer for an order, in priority order:
 *  1. Entity link by the order's Shopify customer id (most reliable, incl. guest checkouts).
 *  2. Same-run staged customer map (by email).
 *  3. Existing ERP customer matched by phone/email.
 *  4. Create a new customer from the order's customer info and link it.
 * Always links the resolved customer to Shopify so both sides stay aligned.
 */
async function resolveOrderCustomerId(tenantId, storeId, platform, normalized, customerIdMap = {}) {
  const cust = normalized?.customer;
  if (!cust) return null;
  const source = platform || normalized.platform || "shopify";

  if (storeId && cust.externalId) {
    const link = await getEntityLink(storeId, "customer", cust.externalId);
    if (link) return link.internal_id;
  }

  if (cust.email && customerIdMap[cust.email]) {
    const id = customerIdMap[cust.email];
    await ensureCustomerShopifyLink(tenantId, storeId, source, id, normalized);
    return id;
  }

  const match = await crmRepository.findCustomerByPhoneOrEmail(tenantId, cust.phone, cust.email);
  if (match?.id) {
    await ensureCustomerShopifyLink(tenantId, storeId, source, match.id, normalized);
    return match.id;
  }

  // Nothing matched — create a customer from the order's customer info so the order isn't orphaned.
  if (cust.name || cust.email || cust.phone || cust.externalId) {
    const created = await crmRepository.createCustomer(tenantId, null, {
      customer_name: cust.name || cust.email || "Guest customer",
      phone: cust.phone || null,
      email: cust.email || null,
      status: "active",
      customer_type: "retailer",
      source,
      created_at: toMysqlDateTime(normalized.createdAt),
    });
    if (created?.id) {
      await ensureCustomerShopifyLink(tenantId, storeId, source, created.id, normalized);
      if (cust.email) customerIdMap[cust.email] = created.id;
      return created.id;
    }
  }

  return null;
}

async function buildEntityPreview(storeId, tenantId, entityType) {
  const records = await getSyncedRecords(storeId, tenantId, entityType, 5000, { importStatus: "staged" });
  const summary = { create: 0, update: 0, skip: 0, already_imported: 0 };
  const samples = { create: [], update: [], skip: [], already_imported: [] };

  for (const record of records) {
    const normalized = record.normalized;
    let classification;
    if (entityType === "product") {
      classification = await classifyProduct(tenantId, storeId, normalized);
    } else if (entityType === "customer") {
      classification = await classifyCustomer(tenantId, storeId, normalized);
    } else {
      classification = await classifyOrder(storeId, normalized);
    }

    const action = classification.action;
    summary[action] = (summary[action] || 0) + 1;
    if (samples[action]?.length < SAMPLE_LIMIT) {
      samples[action].push(
        summarizeRecord(entityType, normalized, action, {
          reason: classification.reason,
          existingId: classification.existingId,
        }),
      );
    }
  }

  return { total: records.length, summary, samples };
}

export async function getImportPreview(storeId, tenantId) {
  const [products, customers, orders] = await Promise.all([
    buildEntityPreview(storeId, tenantId, "product"),
    buildEntityPreview(storeId, tenantId, "customer"),
    buildEntityPreview(storeId, tenantId, "order"),
  ]);

  const pendingTotal =
    products.summary.create +
    products.summary.update +
    customers.summary.create +
    customers.summary.update +
    orders.summary.create +
    orders.summary.update;

  return {
    products,
    customers,
    orders,
    pendingImportCount: pendingTotal,
    hasPendingImport: pendingTotal > 0,
  };
}

export async function importNormalizedProduct(
  tenantId,
  normalized,
  { storeId, platform, allowUpdate = true } = {},
) {
  if (!normalized?.externalId) return { ok: false, reason: "missing_external_id" };

  const classification = storeId
    ? await classifyProduct(tenantId, storeId, normalized)
    : { action: "create" };

  if (classification.action === "already_imported") {
    const current = await inventoryRepository.getProductById(tenantId, classification.existingId);
    const status = mapProductStatus(normalized.status);
    await inventoryRepository.updateProduct(tenantId, classification.existingId, {
      product_name: String(normalized.name || "").trim() || current?.product_name,
      description: normalized.description ?? current?.description ?? null,
      unit: current?.unit || "piece",
      delivery_charges: current?.delivery_charges ?? 0,
      discount: current?.discount ?? 0,
      tax: current?.tax ?? 0,
      status,
      category_id: current?.category_id ?? (await ensureMarketplaceCategory(tenantId)),
      source: platform || normalized.platform || current?.source || "shopify",
    });
    await syncShopifyProductVariants(tenantId, storeId, classification.existingId, normalized, { status });
    await repairCreatedAt("inventory_products", classification.existingId, tenantId, normalized.createdAt);
    return { ok: true, productId: classification.existingId, action: "already_imported" };
  }
  if (classification.action === "skip") {
    return { ok: false, action: "skip", reason: classification.reason };
  }
  if (classification.action === "update" && !allowUpdate) {
    return { ok: false, action: "skip", reason: "Update not requested" };
  }

  try {
    const categoryId = await ensureMarketplaceCategory(tenantId);
    const productName =
      String(normalized.name || "").trim() ||
      `${String(normalized.platform || "Marketplace")} product ${normalized.externalId}`;
    const status = mapProductStatus(normalized.status);
    const source = platform || normalized.platform || "shopify";

    let productId;

    if (classification.action === "update") {
      const current = await inventoryRepository.getProductById(tenantId, classification.existingId);
      await inventoryRepository.updateProduct(tenantId, classification.existingId, {
        product_name: productName,
        description: normalized.description || current?.description || null,
        unit: current?.unit || "piece",
        delivery_charges: current?.delivery_charges ?? 0,
        discount: current?.discount ?? 0,
        tax: current?.tax ?? 0,
        status,
        category_id: current?.category_id ?? categoryId,
        source,
      });
      productId = classification.existingId;
      await repairCreatedAt("inventory_products", productId, tenantId, normalized.createdAt);
    } else {
      productId = await inventoryRepository.createProduct(tenantId, {
        product_name: productName,
        description: normalized.description || null,
        unit: "piece",
        delivery_charges: 0,
        discount: 0,
        tax: 0,
        status,
        category_id: categoryId,
        source,
        created_at: toMysqlDateTime(normalized.createdAt),
      });
    }

    await syncShopifyProductVariants(tenantId, storeId, productId, normalized, { status });

    if (storeId) {
      await upsertEntityLink({
        tenantId,
        storeId,
        platform: source,
        entityType: "product",
        externalId: normalized.externalId,
        internalId: productId,
      });
      await markSyncedRecordImported(storeId, tenantId, "product", normalized.externalId);
    }

    return { ok: true, productId, action: classification.action === "update" ? "update" : "create" };
  } catch (error) {
    if (storeId) {
      await addSyncLog(storeId, tenantId, {
        syncType: "erp_import:product",
        status: "failed",
        externalId: String(normalized.externalId),
        message: error.message || "Failed to import product",
      });
    }
    console.error("[ecomImport] product", normalized.externalId, error.message);
    return { ok: false, reason: error.message };
  }
}

export async function importNormalizedCustomer(tenantId, normalized, { storeId, platform } = {}) {
  if (!normalized?.externalId) return { ok: false, reason: "missing_external_id" };

  const classification = storeId
    ? await classifyCustomer(tenantId, storeId, normalized)
    : { action: "create" };

  if (classification.action === "already_imported") {
    const source = platform || normalized.platform || "shopify";
    const payload = {
      customer_name: normalized.name || "Unknown",
      company_name: normalized.company_name || null,
      phone: normalized.phone || null,
      email: normalized.email || null,
      status: "active",
      customer_type: "retailer",
      note: normalized.note || null,
      tags: normalized.tags
        ? String(normalized.tags).split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      source,
    };
    await crmRepository.updateCustomer(tenantId, null, classification.existingId, payload);
    if (storeId) {
      await upsertEntityLink({
        tenantId,
        storeId,
        platform: source,
        entityType: "customer",
        externalId: normalized.externalId,
        internalId: classification.existingId,
      });
      await markSyncedRecordImported(storeId, tenantId, "customer", normalized.externalId);
    }
    await repairCreatedAt("crm_customers", classification.existingId, tenantId, normalized.createdAt);
    await syncCustomerAddressesFromShopify(tenantId, classification.existingId, normalized.addresses);
    return { ok: true, customerId: classification.existingId, action: "already_imported" };
  }
  if (classification.action === "skip") {
    return { ok: false, action: "skip", reason: classification.reason };
  }

  try {
    const source = platform || normalized.platform || "shopify";
    const payload = {
      customer_name: normalized.name || "Unknown",
      company_name: normalized.company_name || null,
      phone: normalized.phone || null,
      email: normalized.email || null,
      status: "active",
      customer_type: "retailer",
      note: normalized.note || null,
      tags: normalized.tags
        ? String(normalized.tags).split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      source,
      created_at: toMysqlDateTime(normalized.createdAt),
    };

    let customerId;
    if (classification.action === "update") {
      await crmRepository.updateCustomer(tenantId, null, classification.existingId, payload);
      customerId = classification.existingId;
      await repairCreatedAt("crm_customers", customerId, tenantId, normalized.createdAt);
    } else {
      const created = await crmRepository.createCustomer(tenantId, null, payload);
      customerId = created.id;
    }

    if (storeId) {
      await upsertEntityLink({
        tenantId,
        storeId,
        platform: source,
        entityType: "customer",
        externalId: normalized.externalId,
        internalId: customerId,
      });
      await markSyncedRecordImported(storeId, tenantId, "customer", normalized.externalId);
    }

    await syncCustomerAddressesFromShopify(tenantId, customerId, normalized.addresses);

    return { ok: true, customerId, action: classification.action === "update" ? "update" : "create" };
  } catch (error) {
    if (storeId) {
      await addSyncLog(storeId, tenantId, {
        syncType: "erp_import:customer",
        status: "failed",
        externalId: String(normalized.externalId),
        message: error.message || "Failed to import customer",
      });
    }
    return { ok: false, reason: error.message };
  }
}

export async function importNormalizedOrder(
  tenantId,
  normalized,
  { storeId, platform, customerIdMap = {} } = {},
) {
  if (!normalized?.externalId) return { ok: false, reason: "missing_external_id" };

  const classification = storeId
    ? await classifyOrder(storeId, normalized)
    : { action: "create" };

  if (classification.action === "update") {
    return updateNormalizedOrder(tenantId, classification.existingId, normalized, {
      storeId,
      platform,
      customerIdMap,
    });
  }

  try {
    const source = platform || normalized.platform || "shopify";
    const orderNo = `${String(source).toUpperCase()}-${normalized.externalId}`;
    const statuses = mapOrderStatuses(normalized);
    const total = Math.max(0, Number(normalized.total) || 0);

    const customerId = await resolveOrderCustomerId(tenantId, storeId, platform, normalized, customerIdMap);
    const shipping = mapOrderShippingFields(normalized);

    const [result] = await writeDb.query(
      `INSERT INTO orders
         (order_no, order_source, order_status, payment_status, fulfillment_status,
          total_amount, discount_amount, delivery_charges, payable_amount,
          city, delivery_address, delivery_state, delivery_postal_code, delivery_country,
          notes, tags, customer_id, tenant_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [
        orderNo,
        source,
        statuses.orderStatus,
        statuses.paymentStatus,
        statuses.fulfillmentStatus,
        total,
        total,
        shipping.city,
        shipping.delivery_address,
        shipping.delivery_state,
        shipping.delivery_postal_code,
        shipping.delivery_country,
        shipping.notes || `Imported from ${source} (#${normalized.externalId})`,
        shipping.tags,
        customerId,
        tenantId,
        toMysqlDateTime(normalized.createdAt),
      ],
    );
    const orderId = result.insertId;

    for (const item of normalized.items || []) {
      let productId = null;
      const sku = String(item.sku || "").trim();
      if (sku) {
        const found = await inventoryRepository.findVariantBySkuLoose(tenantId, sku)
          || (/^\d+$/.test(sku)
            ? await inventoryRepository.findVariantBySkuLoose(tenantId, `shopify:${sku}`)
            : null);
        productId = found?.product_id || null;
      }
      const qty = Math.max(0, Math.floor(Number(item.qty) || 0));
      if (qty <= 0) continue;
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      await writeDb.query(
        `INSERT INTO order_items
           (product_name, sku, quantity, unit_price, discount, total_price, order_id, product_id, tenant_id)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          item.name || sku || "Item",
          sku || "—",
          qty,
          unitPrice,
          unitPrice * qty,
          orderId,
          productId,
          tenantId,
        ],
      );
    }

    if (storeId) {
      await upsertEntityLink({
        tenantId,
        storeId,
        platform: source,
        entityType: "order",
        externalId: normalized.externalId,
        internalId: orderId,
      });
      await ensureCustomerShopifyLink(tenantId, storeId, platform, customerId, normalized);
      await markSyncedRecordImported(storeId, tenantId, "order", normalized.externalId);
      await updateExternalOrderInternalId(storeId, normalized.externalId, orderId);
    }

    await importFinanceFromShopify(tenantId, orderId, normalized, statuses);
    await syncAfterSalesFromShopify(tenantId, orderId, normalized, statuses);

    return { ok: true, orderId, action: "create" };
  } catch (error) {
    if (storeId) {
      await addSyncLog(storeId, tenantId, {
        syncType: "erp_import:order",
        status: "failed",
        externalId: String(normalized.externalId),
        message: error.message || "Failed to import order",
      });
    }
    return { ok: false, reason: error.message };
  }
}

async function updateNormalizedOrder(
  tenantId,
  orderId,
  normalized,
  { storeId, platform, customerIdMap = {} } = {},
) {
  try {
    const source = platform || normalized.platform || "shopify";
    const statuses = mapOrderStatuses(normalized);
    const total = Math.max(0, Number(normalized.total) || 0);

    const customerId = await resolveOrderCustomerId(tenantId, storeId, platform, normalized, customerIdMap);

    const existing = await orderRepository.getOrder(tenantId, orderId);
    if (!existing) return { ok: false, reason: "order_not_found" };

    const shipping = mapOrderShippingFields(normalized, existing);
    const orderStatus = preserveErpOrderStatus(existing.order_status, statuses.orderStatus);
    const paymentStatus = preserveErpPaymentStatus(existing.payment_status, statuses.paymentStatus);

    await orderRepository.updateOrder(tenantId, orderId, {
      order_source: existing.order_source || source,
      order_status: orderStatus,
      payment_status: paymentStatus,
      fulfillment_status: statuses.fulfillmentStatus,
      total_amount: total,
      discount_amount: existing.discount_amount ?? 0,
      delivery_charges: existing.delivery_charges ?? 0,
      payable_amount: total,
      city: shipping.city,
      delivery_address: shipping.delivery_address,
      delivery_state: shipping.delivery_state,
      delivery_postal_code: shipping.delivery_postal_code,
      delivery_country: shipping.delivery_country,
      notes: shipping.notes || existing.notes || `Synced from ${source} (#${normalized.externalId})`,
      tags: shipping.tags,
      customer_id: customerId ?? existing.customer_id,
    });
    await repairCreatedAt("orders", orderId, tenantId, normalized.createdAt);

    const items = [];
    for (const item of normalized.items || []) {
      const qty = Math.max(0, Math.floor(Number(item.qty) || 0));
      if (qty <= 0) continue;
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      const sku = String(item.sku || "").trim();
      let productId = null;
      if (sku) {
        const found = await inventoryRepository.findVariantBySkuLoose(tenantId, sku)
          || (/^\d+$/.test(sku)
            ? await inventoryRepository.findVariantBySkuLoose(tenantId, `shopify:${sku}`)
            : null);
        productId = found?.product_id || null;
      }
      items.push({
        product_name: item.name || sku || "Item",
        sku: sku || "—",
        quantity: qty,
        unit_price: unitPrice,
        discount: 0,
        total_price: unitPrice * qty,
        product_id: productId,
      });
    }
    // Always replace so removed Shopify lines (qty 0 / Removed) disappear from ERP.
    await orderRepository.replaceOrderItems(tenantId, orderId, items);

    if (storeId) {
      const resolvedCustomerId = customerId ?? existing.customer_id;
      await ensureCustomerShopifyLink(tenantId, storeId, platform, resolvedCustomerId, normalized);
      await markSyncedRecordImported(storeId, tenantId, "order", normalized.externalId);
      await updateExternalOrderInternalId(storeId, normalized.externalId, orderId);
    }

    await importFinanceFromShopify(tenantId, orderId, normalized, statuses);
    await syncAfterSalesFromShopify(tenantId, orderId, normalized, statuses);

    return { ok: true, orderId, action: "update" };
  } catch (error) {
    if (storeId) {
      await addSyncLog(storeId, tenantId, {
        syncType: "erp_import:order",
        status: "failed",
        externalId: String(normalized.externalId),
        message: error.message || "Failed to update order",
      });
    }
    return { ok: false, reason: error.message };
  }
}

export async function applyResolvedOrderToErp(storeId, tenantId, externalId) {
  const [rows] = await readDb.query(
    `SELECT normalized_json FROM ecom_synced_records
     WHERE store_id = ? AND tenant_id = ? AND entity_type = 'order' AND external_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [storeId, tenantId, String(externalId)],
  );
  if (!rows[0]) return { ok: false, reason: "not_found" };
  let normalized;
  try {
    normalized = JSON.parse(rows[0].normalized_json);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  return importNormalizedOrder(tenantId, normalized, { storeId, platform: "shopify" });
}

async function importEntityType(storeId, tenantId, entityType, platform, options = {}) {
  const records = await getSyncedRecords(storeId, tenantId, entityType, 5000, { importStatus: "staged" });
  const result = { created: 0, updated: 0, skipped: 0, failed: 0, already_imported: 0 };
  const customerIdMap = {};

  if (entityType === "customer" || entityType === "order") {
    const customerRecords = entityType === "order"
      ? await getSyncedRecords(storeId, tenantId, "customer", 5000, { importStatus: "staged" })
      : [];
    for (const rec of customerRecords) {
      const imp = await importNormalizedCustomer(tenantId, rec.normalized, { storeId, platform });
      if (imp.ok && rec.normalized.email) {
        customerIdMap[rec.normalized.email] = imp.customerId;
      }
    }
  }

  for (const record of records) {
    let imp;
    if (entityType === "product") {
      const normalized = resolveProductNormalized(record.normalized, record.raw, platform);
      imp = await importNormalizedProduct(tenantId, normalized, {
        storeId,
        platform,
        allowUpdate: options.updateExisting !== false,
      });
    } else if (entityType === "customer") {
      imp = await importNormalizedCustomer(tenantId, record.normalized, { storeId, platform });
    } else {
      const normalized = resolveOrderNormalized(record.normalized, record.raw, platform);
      imp = await importNormalizedOrder(tenantId, normalized, {
        storeId,
        platform,
        customerIdMap,
      });
    }

    if (!imp.ok) {
      if (imp.action === "skip") result.skipped += 1;
      else result.failed += 1;
      continue;
    }
    if (imp.action === "already_imported") result.already_imported += 1;
    else if (imp.action === "update") result.updated += 1;
    else result.created += 1;
  }

  return result;
}

/** Backfill customer ↔ Shopify links from imported order raw payloads. */
export async function repairCustomerLinksFromOrders(tenantId, storeId) {
  const [rows] = await readDb.query(
    `SELECT el.internal_id AS order_id, sr.raw_json
     FROM ecom_entity_links el
     INNER JOIN ecom_synced_records sr
       ON sr.store_id = el.store_id
       AND sr.tenant_id = el.tenant_id
       AND sr.entity_type = 'order'
       AND sr.external_id = el.external_id
       AND sr.deleted_at IS NULL
     WHERE el.tenant_id = ? AND el.store_id = ? AND el.entity_type = 'order' AND el.deleted_at IS NULL`,
    [tenantId, storeId],
  );

  let repaired = 0;
  for (const row of rows) {
    let raw;
    try {
      raw = typeof row.raw_json === "string" ? JSON.parse(row.raw_json) : row.raw_json;
    } catch {
      continue;
    }
    const customerExternalId = raw?.customer?.id;
    if (!customerExternalId) continue;

    const order = await orderRepository.getOrder(tenantId, row.order_id);
    if (!order?.customer_id) continue;

    await ensureCustomerShopifyLink(tenantId, storeId, "shopify", order.customer_id, {
      platform: "shopify",
      customer: { externalId: String(customerExternalId) },
    });
    repaired += 1;
  }
  return { repaired };
}

export async function importEntitiesToErp(storeId, tenantId, platform, entities = [], options = {}) {
  const allowed = new Set(["product", "customer", "order"]);
  const types = entities.filter((e) => allowed.has(e));
  if (!types.length) {
    return { success: false, error: "No valid entity types selected" };
  }

  await updateErpImportStatus(storeId, tenantId, "in_progress");
  const results = {};

  for (const entityType of types) {
    results[entityType] = await importEntityType(storeId, tenantId, entityType, platform, options);
    await addSyncLog(storeId, tenantId, {
      syncType: `erp_import:${entityType}`,
      status: results[entityType].failed ? "partial" : "success",
      message: `${entityType}: created ${results[entityType].created}, updated ${results[entityType].updated}, skipped ${results[entityType].skipped}`,
    });
  }

  const preview = await getImportPreview(storeId, tenantId);
  const finalStatus = preview.hasPendingImport ? "partial" : "completed";
  await updateErpImportStatus(storeId, tenantId, finalStatus);

  let customerLinksRepaired = { repaired: 0 };
  if (types.includes("order") || types.includes("customer")) {
    customerLinksRepaired = await repairCustomerLinksFromOrders(tenantId, storeId);
  }

  return { success: true, results, erpImportStatus: finalStatus, customerLinksRepaired };
}

export async function importAllSyncedProductsForStore(storeId, tenantId, platform) {
  return importEntityType(storeId, tenantId, "product", platform);
}

export async function maybeUpdateLinkedProduct(tenantId, storeId, normalized) {
  const link = await getEntityLink(storeId, "product", normalized.externalId);
  if (!link) return null;
  return importNormalizedProduct(tenantId, normalized, {
    storeId,
    platform: normalized.platform,
    allowUpdate: true,
  });
}

/** Resolve ERP variant from a Shopify inventory_item_id using staged product data. */
async function findErpVariantByShopifyInventoryItem(tenantId, storeId, inventoryItemId) {
  const itemId = String(inventoryItemId ?? "");
  if (!itemId) return null;

  const products = await getSyncedRecords(storeId, tenantId, "product", 5000);
  for (const rec of products) {
    const normalized = resolveProductNormalized(rec.normalized || {}, rec.raw, rec.platform);
    const sv = (normalized.variants || []).find((v) => String(v.inventoryItemId) === itemId);
    if (!sv) continue;
    const link = await getEntityLink(storeId, "product", normalized.externalId);
    if (!link) continue;
    const erpVariants = await inventoryRepository.getVariantsByProductId(tenantId, link.internal_id);
    const skuKey = String(sv.sku || "").trim().toLowerCase();
    const match = erpVariants.find((v) => String(v.sku || "").trim().toLowerCase() === skuKey);
    if (match) return { variantId: match.id, productId: link.internal_id };
  }
  return null;
}

/** Apply a Shopify inventory_levels/update webhook (or poll) to ERP stock. */
export async function syncInventoryLevelToErp(tenantId, storeId, normalized) {
  const match = await findErpVariantByShopifyInventoryItem(tenantId, storeId, normalized.inventoryItemId);
  if (!match) return { ok: false, skipped: true, reason: "not_linked" };

  const locWarehouses = await getStoreLocationWarehouses(storeId);
  const warehouseId = locWarehouses.get(String(normalized.locationId));
  if (!warehouseId) {
    const fallback = await resolveStoreWarehouse(tenantId, storeId);
    if (!fallback) return { ok: false, reason: "no_warehouse" };
    await inventoryRepository.setStockLevelAbsolute(tenantId, match.variantId, fallback, {
      available_qty: Math.max(0, Math.floor(Number(normalized.available) || 0)),
      reserved_qty: 0,
      damaged_qty: 0,
    });
    return { ok: true, variantId: match.variantId, warehouseId: fallback };
  }

  await inventoryRepository.setStockLevelAbsolute(tenantId, match.variantId, warehouseId, {
    available_qty: Math.max(0, Math.floor(Number(normalized.available) || 0)),
    reserved_qty: 0,
    damaged_qty: 0,
  });
  return { ok: true, variantId: match.variantId, warehouseId };
}

export async function getEntityCountsForImport(storeId, tenantId) {
  return getEntityCounts(storeId, tenantId);
}

/**
 * Repair already-imported ERP records from the data already fetched into staging.
 * Fixes: wrong created dates, and stock stuck in the wrong warehouse (re-places into the
 * warehouse mapped to the record's Shopify location, or the store's mapped warehouse).
 * Runs synchronously (safe to await) and only touches records linked to this store,
 * so it never creates duplicates. Returns real counts for user feedback.
 */
export async function reconcileImportedData(storeId, tenantId) {
  const result = { products: 0, customers: 0, orders: 0, failed: 0, removed: 0 };
  if (!storeId) return result;

  const store = await getStoreById(storeId, tenantId);
  let shopifyRest = null;
  if (store?.store_url && store?.access_token) {
    const { shopifyClient } = await import("./shopifyClient.js");
    shopifyRest = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  }

  // Drop ERP products that were deleted in Shopify (404) but still linked locally.
  if (shopifyRest) {
    const { getEntityLinksForStore, softDeleteEntityLinkByInternalId, deleteSyncedRecord } = await import(
      "../../repositories/ecommerceRepository.js"
    );
    const productLinks = await getEntityLinksForStore(storeId, "product");
    for (const link of productLinks) {
      try {
        await shopifyRest.get(`/products/${link.external_id}.json`);
      } catch (err) {
        if (err.response?.status === 404) {
          try {
            await inventoryRepository.softDeleteProduct(tenantId, link.internal_id);
          } catch {
            const current = await inventoryRepository.getProductById(tenantId, link.internal_id);
            if (current) {
              await inventoryRepository.updateProduct(tenantId, link.internal_id, {
                product_name: current.product_name,
                description: current.description,
                unit: current.unit,
                delivery_charges: current.delivery_charges ?? 0,
                discount: current.discount ?? 0,
                tax: current.tax ?? 0,
                status: "inactive",
                category_id: current.category_id,
                source: current.source || "shopify",
              });
            }
          }
          await softDeleteEntityLinkByInternalId(tenantId, "product", link.internal_id, "shopify");
          await deleteSyncedRecord(storeId, tenantId, "product", link.external_id);
          result.removed += 1;
        }
      }
    }
  }

  const products = await getSyncedRecords(storeId, tenantId, "product", 5000);
  for (const rec of products) {
    try {
      const link = await getEntityLink(storeId, "product", rec.externalId);
      if (!link) continue;
      const normalized = resolveProductNormalized(rec.normalized || {}, rec.raw, rec.platform);
      const current = await inventoryRepository.getProductById(tenantId, link.internal_id);
      const status = mapProductStatus(normalized.status);
      if (current) {
        await inventoryRepository.updateProduct(tenantId, link.internal_id, {
          product_name: String(normalized.name || "").trim() || current.product_name,
          description: normalized.description ?? current.description ?? null,
          unit: current.unit || "piece",
          delivery_charges: current.delivery_charges ?? 0,
          discount: current.discount ?? 0,
          tax: current.tax ?? 0,
          status,
          category_id: current.category_id,
          source: current.source || normalized.platform || "shopify",
        });
      }
      await syncShopifyProductVariants(tenantId, storeId, link.internal_id, normalized, { status });
      await repairCreatedAt("inventory_products", link.internal_id, tenantId, normalized.createdAt);
      result.products += 1;
    } catch {
      result.failed += 1;
    }
  }

  const customers = await getSyncedRecords(storeId, tenantId, "customer", 5000);
  for (const rec of customers) {
    try {
      const link = await getEntityLink(storeId, "customer", rec.externalId);
      if (!link) continue;
      await repairCreatedAt("crm_customers", link.internal_id, tenantId, (rec.normalized || {}).createdAt);
      result.customers += 1;
    } catch {
      result.failed += 1;
    }
  }

  const orders = await getSyncedRecords(storeId, tenantId, "order", 5000);
  // reuse shopifyRest from above
  for (const rec of orders) {
    try {
      const link = await getEntityLink(storeId, "order", rec.externalId);
      if (!link) continue;

      let raw = rec.raw;
      // Live refresh so current_quantity (removed lines) is accurate.
      if (shopifyRest && rec.externalId) {
        try {
          const { data } = await shopifyRest.get(`/orders/${rec.externalId}.json`, {
            params: { status: "any" },
          });
          if (data?.order) {
            raw = data.order;
            await upsertSyncedRecord(
              storeId,
              tenantId,
              "order",
              String(rec.externalId),
              raw,
              normalizeShopifyOrder(raw),
              "reconcile_refresh",
              "shopify",
            );
          }
        } catch {
          // Keep staged raw if live fetch fails.
        }
      }

      const normalized = resolveOrderNormalized(rec.normalized || {}, raw, rec.platform || "shopify");
      const updated = await importNormalizedOrder(tenantId, normalized, {
        storeId,
        platform: "shopify",
      });
      if (updated?.ok) result.orders += 1;
      else result.failed += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
