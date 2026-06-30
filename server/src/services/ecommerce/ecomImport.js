import { writeDb } from "../../database/db.js";
import { inventoryRepository } from "../../repositories/inventoryRepository.js";
import { crmRepository } from "../../repositories/crmRepository.js";
import {
  getSyncedRecords,
  getEntityCounts,
  addSyncLog,
  getEntityLink,
  upsertEntityLink,
  markSyncedRecordImported,
  updateErpImportStatus,
  updateExternalOrderInternalId,
} from "../../repositories/ecommerceRepository.js";

const MARKETPLACE_CATEGORY = "Marketplace";
const DEFAULT_WAREHOUSE = "Main Warehouse";
const SAMPLE_LIMIT = 8;

const categoryCache = new Map();
const warehouseCache = new Map();

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

function mapOrderStatuses(normalized) {
  const raw = String(normalized.status || "").toLowerCase();
  let paymentStatus = "pending";
  let fulfillmentStatus = "unfulfilled";
  let orderStatus = "open";

  if (raw.includes("paid") || raw === "paid") paymentStatus = "paid";
  if (raw.includes("refund")) paymentStatus = "refunded";
  if (raw.includes("fulfilled") || raw.includes("delivered") || raw.includes("shipped")) {
    fulfillmentStatus = "fulfilled";
    orderStatus = "completed";
  }
  if (raw.includes("cancel")) {
    orderStatus = "cancelled";
    fulfillmentStatus = "cancelled";
  }
  if (raw.includes("pending")) orderStatus = "pending";

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
  if (source === "manual") {
    return { action: "skip", reason: "Email/phone matches a manually added customer", existingId: match.id };
  }
  if (source === normalized.platform) return { action: "update", existingId: match.id };
  return { action: "skip", reason: `Matches a customer from ${source}`, existingId: match.id };
}

async function classifyOrder(storeId, normalized) {
  const link = await getEntityLink(storeId, "order", normalized.externalId);
  if (link) return { action: "already_imported", existingId: link.internal_id };
  return { action: "create" };
}

async function buildEntityPreview(storeId, tenantId, entityType) {
  const records = await getSyncedRecords(storeId, entityType, 5000, { importStatus: "staged" });
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
    const sku = resolveSku(normalized);
    const productName =
      String(normalized.name || "").trim() ||
      `${String(normalized.platform || "Marketplace")} product ${normalized.externalId}`;
    const status = mapProductStatus(normalized.status);
    const sellingPrice = Math.max(0, Number(normalized.price) || 0);
    const stock =
      normalized.stock != null && !Number.isNaN(Number(normalized.stock))
        ? Math.max(0, Math.floor(Number(normalized.stock)))
        : null;
    const source = platform || normalized.platform || "shopify";

    let productId;

    if (classification.action === "update") {
      const current = await inventoryRepository.getProductById(tenantId, classification.existingId);
      await inventoryRepository.updateProduct(tenantId, classification.existingId, {
        product_name: productName,
        unit: current?.unit || "piece",
        delivery_charges: current?.delivery_charges ?? 0,
        discount: current?.discount ?? 0,
        tax: current?.tax ?? 0,
        status,
        category_id: current?.category_id ?? categoryId,
        source,
      });
      const variantId = classification.variantId
        || (await inventoryRepository.getDefaultVariantForProduct(tenantId, classification.existingId))?.id;
      if (variantId) {
        await inventoryRepository.updateVariant(tenantId, variantId, {
          sku,
          variant_name: productName,
          cost_price: 0,
          selling_price: sellingPrice,
          status,
        });
      }
      productId = classification.existingId;
    } else {
      productId = await inventoryRepository.createProduct(tenantId, {
        product_name: productName,
        unit: "piece",
        delivery_charges: 0,
        discount: 0,
        tax: 0,
        status,
        category_id: categoryId,
        source,
      });
      const variantId = await inventoryRepository.createVariant(tenantId, {
        product_id: productId,
        sku,
        variant_name: productName,
        cost_price: 0,
        selling_price: sellingPrice,
        status,
      });
      classification.variantId = variantId;
    }

    if (stock !== null) {
      const warehouseId = await ensureDefaultWarehouse(tenantId);
      const variantId = classification.variantId
        || (await inventoryRepository.getDefaultVariantForProduct(tenantId, productId))?.id;
      if (variantId) {
        await inventoryRepository.setStockLevelAbsolute(tenantId, variantId, warehouseId, {
          available_qty: stock,
          reserved_qty: 0,
          damaged_qty: 0,
        });
      }
    }

    if (storeId) {
      await upsertEntityLink({
        tenantId,
        storeId,
        platform: source,
        entityType: "product",
        externalId: normalized.externalId,
        internalId: productId,
      });
      await markSyncedRecordImported(storeId, "product", normalized.externalId);
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
    return { ok: true, customerId: classification.existingId, action: "already_imported" };
  }
  if (classification.action === "skip") {
    return { ok: false, action: "skip", reason: classification.reason };
  }

  try {
    const source = platform || normalized.platform || "shopify";
    const payload = {
      customer_name: normalized.name || "Unknown",
      phone: normalized.phone || null,
      email: normalized.email || null,
      status: "active",
      customer_type: "retailer",
      source,
    };

    let customerId;
    if (classification.action === "update") {
      await crmRepository.updateCustomer(tenantId, null, classification.existingId, payload);
      customerId = classification.existingId;
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
      await markSyncedRecordImported(storeId, "customer", normalized.externalId);
    }

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

  if (classification.action === "already_imported") {
    return { ok: true, orderId: classification.existingId, action: "already_imported" };
  }

  try {
    const source = platform || normalized.platform || "shopify";
    const orderNo = `${String(source).toUpperCase()}-${normalized.externalId}`;
    const statuses = mapOrderStatuses(normalized);
    const total = Math.max(0, Number(normalized.total) || 0);

    let customerId = customerIdMap[normalized.customer?.email || ""] || null;
    if (!customerId && normalized.customer) {
      const match = await crmRepository.findCustomerByPhoneOrEmail(
        tenantId,
        normalized.customer.phone,
        normalized.customer.email,
      );
      customerId = match?.id || null;
    }

    const [result] = await writeDb.query(
      `INSERT INTO orders
         (order_no, order_source, order_status, payment_status, fulfillment_status,
          total_amount, discount_amount, delivery_charges, payable_amount,
          city, delivery_address, notes, customer_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, NULL, NULL, ?, ?, ?)`,
      [
        orderNo,
        source,
        statuses.orderStatus,
        statuses.paymentStatus,
        statuses.fulfillmentStatus,
        total,
        total,
        `Imported from ${source} (#${normalized.externalId})`,
        customerId,
        tenantId,
      ],
    );
    const orderId = result.insertId;

    for (const item of normalized.items || []) {
      let productId = null;
      const sku = String(item.sku || "").trim();
      if (sku) {
        const found = await inventoryRepository.findVariantBySku(tenantId, sku);
        productId = found?.product_id || null;
      }
      const qty = Math.max(1, Number(item.qty) || 1);
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
      await markSyncedRecordImported(storeId, "order", normalized.externalId);
      await updateExternalOrderInternalId(storeId, normalized.externalId, orderId);
    }

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

async function importEntityType(storeId, tenantId, entityType, platform, options = {}) {
  const records = await getSyncedRecords(storeId, entityType, 5000, { importStatus: "staged" });
  const result = { created: 0, updated: 0, skipped: 0, failed: 0, already_imported: 0 };
  const customerIdMap = {};

  if (entityType === "customer" || entityType === "order") {
    const customerRecords = entityType === "order"
      ? await getSyncedRecords(storeId, "customer", 5000, { importStatus: "staged" })
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
      imp = await importNormalizedProduct(tenantId, record.normalized, {
        storeId,
        platform,
        allowUpdate: options.updateExisting !== false,
      });
    } else if (entityType === "customer") {
      imp = await importNormalizedCustomer(tenantId, record.normalized, { storeId, platform });
    } else {
      imp = await importNormalizedOrder(tenantId, record.normalized, {
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

export async function importEntitiesToErp(storeId, tenantId, platform, entities = [], options = {}) {
  const allowed = new Set(["product", "customer", "order"]);
  const types = entities.filter((e) => allowed.has(e));
  if (!types.length) {
    return { success: false, error: "No valid entity types selected" };
  }

  await updateErpImportStatus(storeId, "in_progress");
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
  await updateErpImportStatus(storeId, finalStatus);

  return { success: true, results, erpImportStatus: finalStatus };
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

export async function getEntityCountsForImport(storeId) {
  return getEntityCounts(storeId);
}
