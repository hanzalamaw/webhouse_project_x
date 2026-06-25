import { getPool } from "../database/db.js";
import { inventoryRepository } from "../repositories/inventoryRepository.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";

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

function parsePricingFields(body, existing = {}) {
  return {
    cost_price: assertPrice(body.cost_price ?? existing.cost_price ?? 0, "Cost price"),
    selling_price: assertPrice(body.selling_price ?? existing.selling_price ?? 0, "Selling price"),
    delivery_charges: assertPrice(body.delivery_charges ?? existing.delivery_charges ?? 0, "Delivery charges"),
    discount: assertPrice(body.discount ?? existing.discount ?? 0, "Discount"),
    tax: assertPrice(body.tax ?? existing.tax ?? 0, "Tax"),
  };
}

function normalizeBulkQtyItems(body, label = "item") {
  const items = body.items;
  if (!Array.isArray(items) || !items.length) throw new Error("Select at least one product");
  const sameQty = Boolean(body.same_qty_for_all);
  if (sameQty) {
    const qty = assertPositiveInt(body.qty, "Quantity");
    const notes = body.notes || null;
    return items.map((item) => ({
      product_id: Number(item.product_id),
      qty,
      notes,
    }));
  }
  return items.map((item, i) => ({
    product_id: Number(item.product_id),
    qty: assertPositiveInt(item.qty, `Quantity for ${label} ${i + 1}`),
    notes: item.notes || null,
  }));
}

async function ensureCategory(tenantId, categoryId) {
  const cat = await inventoryRepository.getCategoryById(tenantId, categoryId);
  if (!cat) throw new Error("Category not found");
  return cat;
}

async function ensureUniqueCategoryName(tenantId, categoryName, excludeId = null) {
  const existing = await inventoryRepository.findCategoryByName(tenantId, categoryName, excludeId);
  if (existing) throw new Error("A category with this name already exists");
}

async function resolveCategoryId(tenantId, body) {
  const category_name = String(body.category_name || "").trim();
  if (category_name) {
    const cat = await inventoryRepository.findCategoryByName(tenantId, category_name);
    if (!cat) throw new Error(`Category not found: "${category_name}"`);
    return cat.id;
  }
  const legacyId = body.category_id;
  if (legacyId !== undefined && legacyId !== null && String(legacyId).trim() !== "") {
    const category_id = Number(legacyId);
    if (!category_id) throw new Error("Invalid category");
    await ensureCategory(tenantId, category_id);
    return category_id;
  }
  throw new Error("Category name is required");
}

async function ensureProduct(tenantId, productId) {
  const product = await inventoryRepository.getProductById(tenantId, productId);
  if (!product) throw new Error("Product not found");
  return product;
}

async function ensureWarehouse(tenantId, warehouseId) {
  const wh = await inventoryRepository.getWarehouseById(tenantId, warehouseId);
  if (!wh) throw new Error("Warehouse not found");
  return wh;
}

async function applyStockDelta(tenantId, productId, warehouseId, deltaAvailable, deltaDamaged = 0) {
  const level = await inventoryRepository.getStockLevel(tenantId, productId, warehouseId);
  const current = level?.available_qty ?? 0;
  if (deltaAvailable < 0 && current + deltaAvailable < 0) {
    throw new Error("Insufficient available stock");
  }
  return inventoryRepository.upsertStockLevel(tenantId, productId, warehouseId, deltaAvailable, deltaDamaged);
}

function parseCreateWarehouseStocks(body) {
  if (Array.isArray(body.warehouse_stocks) && body.warehouse_stocks.length) {
    const stocks = body.warehouse_stocks.map((entry, i) => {
      const label = `warehouse entry ${i + 1}`;
      const warehouse_id = Number(entry.warehouse_id);
      if (!warehouse_id) throw new Error(`Select a warehouse for ${label}`);
      const initial_qty = assertNonNegativeInt(entry.initial_qty ?? entry.available_qty ?? 0, `Available quantity for ${label}`);
      const reserved_qty = assertNonNegativeInt(entry.reserved_qty ?? 0, `Reserved quantity for ${label}`);
      const damaged_qty = assertNonNegativeInt(entry.damaged_qty ?? 0, `Damaged quantity for ${label}`);
      return {
        warehouse_id,
        initial_qty,
        reserved_qty,
        damaged_qty,
        stock_notes: entry.stock_notes ? String(entry.stock_notes).trim() : null,
      };
    });
    const ids = stocks.map((s) => s.warehouse_id);
    if (new Set(ids).size !== ids.length) {
      throw new Error("Each warehouse can only be selected once");
    }
    return stocks;
  }

  const initial_qty = assertNonNegativeInt(body.initial_qty ?? 0, "Initial quantity");
  const warehouse_id = body.warehouse_id ? Number(body.warehouse_id) : null;
  const damaged_qty = assertNonNegativeInt(body.damaged_qty ?? 0, "Damaged quantity");
  const reserved_qty = assertNonNegativeInt(body.reserved_qty ?? 0, "Reserved quantity");

  if (initial_qty > 0 && !warehouse_id) {
    throw new Error("Warehouse is required when setting initial stock");
  }
  if (!warehouse_id) return [];
  if (initial_qty === 0 && damaged_qty === 0 && reserved_qty === 0) return [];

  return [{
    warehouse_id,
    initial_qty,
    reserved_qty,
    damaged_qty,
    stock_notes: body.stock_notes ? String(body.stock_notes).trim() : null,
  }];
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

  // Categories
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
    return { ...category, products, all_products };
  },

  async createCategory(tenantId, body) {
    const category_name = String(body.category_name || "").trim();
    if (!category_name) throw new Error("Category name is required");
    const status = body.status || "active";
    assertStatus(status);
    await ensureUniqueCategoryName(tenantId, category_name);

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
    await ensureUniqueCategoryName(tenantId, category_name, id);

    await inventoryRepository.updateCategory(tenantId, id, { category_name, status });
    if (Array.isArray(body.product_ids)) {
      await inventoryRepository.assignProductsToCategory(tenantId, id, body.product_ids.map(Number));
    }
    return this.getCategory(tenantId, id);
  },

  async removeCategory(tenantId, id) {
    return inventoryRepository.softDeleteCategory(tenantId, id);
  },

  // Products
  async listProducts(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await inventoryRepository.listProducts(tenantId, { limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async getProduct(tenantId, id) {
    const product = await inventoryRepository.getProductById(tenantId, id);
    if (!product) return null;
    const stock_levels = await inventoryRepository.getProductStockLevels(tenantId, id);
    return { ...product, stock_levels };
  },

  async createProduct(tenantId, userId, body) {
    const product_name = String(body.product_name || "").trim();
    const sku = String(body.sku || "").trim();
    if (!product_name) throw new Error("Product name is required");
    if (!sku) throw new Error("SKU is required");

    const category_id = await resolveCategoryId(tenantId, body);

    const duplicate = await inventoryRepository.findProductBySku(tenantId, sku);
    if (duplicate) throw new Error("SKU already exists");

    const status = body.status || "active";
    assertStatus(status);
    const unit = String(body.unit || "piece").trim();
    const pricing = parsePricingFields(body);
    const warehouseStocks = parseCreateWarehouseStocks(body);

    for (const stock of warehouseStocks) {
      await ensureWarehouse(tenantId, stock.warehouse_id);
    }

    return withTransaction(async () => {
      const productId = await inventoryRepository.createProduct(tenantId, {
        product_name,
        sku,
        unit,
        ...pricing,
        status,
        category_id,
      });

      for (const stock of warehouseStocks) {
        if (stock.initial_qty > 0 || stock.damaged_qty > 0 || stock.reserved_qty > 0) {
          await inventoryRepository.setStockLevelAbsolute(tenantId, productId, stock.warehouse_id, {
            available_qty: stock.initial_qty,
            reserved_qty: stock.reserved_qty,
            damaged_qty: stock.damaged_qty,
          });
          if (stock.initial_qty > 0) {
            await inventoryRepository.createMovement(tenantId, userId, {
              movement_type: "initial_stock",
              qty: stock.initial_qty,
              notes: stock.stock_notes || "Initial stock on product creation",
              product_id: productId,
              warehouse_id: stock.warehouse_id,
            });
          }
        }
      }

      return this.getProduct(tenantId, productId);
    });
  },

  async updateProduct(tenantId, id, body) {
    const existing = await inventoryRepository.getProductById(tenantId, id);
    if (!existing) return null;

    const product_name = String(body.product_name ?? existing.product_name).trim();
    const sku = String(body.sku ?? existing.sku).trim();
    if (!product_name) throw new Error("Product name is required");
    if (!sku) throw new Error("SKU is required");

    const category_id = Number(body.category_id ?? existing.category_id);
    await ensureCategory(tenantId, category_id);

    const duplicate = await inventoryRepository.findProductBySku(tenantId, sku, id);
    if (duplicate) throw new Error("SKU already exists");

    const status = body.status ?? existing.status;
    assertStatus(status);

    const pricing = parsePricingFields(body, existing);

    await inventoryRepository.updateProduct(tenantId, id, {
      product_name,
      sku,
      unit: String(body.unit ?? existing.unit).trim(),
      ...pricing,
      status,
      category_id,
    });

    if (Array.isArray(body.stock_levels) && body.stock_levels.length) {
      for (const level of body.stock_levels) {
        const warehouse_id = Number(level.warehouse_id);
        if (!warehouse_id) continue;
        await ensureWarehouse(tenantId, warehouse_id);
        const reserved_qty = assertNonNegativeInt(level.reserved_qty ?? 0, "Reserved quantity");
        const damaged_qty = assertNonNegativeInt(level.damaged_qty ?? 0, "Damaged quantity");
        const existingLevel = await inventoryRepository.getStockLevel(tenantId, id, warehouse_id);
        await inventoryRepository.setStockLevelAbsolute(tenantId, id, warehouse_id, {
          available_qty: existingLevel?.available_qty ?? 0,
          reserved_qty,
          damaged_qty,
        });
      }
    }

    return this.getProduct(tenantId, id);
  },

  async removeProduct(tenantId, id) {
    return inventoryRepository.softDeleteProduct(tenantId, id);
  },

  async exportProducts(tenantId) {
    const { rows } = await inventoryRepository.listProducts(tenantId, { limit: 10000, offset: 0 });
    return rows;
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

  // Warehouses
  async listWarehouses(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await inventoryRepository.listWarehouses(tenantId, { limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async getWarehouse(tenantId, id) {
    return inventoryRepository.getWarehouseById(tenantId, id);
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

  // Stock movements
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
    const product_id = Number(body.product_id);
    const warehouse_id = Number(body.warehouse_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    await ensureProduct(tenantId, product_id);
    await ensureWarehouse(tenantId, warehouse_id);

    return withTransaction(async () => {
      await applyStockDelta(tenantId, product_id, warehouse_id, qty);
      const movementId = await inventoryRepository.createMovement(tenantId, userId, {
        movement_type: "stock_in",
        qty,
        notes: body.notes || null,
        product_id,
        warehouse_id,
      });
      const { rows } = await inventoryRepository.listMovements(tenantId, { limit: 1, offset: 0 });
      return rows[0] || { id: movementId };
    });
  },

  async stockOut(tenantId, userId, body) {
    const product_id = Number(body.product_id);
    const warehouse_id = Number(body.warehouse_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    await ensureProduct(tenantId, product_id);
    await ensureWarehouse(tenantId, warehouse_id);

    return withTransaction(async () => {
      await applyStockDelta(tenantId, product_id, warehouse_id, -qty);
      const movementId = await inventoryRepository.createMovement(tenantId, userId, {
        movement_type: "stock_out",
        qty,
        notes: body.notes || null,
        product_id,
        warehouse_id,
      });
      return { id: movementId };
    });
  },

  async bulkStockIn(tenantId, userId, body) {
    const warehouse_id = Number(body.warehouse_id);
    if (!warehouse_id) throw new Error("Warehouse is required");
    await ensureWarehouse(tenantId, warehouse_id);
    const lines = normalizeBulkQtyItems(body, "product");

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        await ensureProduct(tenantId, line.product_id);
        await applyStockDelta(tenantId, line.product_id, warehouse_id, line.qty);
        const id = await inventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_in",
          qty: line.qty,
          notes: line.notes,
          product_id: line.product_id,
          warehouse_id,
        });
        created.push({ id, product_id: line.product_id });
      }
      return { count: created.length, items: created };
    });
  },

  async bulkStockOut(tenantId, userId, body) {
    const warehouse_id = Number(body.warehouse_id);
    if (!warehouse_id) throw new Error("Warehouse is required");
    await ensureWarehouse(tenantId, warehouse_id);
    const lines = normalizeBulkQtyItems(body, "product");

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        await ensureProduct(tenantId, line.product_id);
        await applyStockDelta(tenantId, line.product_id, warehouse_id, -line.qty);
        const id = await inventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_out",
          qty: line.qty,
          notes: line.notes,
          product_id: line.product_id,
          warehouse_id,
        });
        created.push({ id, product_id: line.product_id });
      }
      return { count: created.length, items: created };
    });
  },

  // Transfers
  async listTransfers(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await inventoryRepository.listTransfers(tenantId, { limit, offset });
    return paginatedResponse(rows, total, page, limit);
  },

  async createTransfer(tenantId, userId, body) {
    const product_id = Number(body.product_id);
    const from_warehouse_id = Number(body.from_warehouse_id);
    const to_warehouse_id = Number(body.to_warehouse_id);
    const qty = assertPositiveInt(body.qty, "Quantity");

    if (from_warehouse_id === to_warehouse_id) {
      throw new Error("Source and destination warehouses must be different");
    }

    await ensureProduct(tenantId, product_id);
    await ensureWarehouse(tenantId, from_warehouse_id);
    await ensureWarehouse(tenantId, to_warehouse_id);

    const completeNow = body.complete !== false;

    return withTransaction(async () => {
      if (completeNow) {
        await applyStockDelta(tenantId, product_id, from_warehouse_id, -qty);
        await applyStockDelta(tenantId, product_id, to_warehouse_id, qty);
        await inventoryRepository.createMovement(tenantId, userId, {
          movement_type: "transfer_out",
          qty,
          notes: body.notes || `Transfer to warehouse #${to_warehouse_id}`,
          product_id,
          warehouse_id: from_warehouse_id,
        });
        await inventoryRepository.createMovement(tenantId, userId, {
          movement_type: "transfer_in",
          qty,
          notes: body.notes || `Transfer from warehouse #${from_warehouse_id}`,
          product_id,
          warehouse_id: to_warehouse_id,
        });
      }

      const transferId = await inventoryRepository.createTransfer(tenantId, {
        qty,
        transfer_status: completeNow ? "completed" : "pending",
        product_id,
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
    const lines = normalizeBulkQtyItems(body, "product");
    const completeNow = body.complete !== false;

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        await ensureProduct(tenantId, line.product_id);
        if (completeNow) {
          await applyStockDelta(tenantId, line.product_id, from_warehouse_id, -line.qty);
          await applyStockDelta(tenantId, line.product_id, to_warehouse_id, line.qty);
          await inventoryRepository.createMovement(tenantId, userId, {
            movement_type: "transfer_out",
            qty: line.qty,
            notes: line.notes || `Transfer to warehouse #${to_warehouse_id}`,
            product_id: line.product_id,
            warehouse_id: from_warehouse_id,
          });
          await inventoryRepository.createMovement(tenantId, userId, {
            movement_type: "transfer_in",
            qty: line.qty,
            notes: line.notes || `Transfer from warehouse #${from_warehouse_id}`,
            product_id: line.product_id,
            warehouse_id: to_warehouse_id,
          });
        }
        const transferId = await inventoryRepository.createTransfer(tenantId, {
          qty: line.qty,
          transfer_status: completeNow ? "completed" : "pending",
          product_id: line.product_id,
          from_warehouse_id,
          to_warehouse_id,
        });
        created.push({ id: transferId, product_id: line.product_id });
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
      await applyStockDelta(tenantId, transfer.product_id, transfer.from_warehouse_id, -transfer.qty);
      await applyStockDelta(tenantId, transfer.product_id, transfer.to_warehouse_id, transfer.qty);
      await inventoryRepository.createMovement(tenantId, userId, {
        movement_type: "transfer_out",
        qty: transfer.qty,
        notes: `Transfer #${id} out`,
        product_id: transfer.product_id,
        warehouse_id: transfer.from_warehouse_id,
      });
      await inventoryRepository.createMovement(tenantId, userId, {
        movement_type: "transfer_in",
        qty: transfer.qty,
        notes: `Transfer #${id} in`,
        product_id: transfer.product_id,
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

  // Reference data
  async referenceData(tenantId) {
    const [categories, warehouses, products] = await Promise.all([
      inventoryRepository.listCategories(tenantId, { limit: 10000, offset: 0 }),
      inventoryRepository.listAllWarehousesBrief(tenantId),
      inventoryRepository.listAllProductsBrief(tenantId),
    ]);
    return {
      categories: categories.rows,
      warehouses,
      products,
      movement_types: MOVEMENT_TYPES,
      transfer_statuses: TRANSFER_STATUSES,
      statuses: STATUS_VALUES,
    };
  },
};
