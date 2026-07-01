import { getPool } from "../database/db.js";
import { inventoryRepository } from "../repositories/inventoryRepository.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";
import {
  resolveVariantsFromBody,
  reconstructOptionsFromVariants,
  variantComboKey,
} from "../utils/productVariants.js";

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
  const existing = await inventoryRepository.getVariantsByProductId(tenantId, productId);
  const existingByKey = new Map();
  for (const v of existing) {
    existingByKey.set(variantComboKey(v.attributes), v);
  }

  const seenKeys = new Set();
  for (const v of variants) {
    const key = v.combo_key || variantComboKey(v.attributes);
    seenKeys.add(key);
    const match = existingByKey.get(key);
    await persistVariantRow(tenantId, userId, productId, {
      ...v,
      id: v.id || match?.id || null,
    });
  }

  for (const v of existing) {
    const key = variantComboKey(v.attributes);
    if (!seenKeys.has(key)) {
      await inventoryRepository.softDeleteVariant(tenantId, v.id);
    }
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

    for (const v of variants) {
      const dup = await inventoryRepository.findVariantBySku(tenantId, v.sku);
      if (dup) throw new Error(`SKU already exists: ${v.sku}`);
    }

    return withTransaction(async () => {
      const productId = await inventoryRepository.createProduct(tenantId, {
        product_name,
        unit,
        ...productPricing,
        status,
        category_id,
      });

      for (const v of variants) {
        await persistVariantRow(tenantId, userId, productId, v);
      }

      return this.getProduct(tenantId, productId);
    });
  },

  async updateProduct(tenantId, userId, id, body) {
    const existing = await inventoryRepository.getProductById(tenantId, id);
    if (!existing) return null;

    const product_name = String(body.product_name ?? existing.product_name).trim();
    if (!product_name) throw new Error("Product name is required");

    const category_id = Number(body.category_id ?? existing.category_id);
    await ensureCategory(tenantId, category_id);

    const status = body.status ?? existing.status;
    assertStatus(status);
    const productPricing = parseProductPricing(body, existing);

    await inventoryRepository.updateProduct(tenantId, id, {
      product_name,
      unit: String(body.unit ?? existing.unit).trim(),
      ...productPricing,
      status,
      category_id,
    });

    if (body.options != null || Array.isArray(body.variants)) {
      await syncProductVariants(tenantId, userId, id, body, product_name);
    }

    return this.getProduct(tenantId, id);
  },

  async removeProduct(tenantId, id) {
    return inventoryRepository.softDeleteProduct(tenantId, id);
  },

  async exportProducts(tenantId) {
    const products = [];
    const { rows } = await inventoryRepository.listProducts(tenantId, { limit: 10000, offset: 0 });
    for (const p of rows) {
      const full = await this.getProduct(tenantId, p.id);
      products.push(full);
    }
    return products;
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
    const { rows, total } = await inventoryRepository.listWarehouses(tenantId, { limit, offset });
    return paginatedResponse(rows, total, page, limit);
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

    const id = await inventoryRepository.createWarehouse(tenantId, {
      warehouse_name,
      location: body.location || null,
      city: body.city || null,
      status,
    });
    return inventoryRepository.getWarehouseById(tenantId, id);
  },

  async updateWarehouse(tenantId, id, body) {
    const existing = await inventoryRepository.getWarehouseById(tenantId, id);
    if (!existing) return null;

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
    return inventoryRepository.getWarehouseById(tenantId, id);
  },

  async removeWarehouse(tenantId, id) {
    return inventoryRepository.softDeleteWarehouse(tenantId, id);
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
    });
  },

  async stockOut(tenantId, userId, body) {
    const warehouse_id = Number(body.warehouse_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    const variant = await resolveVariantId(tenantId, body);
    await ensureWarehouse(tenantId, warehouse_id);

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
    });
  },

  async bulkStockIn(tenantId, userId, body) {
    const warehouse_id = Number(body.warehouse_id);
    if (!warehouse_id) throw new Error("Warehouse is required");
    await ensureWarehouse(tenantId, warehouse_id);
    const lines = normalizeBulkQtyItems(body, "variant");

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
    });
  },

  async bulkStockOut(tenantId, userId, body) {
    const warehouse_id = Number(body.warehouse_id);
    if (!warehouse_id) throw new Error("Warehouse is required");
    await ensureWarehouse(tenantId, warehouse_id);
    const lines = normalizeBulkQtyItems(body, "variant");

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
    });
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
    });
  },

  async completeTransfer(tenantId, userId, id) {
    const transfer = await inventoryRepository.getTransferById(tenantId, id);
    if (!transfer) return null;
    if (transfer.transfer_status === "completed") throw new Error("Transfer already completed");
    if (transfer.transfer_status === "cancelled") throw new Error("Transfer is cancelled");

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
    });
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
