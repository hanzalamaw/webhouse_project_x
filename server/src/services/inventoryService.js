import { getPool } from "../database/db.js";
import { inventoryRepository } from "../repositories/inventoryRepository.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";
import {
  resolveVariantsFromBody,
  reconstructOptionsFromVariants,
  variantComboKey,
  resolveIncomingVariantKey,
} from "../utils/productVariants.js";
import {
  syncEntityToShopify,
  syncVariantInventoryToShopify,
  syncEntityToDaraz,
  syncVariantInventoryToDaraz,
  deleteLinkedProductFromShopify,
  deleteLinkedProductFromDaraz,
  deleteLinkedWarehouseFromShopify,
} from "./ecommerce/ecomPush.js";
import { requireShopifySync, requireShopifySyncIfLinked } from "./ecommerce/shopifySyncGuard.js";
import { requireDarazSync, requireDarazSyncIfLinked } from "./ecommerce/darazSyncGuard.js";
import {
  assertProductCanDelete,
  assertLinkedStockWarehouseMapped,
  assertRequireShopifySyncOnSave,
} from "./ecommerce/shopifyPolicy.js";
import { assertRequireDarazSyncOnSave } from "./ecommerce/darazPolicy.js";

const STATUS_VALUES = ["active", "inactive"];
const MOVEMENT_TYPES = ["initial_stock", "stock_in", "stock_out", "transfer_in", "transfer_out"];
const TRANSFER_STATUSES = ["pending", "completed", "cancelled"];

function assertStatus(status, label = "status") {
  if (!STATUS_VALUES.includes(status)) {
    throw new Error(`Invalid ${label}. Use: ${STATUS_VALUES.join(", ")}`);
  }
}

function assertMovementType(type) {
  if (!MOVEMENT_TYPES.includes(type)) {
    throw new Error(`Invalid movement type. Use: ${MOVEMENT_TYPES.join(", ")}`);
  }
}

function assertPositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return n;
}

function assertNonNegativeInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return n;
}

function assertPrice(value, label) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`${label} must be a valid non-negative number`);
  }
  return n;
}

async function withTransaction(fn) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function parseVariantPricing(body, existing = {}) {
  return {
    cost_price: assertPrice(body.cost_price ?? existing.cost_price ?? 0, "Cost price"),
    selling_price: assertPrice(body.selling_price ?? existing.selling_price ?? 0, "Selling price"),
  };
}

function parseProductPricing(body, existing = {}) {
  return {
    delivery_charges: assertPrice(body.delivery_charges ?? existing.delivery_charges ?? 0, "Delivery charges"),
    discount: assertPrice(body.discount ?? existing.discount ?? 0, "Discount"),
    tax: assertPrice(body.tax ?? existing.tax ?? 0, "Tax"),
  };
}

function normalizeBulkQtyItems(body, label = "item") {
  const items = body.items;
  if (!Array.isArray(items) || !items.length) throw new Error("Select at least one variant");
  const sameQty = Boolean(body.same_qty_for_all);
  if (sameQty) {
    const qty = assertPositiveInt(body.qty, "Quantity");
    const notes = body.notes || null;
    return items.map((item) => ({
      variant_id: Number(item.variant_id || item.product_id),
      qty,
      notes,
    }));
  }
  return items.map((item, i) => ({
    variant_id: Number(item.variant_id || item.product_id),
    qty: assertPositiveInt(item.qty, `Quantity for ${label} ${i + 1}`),
    notes: item.notes || null,
  }));
}

function productSnapshotToBody(snapshot) {
  return {
    options: snapshot.options || [],
    variants: (snapshot.variants || []).map((v) => ({
      id: v.id,
      sku: v.sku,
      variant_name: v.variant_name,
      cost_price: v.cost_price,
      selling_price: v.selling_price,
      status: v.status,
      attributes: v.attributes || [],
      combo_key: variantComboKey(v.attributes || []),
      stock_levels: (v.stock_levels || []).map((sl) => ({
        warehouse_id: sl.warehouse_id,
        available_qty: sl.available_qty ?? 0,
        reserved_qty: sl.reserved_qty ?? 0,
        damaged_qty: sl.damaged_qty ?? 0,
      })),
    })),
  };
}

async function restoreProductSnapshot(tenantId, userId, productId, snapshot) {
  if (!snapshot) return;
  await inventoryRepository.updateProduct(tenantId, productId, {
    product_name: snapshot.product_name,
    description: snapshot.description,
    unit: snapshot.unit,
    default_cost_price: snapshot.default_cost_price,
    default_selling_price: snapshot.default_selling_price,
    delivery_charges: snapshot.delivery_charges,
    discount: snapshot.discount,
    tax: snapshot.tax,
    status: snapshot.status,
    category_id: snapshot.category_id,
  });
  await syncProductVariants(tenantId, userId, productId, productSnapshotToBody(snapshot), snapshot.product_name);
}

async function persistVariantRow(tenantId, userId, productId, v) {
  const sku = String(v.sku || "").trim();
  const variant_name = String(v.variant_name || "").trim();
  if (!sku) throw new Error("Each generated variant requires a SKU");
  if (!variant_name) throw new Error("Each generated variant requires a name");
  const vStatus = v.status || "active";
  assertStatus(vStatus);
  const pricing = {
    cost_price: assertPrice(v.cost_price ?? 0, "Cost price"),
    selling_price: assertPrice(v.selling_price ?? 0, "Selling price"),
  };

  let variantId;
  if (v.id) {
    const dup = await inventoryRepository.findVariantBySku(tenantId, sku, Number(v.id));
    if (dup) throw new Error(`SKU already exists: ${sku}`);
    await inventoryRepository.updateVariant(tenantId, Number(v.id), {
      sku,
      variant_name,
      ...pricing,
      status: vStatus,
    });
    variantId = Number(v.id);
  } else {
    const dup = await inventoryRepository.findVariantBySku(tenantId, sku);
    if (dup) throw new Error(`SKU already exists: ${sku}`);
    variantId = await inventoryRepository.createVariant(tenantId, {
      product_id: productId,
      sku,
      variant_name,
      ...pricing,
      status: vStatus,
    });
  }

  await inventoryRepository.setVariantAttributes(tenantId, variantId, v.attributes || []);

  if (Array.isArray(v.stock_levels) && v.stock_levels.length) {
    for (const sl of v.stock_levels) {
      const warehouse_id = Number(sl.warehouse_id);
      if (!warehouse_id) continue;
      await ensureWarehouse(tenantId, warehouse_id);
      await inventoryRepository.setStockLevelAbsolute(tenantId, variantId, warehouse_id, {
        available_qty: sl.available_qty ?? 0,
        reserved_qty: sl.reserved_qty ?? 0,
        damaged_qty: sl.damaged_qty ?? 0,
      });
    }
  } else if (Array.isArray(v.warehouse_stocks) && v.warehouse_stocks.length) {
    await applyVariantWarehouseStocks(tenantId, userId, variantId, v.warehouse_stocks);
  }

  return variantId;
}

async function syncProductVariants(tenantId, userId, productId, body, productName) {
  const { variants } = resolveVariantsFromBody(body, productName);
  await inventoryRepository.releaseSoftDeletedVariantSkus(tenantId, productId);
  const existing = await inventoryRepository.getVariantsByProductId(tenantId, productId);

  const seenKeys = new Set();
  const incomingIds = new Set();
  for (const v of variants) {
    seenKeys.add(resolveIncomingVariantKey(v));
    if (v.id) incomingIds.add(Number(v.id));
  }

  for (const v of existing) {
    const key = variantComboKey(v.attributes || []);
    if (seenKeys.has(key) || incomingIds.has(v.id)) continue;
    await inventoryRepository.softDeleteVariant(tenantId, v.id);
  }

  const remaining = await inventoryRepository.getVariantsByProductId(tenantId, productId);
  const existingByKey = new Map();
  const existingById = new Map();
  const existingBySku = new Map();
  for (const v of remaining) {
    const key = variantComboKey(v.attributes || []);
    existingByKey.set(key, v);
    existingById.set(v.id, v);
    const skuKey = String(v.sku || "").trim().toLowerCase();
    if (skuKey) existingBySku.set(skuKey, v);
  }

  for (const v of variants) {
    const key = resolveIncomingVariantKey(v);
    const skuKey = String(v.sku || "").trim().toLowerCase();
    const matchById = v.id ? existingById.get(Number(v.id)) : null;
    const matchByKey = existingByKey.get(key);
    const matchBySku = skuKey ? existingBySku.get(skuKey) : null;
    const match = matchById || matchByKey || matchBySku;

    await persistVariantRow(tenantId, userId, productId, {
      ...v,
      id: Number(v.id) || match?.id || null,
    });
  }
}

async function ensureCategory(tenantId, categoryId) {
  const cat = await inventoryRepository.getCategoryById(tenantId, categoryId);
  if (!cat) throw new Error("Category not found");
  return cat;
}

async function ensureProduct(tenantId, productId) {
  const product = await inventoryRepository.getProductById(tenantId, productId);
  if (!product) throw new Error("Product not found");
  return product;
}

async function ensureVariant(tenantId, variantId) {
  const variant = await inventoryRepository.getVariantById(tenantId, variantId);
  if (!variant) throw new Error("Variant not found");
  return variant;
}

async function resolveVariantId(tenantId, { variant_id, product_id }) {
  if (variant_id) {
    return ensureVariant(tenantId, Number(variant_id));
  }
  if (product_id) {
    const def = await inventoryRepository.getDefaultVariantForProduct(tenantId, Number(product_id));
    if (!def) throw new Error("Product has no variants");
    return ensureVariant(tenantId, def.id);
  }
  throw new Error("variant_id is required");
}

async function ensureWarehouse(tenantId, warehouseId) {
  const wh = await inventoryRepository.getWarehouseById(tenantId, warehouseId);
  if (!wh) throw new Error("Warehouse not found");
  return wh;
}

async function applyStockDelta(tenantId, variantId, warehouseId, deltaAvailable, deltaDamaged = 0) {
  const level = await inventoryRepository.getStockLevel(tenantId, variantId, warehouseId);
  const current = level?.available_qty ?? 0;
  if (deltaAvailable < 0 && current + deltaAvailable < 0) {
    throw new Error("Insufficient available stock");
  }
  return inventoryRepository.upsertStockLevel(tenantId, variantId, warehouseId, deltaAvailable, deltaDamaged);
}

async function requireLinkedShopifyStockSync(tenantId, variantId, options = {}) {
  const result = await syncVariantInventoryToShopify(tenantId, variantId, options);
  requireShopifySyncIfLinked(result, "Inventory");
  return result;
}

async function requireLinkedDarazStockSync(tenantId, variantId) {
  const result = await syncVariantInventoryToDaraz(tenantId, variantId);
  requireDarazSyncIfLinked(result, "Inventory");
  return result;
}

async function afterStockChangeWithShopify(tenantId, variantId, warehouseId, qtyDelta, result) {
  try {
    await requireLinkedShopifyStockSync(tenantId, variantId, { warehouseId, qtyDelta });
    await requireLinkedDarazStockSync(tenantId, variantId);
    return result;
  } catch (err) {
    if (qtyDelta) {
      await applyStockDelta(tenantId, variantId, warehouseId, -qtyDelta);
    }
    throw err;
  }
}

async function afterBulkStockChangeWithShopify(tenantId, warehouseId, lines, result) {
  const variantIds = [...new Set(result.items.map((item) => item.variant_id))];
  try {
    for (const variantId of variantIds) {
      await requireLinkedShopifyStockSync(tenantId, variantId);
      await requireLinkedDarazStockSync(tenantId, variantId);
    }
    return result;
  } catch (err) {
    for (const line of lines) {
      await applyStockDelta(tenantId, line.variant_id, warehouseId, -line.qty);
    }
    throw err;
  }
}

async function afterTransferWithShopify(tenantId, variantId, fromWarehouseId, toWarehouseId, qty, result) {
  try {
    await requireLinkedShopifyStockSync(tenantId, variantId);
    return result;
  } catch (err) {
    await applyStockDelta(tenantId, variantId, fromWarehouseId, qty);
    await applyStockDelta(tenantId, variantId, toWarehouseId, -qty);
    throw err;
  }
}

async function afterBulkTransferWithShopify(tenantId, fromWarehouseId, toWarehouseId, lines, result) {
  const variantIds = [...new Set(result.items.map((item) => item.variant_id))];
  try {
    for (const variantId of variantIds) {
      await requireLinkedShopifyStockSync(tenantId, variantId);
    }
    return result;
  } catch (err) {
    for (const line of lines) {
      await applyStockDelta(tenantId, line.variant_id, fromWarehouseId, line.qty);
      await applyStockDelta(tenantId, line.variant_id, toWarehouseId, -line.qty);
    }
    throw err;
  }
}

async function applyVariantWarehouseStocks(tenantId, userId, variantId, warehouseStocks) {
  for (const row of warehouseStocks) {
    const warehouse_id = Number(row.warehouse_id);
    if (!warehouse_id) continue;
    await ensureWarehouse(tenantId, warehouse_id);
    const initial_qty = assertNonNegativeInt(row.initial_qty ?? 0, "Initial quantity");
    const reserved_qty = assertNonNegativeInt(row.reserved_qty ?? 0, "Reserved quantity");
    const damaged_qty = assertNonNegativeInt(row.damaged_qty ?? 0, "Damaged quantity");
    if (initial_qty > 0 || reserved_qty > 0 || damaged_qty > 0) {
      await inventoryRepository.setStockLevelAbsolute(tenantId, variantId, warehouse_id, {
        available_qty: initial_qty,
        reserved_qty,
        damaged_qty,
      });
      if (initial_qty > 0) {
        await inventoryRepository.createMovement(tenantId, userId, {
          movement_type: "initial_stock",
          qty: initial_qty,
          notes: row.stock_notes || "Initial stock on product creation",
          variant_id: variantId,
          warehouse_id,
        });
      }
    }
  }
}

export const inventoryService = {
  MOVEMENT_TYPES,
  TRANSFER_STATUSES,
  STATUS_VALUES,

  async dashboard(tenantId) {
    // Drop empty Shopify/Daraz product shells left by failed imports so KPI matches Manage Products / warehouses.
    try {
      const { purgeOrphanMarketplaceProducts } = await import("./ecommerce/ecomImport.js");
      await purgeOrphanMarketplaceProducts(tenantId);
    } catch {
      // non-fatal
    }
    const [
      stats,
      recent_movements,
      recent_transfers,
      movement_trend,
      movements_by_type,
      stock_by_category,
      stock_by_warehouse,
      top_products,
      low_stock_products,
    ] = await Promise.all([
      inventoryRepository.dashboardStats(tenantId),
      inventoryRepository.recentMovements(tenantId, 10),
      inventoryRepository.dashboardRecentTransfers(tenantId, 8),
      inventoryRepository.dashboardMovementTrend(tenantId, 6),
      inventoryRepository.dashboardMovementsByType(tenantId),
      inventoryRepository.dashboardStockByCategory(tenantId),
      inventoryRepository.dashboardStockByWarehouse(tenantId),
      inventoryRepository.dashboardTopProducts(tenantId, 6),
      inventoryRepository.dashboardLowStockProducts(tenantId, 8),
    ]);
    return {
      stats,
      recent_movements,
      recent_transfers,
      movement_trend,
      movements_by_type,
      stock_by_category,
      stock_by_warehouse,
      top_products,
      low_stock_products,
    };
  },

  async listCategories(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await inventoryRepository.listCategories(tenantId, { limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async getCategory(tenantId, id) {
    const category = await inventoryRepository.getCategoryById(tenantId, id);
    if (!category) return null;
    const products = await inventoryRepository.getCategoryProducts(tenantId, id);
    const all_products = await inventoryRepository.listAllProductsBrief(tenantId);
    const stats = await inventoryRepository.getCategoryStats(tenantId, id);
    return { ...category, products, all_products, stats };
  },

  async createCategory(tenantId, body) {
    const category_name = String(body.category_name || "").trim();
    if (!category_name) throw new Error("Category name is required");
    const status = body.status || "active";
    assertStatus(status);

    const id = await inventoryRepository.createCategory(tenantId, { category_name, status });
    if (Array.isArray(body.product_ids) && body.product_ids.length) {
      await inventoryRepository.assignProductsToCategory(tenantId, id, body.product_ids.map(Number));
    }
    return this.getCategory(tenantId, id);
  },

  async updateCategory(tenantId, id, body) {
    const existing = await inventoryRepository.getCategoryById(tenantId, id);
    if (!existing) return null;

    const category_name = String(body.category_name ?? existing.category_name).trim();
    if (!category_name) throw new Error("Category name is required");
    const status = body.status ?? existing.status;
    assertStatus(status);

    await inventoryRepository.updateCategory(tenantId, id, { category_name, status });
    if (Array.isArray(body.product_ids)) {
      await inventoryRepository.assignProductsToCategory(tenantId, id, body.product_ids.map(Number));
    }
    return this.getCategory(tenantId, id);
  },

  async removeCategory(tenantId, id) {
    return inventoryRepository.softDeleteCategory(tenantId, id);
  },

  async listProducts(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await inventoryRepository.listProducts(tenantId, { limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async getProduct(tenantId, id) {
    const product = await inventoryRepository.getProductById(tenantId, id);
    if (!product) return null;
    const variants = await inventoryRepository.getVariantsByProductId(tenantId, id);
    for (const v of variants) {
      v.stock_levels = await inventoryRepository.getVariantStockLevels(tenantId, v.id);
    }
    return { ...product, options: reconstructOptionsFromVariants(variants), variants };
  },

  async createProduct(tenantId, userId, body) {
    const product_name = String(body.product_name || "").trim();
    if (!product_name) throw new Error("Product name is required");

    const category_id = Number(body.category_id);
    if (!category_id) throw new Error("Category is required");
    await ensureCategory(tenantId, category_id);

    const status = body.status || "active";
    assertStatus(status);
    const unit = String(body.unit || "piece").trim();
    const productPricing = parseProductPricing(body);
    const { variants } = resolveVariantsFromBody(body, product_name);

    const defaultStock = body.default_warehouse_stock;
    if (defaultStock?.enabled && defaultStock.warehouse_id) {
      for (const v of variants) {
        if (!Array.isArray(v.warehouse_stocks) || !v.warehouse_stocks.length) {
          v.warehouse_stocks = [{
            warehouse_id: Number(defaultStock.warehouse_id),
            initial_qty: Number(defaultStock.initial_qty) || 0,
            reserved_qty: 0,
            damaged_qty: 0,
            stock_notes: "Opening stock on product creation",
          }];
        }
      }
    }

    for (const v of variants) {
      const dup = await inventoryRepository.findVariantBySku(tenantId, v.sku);
      if (dup) throw new Error(`SKU already exists: ${v.sku}`);
    }

    return withTransaction(async () => {
      const productId = await inventoryRepository.createProduct(tenantId, {
        product_name,
        description: body.description ? String(body.description).trim() : null,
        unit,
        ...productPricing,
        status,
        category_id,
        source: body.source || "manual",
      });

      for (const v of variants) {
        await persistVariantRow(tenantId, userId, productId, v);
      }

      return this.getProduct(tenantId, productId);
    }).then(async (product) => {
      if (body.syncToShopify) {
        try {
          const push = await syncEntityToShopify(tenantId, "product", product.id);
          requireShopifySync(push, "Product");
          return { ...product, shopifySync: push };
        } catch (err) {
          await inventoryRepository.softDeleteProduct(tenantId, product.id);
          throw err;
        }
      }
      if (body.syncToDaraz) {
        try {
          const push = await syncEntityToDaraz(tenantId, "product", product.id, {
            primaryCategoryId: body.daraz_primary_category_id || null,
            brand: body.daraz_brand || "",
            shortDescription: body.daraz_short_description || "",
            packageDims: body.daraz_package || {},
          });
          requireDarazSync(push, "Product");
          return { ...product, darazSync: push };
        } catch (err) {
          await inventoryRepository.softDeleteProduct(tenantId, product.id);
          throw err;
        }
      }
      return product;
    });
  },

  async updateProduct(tenantId, userId, id, body) {
    const existing = await inventoryRepository.getProductById(tenantId, id);
    if (!existing) return null;
    await assertRequireShopifySyncOnSave(tenantId, "product", id, body.syncToShopify);
    await assertRequireDarazSyncOnSave(tenantId, "product", id, body.syncToDaraz);
    const before = (body.syncToShopify || body.syncToDaraz) ? await this.getProduct(tenantId, id) : null;

    const product_name = String(body.product_name ?? existing.product_name).trim();
    if (!product_name) throw new Error("Product name is required");

    const category_id = Number(body.category_id ?? existing.category_id);
    await ensureCategory(tenantId, category_id);

    const status = body.status ?? existing.status;
    assertStatus(status);
    const productPricing = parseProductPricing(body, existing);

    await inventoryRepository.updateProduct(tenantId, id, {
      product_name,
      description: body.description != null ? String(body.description).trim() : existing.description,
      unit: String(body.unit ?? existing.unit).trim(),
      ...productPricing,
      status,
      category_id,
      ...(body.source != null ? { source: body.source } : {}),
    });

    if (body.options != null || Array.isArray(body.variants)) {
      await syncProductVariants(tenantId, userId, id, body, product_name);
    }

    const product = await this.getProduct(tenantId, id);
    if (body.syncToShopify) {
      try {
        const push = await syncEntityToShopify(tenantId, "product", id, { beforeProduct: before });
        requireShopifySync(push, "Product");
        return { ...product, shopifySync: push };
      } catch (err) {
        await restoreProductSnapshot(tenantId, userId, id, before);
        throw err;
      }
    }
    if (body.syncToDaraz) {
      try {
        const push = await syncEntityToDaraz(tenantId, "product", id, {
          beforeProduct: before,
          primaryCategoryId: body.daraz_primary_category_id || null,
          brand: body.daraz_brand || "",
          shortDescription: body.daraz_short_description || "",
          packageDims: body.daraz_package || {},
        });
        requireDarazSync(push, "Product");
        return { ...product, darazSync: push };
      } catch (err) {
        await restoreProductSnapshot(tenantId, userId, id, before);
        throw err;
      }
    }
    return product;
  },

  async removeProduct(tenantId, id) {
    await assertProductCanDelete(tenantId, id);
    const shopifySync = await deleteLinkedProductFromShopify(tenantId, id);
    try {
      requireShopifySyncIfLinked(shopifySync, "Product");
    } catch (err) {
      const detail = shopifySync?.error || err.message || shopifySync?.reason;
      const error = new Error(
        `Product was not deleted in ERP. Shopify blocked the delete: ${detail}`,
      );
      error.status = 409;
      throw error;
    }
    const darazSync = await deleteLinkedProductFromDaraz(tenantId, id);
    try {
      requireDarazSyncIfLinked(darazSync, "Product");
    } catch (err) {
      const detail = darazSync?.error || err.message || darazSync?.reason;
      const error = new Error(
        `Product was not deleted in ERP. Daraz blocked the delete: ${detail}`,
      );
      error.status = 409;
      throw error;
    }
    const deleted = await inventoryRepository.softDeleteProduct(tenantId, id);
    const parts = ["Product deleted from ERP."];
    if (!shopifySync?.skipped) {
      parts.push(
        `Shopify was set to draft with a note — permanent Shopify delete in ${shopifySync.delayLabel || "7 days"}.`,
      );
    }
    if (!darazSync?.skipped) {
      parts.push(
        `Daraz was set to inactive — permanent Daraz delete in ${darazSync.delayLabel || "7 days"}.`,
      );
    }
    return {
      ok: Boolean(deleted),
      shopifySync,
      darazSync,
      message: parts.join(" "),
    };
  },

  async exportProducts(tenantId) {
    // Emit flat rows (one per variant per warehouse stock level) so the export mirrors
    // the import format and every product column is populated.
    const out = [];
    const { rows } = await inventoryRepository.listProducts(tenantId, { limit: 10000, offset: 0 });
    for (const p of rows) {
      const variants = await inventoryRepository.getVariantsByProductId(tenantId, p.id);
      for (const v of variants) {
        const base = {
          product_name: p.product_name,
          sku: v.sku,
          unit: p.unit || "piece",
          cost_price: v.cost_price ?? 0,
          selling_price: v.selling_price ?? 0,
          delivery_charges: p.delivery_charges ?? 0,
          discount: p.discount ?? 0,
          tax: p.tax ?? 0,
          status: v.status || p.status || "active",
          category_name: p.category_name || "",
        };
        const stockLevels = await inventoryRepository.getVariantStockLevels(tenantId, v.id);
        if (stockLevels.length) {
          for (const sl of stockLevels) {
            out.push({
              ...base,
              warehouse_id: sl.warehouse_id,
              initial_qty: sl.available_qty ?? 0,
              reserved_qty: sl.reserved_qty ?? 0,
              damaged_qty: sl.damaged_qty ?? 0,
              stock_notes: "",
            });
          }
        } else {
          out.push({
            ...base,
            warehouse_id: "",
            initial_qty: 0,
            reserved_qty: 0,
            damaged_qty: 0,
            stock_notes: "",
          });
        }
      }
    }
    return out;
  },

  async importProducts(tenantId, userId, rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("No rows to import");
    const results = { created: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await this.createProduct(tenantId, userId, row);
        results.created += 1;
      } catch (e) {
        results.skipped += 1;
        results.errors.push({ row: i + 1, message: e.message });
      }
    }
    return results;
  },

  async listWarehouses(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const [{ rows, total }, limits] = await Promise.all([
      inventoryRepository.listWarehouses(tenantId, { limit, offset }),
      this.getWarehouseLimits(tenantId),
    ]);
    return { ...paginatedResponse(rows, total, page, limit), limits };
  },

  async getWarehouseLimits(tenantId) {
    const max_warehouses = await inventoryRepository.getTenantWarehouseLimit(tenantId);
    const warehouse_count = await inventoryRepository.countWarehouses(tenantId);
    return {
      max_warehouses,
      warehouse_count,
      can_create: max_warehouses <= 0 || warehouse_count < max_warehouses,
    };
  },

  async getWarehouse(tenantId, id) {
    const warehouse = await inventoryRepository.getWarehouseById(tenantId, id);
    if (!warehouse) return null;
    const [stats, stock_lines, recent_movements] = await Promise.all([
      inventoryRepository.getWarehouseStats(tenantId, id),
      inventoryRepository.getWarehouseStockLines(tenantId, id),
      inventoryRepository.getWarehouseMovements(tenantId, id),
    ]);
    return {
      ...warehouse,
      product_count: stats.product_count ?? 0,
      total_units: stats.total_units ?? 0,
      stats,
      stock_lines,
      recent_movements,
    };
  },

  async createWarehouse(tenantId, body) {
    const warehouse_name = String(body.warehouse_name || "").trim();
    if (!warehouse_name) throw new Error("Warehouse name is required");
    const status = body.status || "active";
    assertStatus(status);

    const limits = await this.getWarehouseLimits(tenantId);
    if (!limits.can_create) {
      throw new Error(
        `Warehouse limit reached (${limits.warehouse_count}/${limits.max_warehouses}). Delete an unused warehouse or ask your administrator to raise the plan limit.`,
      );
    }

    const id = await inventoryRepository.createWarehouse(tenantId, {
      warehouse_name,
      location: body.location || null,
      city: body.city || null,
      status,
    });
    const warehouse = await inventoryRepository.getWarehouseById(tenantId, id);
    if (!body.syncToShopify) return warehouse;

    try {
      const push = await syncEntityToShopify(tenantId, "warehouse", id);
      requireShopifySync(push, "Warehouse");
      return { ...warehouse, shopifySync: push };
    } catch (err) {
      await inventoryRepository.softDeleteWarehouse(tenantId, id);
      throw err;
    }
  },

  async updateWarehouse(tenantId, id, body) {
    const existing = await inventoryRepository.getWarehouseById(tenantId, id);
    if (!existing) return null;
    await assertRequireShopifySyncOnSave(tenantId, "warehouse", id, body.syncToShopify);
    const before = body.syncToShopify ? { ...existing } : null;

    const warehouse_name = String(body.warehouse_name ?? existing.warehouse_name).trim();
    if (!warehouse_name) throw new Error("Warehouse name is required");
    const status = body.status ?? existing.status;
    assertStatus(status);

    await inventoryRepository.updateWarehouse(tenantId, id, {
      warehouse_name,
      location: body.location ?? existing.location,
      city: body.city ?? existing.city,
      status,
    });
    const warehouse = await inventoryRepository.getWarehouseById(tenantId, id);
    if (!body.syncToShopify) return warehouse;
    try {
      const push = await syncEntityToShopify(tenantId, "warehouse", id, { beforeWarehouse: before });
      requireShopifySync(push, "Warehouse");
      return { ...warehouse, shopifySync: push };
    } catch (err) {
      if (before) {
        await inventoryRepository.updateWarehouse(tenantId, id, {
          warehouse_name: before.warehouse_name,
          location: before.location,
          city: before.city,
          status: before.status,
        });
      }
      throw err;
    }
  },

  async removeWarehouse(tenantId, id) {
    const shopifySync = await deleteLinkedWarehouseFromShopify(tenantId, id);
    try {
      requireShopifySyncIfLinked(shopifySync, "Warehouse");
    } catch (err) {
      const detail = shopifySync?.error || err.message || shopifySync?.reason;
      const error = new Error(
        `Warehouse was not deleted in ERP. Shopify blocked the delete: ${detail}`,
      );
      error.status = 409;
      throw error;
    }
    const deleted = await inventoryRepository.softDeleteWarehouse(tenantId, id);
    return {
      ok: Boolean(deleted),
      shopifySync,
      message: shopifySync?.skipped
        ? "Warehouse deleted."
        : `Warehouse deleted from ERP. Shopify location was deactivated with a pending-delete note — permanent Shopify delete in ${shopifySync.delayLabel || "7 days"}.`,
    };
  },

  async listMovements(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const movement_type = query.movement_type || null;
    const { rows, total } = await inventoryRepository.listMovements(tenantId, {
      limit,
      offset,
      movement_type,
    });
    return paginatedResponse(rows, total, page, limit);
  },

  async stockIn(tenantId, userId, body) {
    const warehouse_id = Number(body.warehouse_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    const variant = await resolveVariantId(tenantId, body);
    await ensureWarehouse(tenantId, warehouse_id);
    await assertLinkedStockWarehouseMapped(tenantId, variant.id, warehouse_id);

    return withTransaction(async () => {
      await applyStockDelta(tenantId, variant.id, warehouse_id, qty);
      const movementId = await inventoryRepository.createMovement(tenantId, userId, {
        movement_type: "stock_in",
        qty,
        notes: body.notes || null,
        variant_id: variant.id,
        warehouse_id,
      });
      const { rows } = await inventoryRepository.listMovements(tenantId, { limit: 1, offset: 0 });
      return rows[0] || { id: movementId };
    }).then(async (result) => afterStockChangeWithShopify(tenantId, variant.id, warehouse_id, qty, result));
  },

  async stockOut(tenantId, userId, body) {
    const warehouse_id = Number(body.warehouse_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    const variant = await resolveVariantId(tenantId, body);
    await ensureWarehouse(tenantId, warehouse_id);
    await assertLinkedStockWarehouseMapped(tenantId, variant.id, warehouse_id);

    return withTransaction(async () => {
      await applyStockDelta(tenantId, variant.id, warehouse_id, -qty);
      const movementId = await inventoryRepository.createMovement(tenantId, userId, {
        movement_type: "stock_out",
        qty,
        notes: body.notes || null,
        variant_id: variant.id,
        warehouse_id,
      });
      return { id: movementId };
    }).then(async (result) => afterStockChangeWithShopify(tenantId, variant.id, warehouse_id, -qty, result));
  },

  async bulkStockIn(tenantId, userId, body) {
    const warehouse_id = Number(body.warehouse_id);
    if (!warehouse_id) throw new Error("Warehouse is required");
    await ensureWarehouse(tenantId, warehouse_id);
    const lines = normalizeBulkQtyItems(body, "variant");
    for (const line of lines) {
      await assertLinkedStockWarehouseMapped(tenantId, line.variant_id, warehouse_id);
    }

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        await ensureVariant(tenantId, line.variant_id);
        await applyStockDelta(tenantId, line.variant_id, warehouse_id, line.qty);
        const id = await inventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_in",
          qty: line.qty,
          notes: line.notes,
          variant_id: line.variant_id,
          warehouse_id,
        });
        created.push({ id, variant_id: line.variant_id });
      }
      return { count: created.length, items: created };
    }).then(async (result) => afterBulkStockChangeWithShopify(tenantId, warehouse_id, lines, result));
  },

  async bulkStockOut(tenantId, userId, body) {
    const warehouse_id = Number(body.warehouse_id);
    if (!warehouse_id) throw new Error("Warehouse is required");
    await ensureWarehouse(tenantId, warehouse_id);
    const lines = normalizeBulkQtyItems(body, "variant");
    for (const line of lines) {
      await assertLinkedStockWarehouseMapped(tenantId, line.variant_id, warehouse_id);
    }

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        await ensureVariant(tenantId, line.variant_id);
        await applyStockDelta(tenantId, line.variant_id, warehouse_id, -line.qty);
        const id = await inventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_out",
          qty: line.qty,
          notes: line.notes,
          variant_id: line.variant_id,
          warehouse_id,
        });
        created.push({ id, variant_id: line.variant_id });
      }
      return { count: created.length, items: created };
    }).then(async (result) => afterBulkStockChangeWithShopify(tenantId, warehouse_id, lines.map((l) => ({ ...l, qty: -l.qty })), result));
  },

  async listTransfers(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await inventoryRepository.listTransfers(tenantId, { limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async createTransfer(tenantId, userId, body) {
    const from_warehouse_id = Number(body.from_warehouse_id);
    const to_warehouse_id = Number(body.to_warehouse_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    const variant = await resolveVariantId(tenantId, body);

    if (from_warehouse_id === to_warehouse_id) {
      throw new Error("Source and destination warehouses must be different");
    }

    await ensureWarehouse(tenantId, from_warehouse_id);
    await ensureWarehouse(tenantId, to_warehouse_id);
    await assertLinkedStockWarehouseMapped(tenantId, variant.id, from_warehouse_id);
    await assertLinkedStockWarehouseMapped(tenantId, variant.id, to_warehouse_id);

    const completeNow = body.complete !== false;

    return withTransaction(async () => {
      if (completeNow) {
        await applyStockDelta(tenantId, variant.id, from_warehouse_id, -qty);
        await applyStockDelta(tenantId, variant.id, to_warehouse_id, qty);
        await inventoryRepository.createMovement(tenantId, userId, {
          movement_type: "transfer_out",
          qty,
          notes: body.notes || `Transfer to warehouse #${to_warehouse_id}`,
          variant_id: variant.id,
          warehouse_id: from_warehouse_id,
        });
        await inventoryRepository.createMovement(tenantId, userId, {
          movement_type: "transfer_in",
          qty,
          notes: body.notes || `Transfer from warehouse #${from_warehouse_id}`,
          variant_id: variant.id,
          warehouse_id: to_warehouse_id,
        });
      }

      const transferId = await inventoryRepository.createTransfer(tenantId, {
        qty,
        transfer_status: completeNow ? "completed" : "pending",
        variant_id: variant.id,
        from_warehouse_id,
        to_warehouse_id,
      });

      return inventoryRepository.getTransferById(tenantId, transferId);
    }).then(async (result) => {
      if (!completeNow) return result;
      return afterTransferWithShopify(
        tenantId,
        variant.id,
        from_warehouse_id,
        to_warehouse_id,
        qty,
        result,
      );
    });
  },

  async bulkCreateTransfer(tenantId, userId, body) {
    const from_warehouse_id = Number(body.from_warehouse_id);
    const to_warehouse_id = Number(body.to_warehouse_id);
    if (!from_warehouse_id || !to_warehouse_id) throw new Error("Source and destination warehouses are required");
    if (from_warehouse_id === to_warehouse_id) {
      throw new Error("Source and destination warehouses must be different");
    }
    await ensureWarehouse(tenantId, from_warehouse_id);
    await ensureWarehouse(tenantId, to_warehouse_id);
    const lines = normalizeBulkQtyItems(body, "variant");
    for (const line of lines) {
      await assertLinkedStockWarehouseMapped(tenantId, line.variant_id, from_warehouse_id);
      await assertLinkedStockWarehouseMapped(tenantId, line.variant_id, to_warehouse_id);
    }
    const completeNow = body.complete !== false;

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        await ensureVariant(tenantId, line.variant_id);
        if (completeNow) {
          await applyStockDelta(tenantId, line.variant_id, from_warehouse_id, -line.qty);
          await applyStockDelta(tenantId, line.variant_id, to_warehouse_id, line.qty);
          await inventoryRepository.createMovement(tenantId, userId, {
            movement_type: "transfer_out",
            qty: line.qty,
            notes: line.notes || `Transfer to warehouse #${to_warehouse_id}`,
            variant_id: line.variant_id,
            warehouse_id: from_warehouse_id,
          });
          await inventoryRepository.createMovement(tenantId, userId, {
            movement_type: "transfer_in",
            qty: line.qty,
            notes: line.notes || `Transfer from warehouse #${from_warehouse_id}`,
            variant_id: line.variant_id,
            warehouse_id: to_warehouse_id,
          });
        }
        const transferId = await inventoryRepository.createTransfer(tenantId, {
          qty: line.qty,
          transfer_status: completeNow ? "completed" : "pending",
          variant_id: line.variant_id,
          from_warehouse_id,
          to_warehouse_id,
        });
        created.push({ id: transferId, variant_id: line.variant_id });
      }
      return { count: created.length, items: created };
    }).then(async (result) => {
      if (!completeNow) return result;
      return afterBulkTransferWithShopify(tenantId, from_warehouse_id, to_warehouse_id, lines, result);
    });
  },

  async completeTransfer(tenantId, userId, id) {
    const transfer = await inventoryRepository.getTransferById(tenantId, id);
    if (!transfer) return null;
    if (transfer.transfer_status === "completed") throw new Error("Transfer already completed");
    if (transfer.transfer_status === "cancelled") throw new Error("Transfer is cancelled");
    await assertLinkedStockWarehouseMapped(tenantId, transfer.variant_id, transfer.from_warehouse_id);
    await assertLinkedStockWarehouseMapped(tenantId, transfer.variant_id, transfer.to_warehouse_id);

    return withTransaction(async () => {
      await applyStockDelta(tenantId, transfer.variant_id, transfer.from_warehouse_id, -transfer.qty);
      await applyStockDelta(tenantId, transfer.variant_id, transfer.to_warehouse_id, transfer.qty);
      await inventoryRepository.createMovement(tenantId, userId, {
        movement_type: "transfer_out",
        qty: transfer.qty,
        notes: `Transfer #${id} out`,
        variant_id: transfer.variant_id,
        warehouse_id: transfer.from_warehouse_id,
      });
      await inventoryRepository.createMovement(tenantId, userId, {
        movement_type: "transfer_in",
        qty: transfer.qty,
        notes: `Transfer #${id} in`,
        variant_id: transfer.variant_id,
        warehouse_id: transfer.to_warehouse_id,
      });
      await inventoryRepository.updateTransferStatus(tenantId, id, "completed");
      return inventoryRepository.getTransferById(tenantId, id);
    }).then(async (result) => afterTransferWithShopify(
      tenantId,
      transfer.variant_id,
      transfer.from_warehouse_id,
      transfer.to_warehouse_id,
      transfer.qty,
      result,
    ));
  },

  async cancelTransfer(tenantId, id) {
    const transfer = await inventoryRepository.getTransferById(tenantId, id);
    if (!transfer) return null;
    if (transfer.transfer_status !== "pending") {
      throw new Error("Only pending transfers can be cancelled");
    }
    await inventoryRepository.updateTransferStatus(tenantId, id, "cancelled");
    return inventoryRepository.getTransferById(tenantId, id);
  },

  async referenceData(tenantId) {
    const [categories, warehouses, products, variants] = await Promise.all([
      inventoryRepository.listCategories(tenantId, { limit: 10000, offset: 0 }),
      inventoryRepository.listAllWarehousesBrief(tenantId),
      inventoryRepository.listAllProductsBrief(tenantId),
      inventoryRepository.listAllVariantsBrief(tenantId),
    ]);
    return {
      categories: categories.rows,
      warehouses,
      products,
      variants,
      movement_types: MOVEMENT_TYPES,
      transfer_statuses: TRANSFER_STATUSES,
      statuses: STATUS_VALUES,
    };
  },
};
