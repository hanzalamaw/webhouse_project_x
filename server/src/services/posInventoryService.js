import { getPool } from "../database/db.js";
import { posInventoryRepository } from "../repositories/posInventoryRepository.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";

const STATUS_VALUES = ["active", "inactive"];
const TRANSFER_STATUSES = ["pending", "completed", "cancelled"];

function assertStatus(status) {
  if (!STATUS_VALUES.includes(status)) throw new Error(`Invalid status. Use: ${STATUS_VALUES.join(", ")}`);
}

function assertPositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer`);
  return n;
}

function assertNonNegativeInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} must be a non-negative integer`);
  return n;
}

function assertPrice(value, label) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) throw new Error(`${label} must be a valid non-negative number`);
  return n;
}

function parsePricingFields(body, existing = {}) {
  return {
    cost_price: assertPrice(body.cost_price ?? existing.cost_price ?? 0, "Cost price"),
    selling_price: assertPrice(body.selling_price ?? existing.selling_price ?? 0, "Selling price"),
    delivery_charges: 0,
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

function parseCreateOutletStocks(body, outletId) {
  const outlet_id = Number(outletId);
  if (Array.isArray(body.warehouse_stocks) && body.warehouse_stocks.length) {
    const stocks = body.warehouse_stocks.map((entry, i) => {
      const label = `store entry ${i + 1}`;
      const entryOutletId = Number(entry.warehouse_id ?? entry.outlet_id);
      if (!entryOutletId) throw new Error(`Select a store for ${label}`);
      if (entryOutletId !== outlet_id) throw new Error("Stock store must match the product store");
      const initial_qty = assertNonNegativeInt(entry.initial_qty ?? entry.available_qty ?? 0, `Available quantity for ${label}`);
      const reserved_qty = assertNonNegativeInt(entry.reserved_qty ?? 0, `Reserved quantity for ${label}`);
      const damaged_qty = assertNonNegativeInt(entry.damaged_qty ?? 0, `Damaged quantity for ${label}`);
      return {
        outlet_id: entryOutletId,
        initial_qty,
        reserved_qty,
        damaged_qty,
        stock_notes: entry.stock_notes ? String(entry.stock_notes).trim() : null,
      };
    });
    return stocks;
  }

  const initial_qty = assertNonNegativeInt(body.initial_qty ?? 0, "Initial quantity");
  const reserved_qty = assertNonNegativeInt(body.reserved_qty ?? 0, "Reserved quantity");
  const damaged_qty = assertNonNegativeInt(body.damaged_qty ?? 0, "Damaged quantity");
  if (initial_qty > 0 || reserved_qty > 0 || damaged_qty > 0) {
    return [{
      outlet_id,
      initial_qty,
      reserved_qty,
      damaged_qty,
      stock_notes: body.stock_notes ? String(body.stock_notes).trim() : null,
    }];
  }
  return [];
}

async function resolveCategoryId(tenantId, body, outletId) {
  const category_name = String(body.category_name || "").trim();
  if (category_name) {
    const cat = await posInventoryRepository.findCategoryByName(tenantId, outletId, category_name);
    if (!cat) throw new Error(`Category not found: "${category_name}"`);
    return cat.id;
  }
  const category_id = Number(body.category_id);
  if (!category_id) throw new Error("Category is required");
  await ensureCategory(tenantId, category_id, outletId);
  return category_id;
}

async function withTransaction(fn) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function ensureOutlet(tenantId, outletId) {
  return posInventoryRepository.ensureOutlet(tenantId, Number(outletId));
}

async function ensureCategory(tenantId, categoryId, outletId = null) {
  const cat = await posInventoryRepository.getCategoryById(tenantId, categoryId);
  if (!cat) throw new Error("Category not found");
  if (outletId != null && Number(cat.outlet_id) !== Number(outletId)) {
    throw new Error("Category does not belong to this store");
  }
  return cat;
}

async function ensureProduct(tenantId, productId) {
  const product = await posInventoryRepository.getProductById(tenantId, productId);
  if (!product) throw new Error("Product not found");
  return product;
}

function parseOutletId(body, existing = null) {
  const outletId = Number(body.outlet_id ?? existing?.outlet_id);
  if (!Number.isInteger(outletId) || outletId <= 0) throw new Error("Store is required");
  return outletId;
}

export const posInventoryService = {
  reference(tenantId, query = {}) {
    const outletId = query.outlet_id ? Number(query.outlet_id) : null;
    return posInventoryRepository.reference(tenantId, outletId);
  },

  async listCategories(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const outletId = query.outlet_id ? Number(query.outlet_id) : null;
    const { rows, total } = await posInventoryRepository.listCategories(tenantId, { limit, offset, outletId });
    return paginatedResponse(rows, total, page, limit);
  },

  async getCategory(tenantId, id) {
    const category = await posInventoryRepository.getCategoryById(tenantId, id);
    if (!category) return null;
    const products = await posInventoryRepository.getCategoryProducts(tenantId, id);
    const all_products = await posInventoryRepository.listAllProductsBrief(tenantId);
    return { ...category, products, all_products };
  },

  async createCategory(tenantId, body) {
    const outlet_id = parseOutletId(body);
    await ensureOutlet(tenantId, outlet_id);
    const category_name = String(body.category_name || "").trim();
    if (!category_name) throw new Error("Category name is required");
    const status = body.status || "active";
    assertStatus(status);
    if (await posInventoryRepository.findCategoryByName(tenantId, outlet_id, category_name)) {
      throw new Error("Category name already exists for this store");
    }
    const id = await posInventoryRepository.createCategory(tenantId, { category_name, status, outlet_id });
    if (Array.isArray(body.product_ids) && body.product_ids.length) {
      await posInventoryRepository.assignProductsToCategory(tenantId, id, body.product_ids.map(Number));
    }
    return this.getCategory(tenantId, id);
  },

  async updateCategory(tenantId, id, body) {
    const existing = await posInventoryRepository.getCategoryById(tenantId, id);
    if (!existing) return null;
    const outlet_id = parseOutletId(body, existing);
    await ensureOutlet(tenantId, outlet_id);
    const category_name = String(body.category_name ?? existing.category_name).trim();
    if (!category_name) throw new Error("Category name is required");
    const status = body.status ?? existing.status;
    assertStatus(status);
    const dup = await posInventoryRepository.findCategoryByName(tenantId, outlet_id, category_name, id);
    if (dup) throw new Error("Category name already exists for this store");
    await posInventoryRepository.updateCategory(tenantId, id, { category_name, status, outlet_id });
    if (Array.isArray(body.product_ids)) {
      await posInventoryRepository.assignProductsToCategory(tenantId, id, body.product_ids.map(Number));
    }
    return this.getCategory(tenantId, id);
  },

  async removeCategory(tenantId, id) {
    return posInventoryRepository.softDeleteCategory(tenantId, id);
  },

  async listProducts(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const outletId = query.outlet_id ? Number(query.outlet_id) : null;
    const { rows, total } = await posInventoryRepository.listProducts(tenantId, { limit, offset, outletId });
    return paginatedResponse(rows, total, page, limit);
  },

  async getProduct(tenantId, id) {
    const product = await posInventoryRepository.getProductById(tenantId, id);
    if (!product) return null;
    const stock_levels = await posInventoryRepository.getProductStockLevels(tenantId, id);
    return { ...product, stock_levels };
  },

  async createProduct(tenantId, userId, body) {
    const outlet_id = parseOutletId(body);
    await ensureOutlet(tenantId, outlet_id);
    const category_id = await resolveCategoryId(tenantId, body, outlet_id);
    const product_name = String(body.product_name || "").trim();
    const sku = String(body.sku || "").trim();
    if (!product_name) throw new Error("Product name is required");
    if (!sku) throw new Error("SKU is required");
    if (await posInventoryRepository.findProductBySku(tenantId, outlet_id, sku)) {
      throw new Error("SKU already exists for this store");
    }
    const status = body.status || "active";
    assertStatus(status);
    const pricing = parsePricingFields(body);
    const outletStocks = parseCreateOutletStocks(body, outlet_id);

    return withTransaction(async () => {
      const id = await posInventoryRepository.createProduct(tenantId, {
        product_name,
        sku,
        unit: String(body.unit || "piece").trim(),
        ...pricing,
        status,
        category_id,
        outlet_id,
      });

      for (const stock of outletStocks) {
        if (stock.initial_qty > 0 || stock.damaged_qty > 0 || stock.reserved_qty > 0) {
          await posInventoryRepository.setStockLevelAbsolute(tenantId, id, stock.outlet_id, {
            available_qty: stock.initial_qty,
            reserved_qty: stock.reserved_qty,
            damaged_qty: stock.damaged_qty,
          });
          if (stock.initial_qty > 0) {
            await posInventoryRepository.createMovement(tenantId, userId, {
              movement_type: "initial_stock",
              qty: stock.initial_qty,
              notes: stock.stock_notes || "Initial stock on product creation",
              product_id: id,
              outlet_id: stock.outlet_id,
            });
          }
        }
      }

      return this.getProduct(tenantId, id);
    });
  },

  async updateProduct(tenantId, id, body) {
    const existing = await posInventoryRepository.getProductById(tenantId, id);
    if (!existing) return null;
    const outlet_id = parseOutletId(body, existing);
    await ensureOutlet(tenantId, outlet_id);
    const category_id = Number(body.category_id ?? existing.category_id);
    await ensureCategory(tenantId, category_id, outlet_id);
    const product_name = String(body.product_name ?? existing.product_name).trim();
    const sku = String(body.sku ?? existing.sku).trim();
    if (!product_name) throw new Error("Product name is required");
    if (!sku) throw new Error("SKU is required");
    if (await posInventoryRepository.findProductBySku(tenantId, outlet_id, sku, id)) {
      throw new Error("SKU already exists for this store");
    }
    const status = body.status ?? existing.status;
    assertStatus(status);
    const pricing = parsePricingFields(body, existing);
    await posInventoryRepository.updateProduct(tenantId, id, {
      product_name,
      sku,
      unit: String(body.unit ?? existing.unit).trim(),
      ...pricing,
      status,
      category_id,
      outlet_id,
    });

    if (Array.isArray(body.stock_levels)) {
      for (const sl of body.stock_levels) {
        const slOutletId = Number(sl.outlet_id ?? sl.warehouse_id ?? outlet_id);
        if (!slOutletId) continue;
        if (slOutletId !== outlet_id) throw new Error("Stock level store must match product store");
        const reserved_qty = assertNonNegativeInt(sl.reserved_qty ?? 0, "Reserved quantity");
        const damaged_qty = assertNonNegativeInt(sl.damaged_qty ?? 0, "Damaged quantity");
        const existingLevel = await posInventoryRepository.getStockLevel(tenantId, id, slOutletId);
        await posInventoryRepository.setStockLevelAbsolute(tenantId, id, slOutletId, {
          available_qty: existingLevel?.available_qty ?? 0,
          reserved_qty,
          damaged_qty,
        });
      }
    }

    return this.getProduct(tenantId, id);
  },

  async exportProducts(tenantId, query = {}) {
    const outletId = query.outlet_id ? Number(query.outlet_id) : null;
    const { rows } = await posInventoryRepository.listProducts(tenantId, { limit: 10000, offset: 0, outletId });
    return rows.map((row) => ({
      product_name: row.product_name,
      sku: row.sku,
      unit: row.unit,
      cost_price: row.cost_price,
      selling_price: row.selling_price,
      discount: row.discount,
      tax: row.tax,
      status: row.status,
      category_name: row.category_name,
      outlet_id: row.outlet_id,
      outlet_name: row.outlet_name,
      initial_qty: row.total_available,
      reserved_qty: row.total_reserved,
      damaged_qty: row.total_damaged,
      stock_notes: "",
    }));
  },

  async importProducts(tenantId, userId, rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("No rows to import");
    const results = { created: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const outlet_id = Number(row.outlet_id);
        if (!outlet_id) throw new Error("outlet_id is required");
        await this.createProduct(tenantId, userId, {
          ...row,
          outlet_id,
          delivery_charges: 0,
          cost_price: row.cost_price ?? 0,
        });
        results.created += 1;
      } catch (e) {
        results.skipped += 1;
        results.errors.push({ row: i + 1, message: e.message });
      }
    }
    return results;
  },

  async removeProduct(tenantId, id) {
    return posInventoryRepository.softDeleteProduct(tenantId, id);
  },

  async listMovements(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const outletId = query.outlet_id ? Number(query.outlet_id) : null;
    const { rows, total } = await posInventoryRepository.listMovements(tenantId, {
      limit,
      offset,
      movement_type: query.movement_type || null,
      outletId,
    });
    return paginatedResponse(rows, total, page, limit);
  },

  async stockIn(tenantId, userId, body) {
    const product_id = Number(body.product_id);
    const outlet_id = Number(body.outlet_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    const product = await ensureProduct(tenantId, product_id);
    if (product.outlet_id !== outlet_id) throw new Error("Product does not belong to this store");
    await ensureOutlet(tenantId, outlet_id);
    return withTransaction(async () => {
      await posInventoryRepository.upsertStockDelta(tenantId, product_id, outlet_id, qty);
      const movementId = await posInventoryRepository.createMovement(tenantId, userId, {
        movement_type: "stock_in",
        qty,
        notes: body.notes || null,
        product_id,
        outlet_id,
      });
      return { id: movementId };
    });
  },

  async stockOut(tenantId, userId, body) {
    const product_id = Number(body.product_id);
    const outlet_id = Number(body.outlet_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    const product = await ensureProduct(tenantId, product_id);
    if (product.outlet_id !== outlet_id) throw new Error("Product does not belong to this store");
    await ensureOutlet(tenantId, outlet_id);
    const level = await posInventoryRepository.getStockLevel(tenantId, product_id, outlet_id);
    if (!level || level.available_qty < qty) throw new Error("Insufficient stock");
    return withTransaction(async () => {
      await posInventoryRepository.upsertStockDelta(tenantId, product_id, outlet_id, -qty);
      const movementId = await posInventoryRepository.createMovement(tenantId, userId, {
        movement_type: "stock_out",
        qty,
        notes: body.notes || null,
        product_id,
        outlet_id,
      });
      return { id: movementId };
    });
  },

  async bulkStockIn(tenantId, userId, body) {
    const outlet_id = Number(body.outlet_id ?? body.warehouse_id);
    if (!outlet_id) throw new Error("Store is required");
    await ensureOutlet(tenantId, outlet_id);
    const lines = normalizeBulkQtyItems(body, "product");

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        const product = await ensureProduct(tenantId, line.product_id);
        if (product.outlet_id !== outlet_id) throw new Error("Product does not belong to this store");
        await posInventoryRepository.upsertStockDelta(tenantId, line.product_id, outlet_id, line.qty);
        const id = await posInventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_in",
          qty: line.qty,
          notes: line.notes,
          product_id: line.product_id,
          outlet_id,
        });
        created.push({ id, product_id: line.product_id });
      }
      return { count: created.length, items: created };
    });
  },

  async bulkStockOut(tenantId, userId, body) {
    const outlet_id = Number(body.outlet_id ?? body.warehouse_id);
    if (!outlet_id) throw new Error("Store is required");
    await ensureOutlet(tenantId, outlet_id);
    const lines = normalizeBulkQtyItems(body, "product");

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        const product = await ensureProduct(tenantId, line.product_id);
        if (product.outlet_id !== outlet_id) throw new Error("Product does not belong to this store");
        const level = await posInventoryRepository.getStockLevel(tenantId, line.product_id, outlet_id);
        if (!level || level.available_qty < line.qty) {
          throw new Error(`Insufficient stock for ${product.product_name}`);
        }
        await posInventoryRepository.upsertStockDelta(tenantId, line.product_id, outlet_id, -line.qty);
        const id = await posInventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_out",
          qty: line.qty,
          notes: line.notes,
          product_id: line.product_id,
          outlet_id,
        });
        created.push({ id, product_id: line.product_id });
      }
      return { count: created.length, items: created };
    });
  },

  async bulkCreateTransfer(tenantId, userId, body) {
    const from_outlet_id = Number(body.from_outlet_id ?? body.from_warehouse_id);
    const to_outlet_id = Number(body.to_outlet_id ?? body.to_warehouse_id);
    if (!from_outlet_id || !to_outlet_id) throw new Error("Source and destination stores are required");
    if (from_outlet_id === to_outlet_id) throw new Error("Source and destination stores must differ");
    await ensureOutlet(tenantId, from_outlet_id);
    await ensureOutlet(tenantId, to_outlet_id);
    const lines = normalizeBulkQtyItems(body, "product");
    const completeNow = body.complete !== false;

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        const sourceProduct = await ensureProduct(tenantId, line.product_id);
        if (sourceProduct.outlet_id !== from_outlet_id) {
          throw new Error("Product does not belong to the source store");
        }
        let destProduct = sourceProduct;
        if (from_outlet_id !== to_outlet_id) {
          destProduct = await posInventoryRepository.findProductBySku(
            tenantId,
            to_outlet_id,
            sourceProduct.sku
          );
          if (!destProduct) {
            throw new Error(`Matching product SKU not found at destination store: ${sourceProduct.sku}`);
          }
        }
        if (completeNow) {
          const level = await posInventoryRepository.getStockLevel(tenantId, line.product_id, from_outlet_id);
          if (!level || level.available_qty < line.qty) {
            throw new Error(`Insufficient stock for ${sourceProduct.product_name}`);
          }
          await posInventoryRepository.upsertStockDelta(tenantId, line.product_id, from_outlet_id, -line.qty);
          await posInventoryRepository.createMovement(tenantId, userId, {
            movement_type: "transfer_out",
            qty: line.qty,
            notes: line.notes || `Transfer to store #${to_outlet_id}`,
            product_id: line.product_id,
            outlet_id: from_outlet_id,
          });
          await posInventoryRepository.upsertStockDelta(tenantId, destProduct.id, to_outlet_id, line.qty);
          await posInventoryRepository.createMovement(tenantId, userId, {
            movement_type: "transfer_in",
            qty: line.qty,
            notes: line.notes || `Transfer from store #${from_outlet_id}`,
            product_id: destProduct.id,
            outlet_id: to_outlet_id,
          });
        }
        const transferId = await posInventoryRepository.createTransfer(tenantId, {
          qty: line.qty,
          transfer_status: completeNow ? "completed" : "pending",
          product_id: line.product_id,
          from_outlet_id,
          to_outlet_id,
        });
        created.push({ id: transferId, product_id: line.product_id });
      }
      return { count: created.length, items: created };
    });
  },

  async listTransfers(tenantId, query) {
    const { page, limit, offset } = parsePagination(query);
    const outletId = query.outlet_id ? Number(query.outlet_id) : null;
    const { rows, total } = await posInventoryRepository.listTransfers(tenantId, { limit, offset, outletId });
    return paginatedResponse(rows, total, page, limit);
  },

  async createTransfer(tenantId, userId, body) {
    const product_id = Number(body.product_id);
    const from_outlet_id = Number(body.from_outlet_id);
    const to_outlet_id = Number(body.to_outlet_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    if (from_outlet_id === to_outlet_id) throw new Error("Source and destination store must differ");
    const product = await ensureProduct(tenantId, product_id);
    if (product.outlet_id !== from_outlet_id) throw new Error("Product does not belong to the source store");
    await ensureOutlet(tenantId, from_outlet_id);
    await ensureOutlet(tenantId, to_outlet_id);
    const level = await posInventoryRepository.getStockLevel(tenantId, product_id, from_outlet_id);
    if (!level || level.available_qty < qty) throw new Error("Insufficient stock at source store");
    const id = await posInventoryRepository.createTransfer(tenantId, {
      qty,
      transfer_status: "pending",
      product_id,
      from_outlet_id,
      to_outlet_id,
    });
    const transfer = await posInventoryRepository.getTransferById(tenantId, id);
    return transfer;
  },

  async completeTransfer(tenantId, userId, id) {
    const transfer = await posInventoryRepository.getTransferById(tenantId, id);
    if (!transfer) return null;
    if (transfer.transfer_status !== "pending") throw new Error("Transfer is not pending");
    const sourceProduct = await posInventoryRepository.getProductById(tenantId, transfer.product_id);
    if (!sourceProduct) throw new Error("Product not found");
    let destProduct = sourceProduct;
    if (transfer.from_outlet_id !== transfer.to_outlet_id) {
      destProduct = await posInventoryRepository.findProductBySku(
        tenantId,
        transfer.to_outlet_id,
        sourceProduct.sku
      );
      if (!destProduct) {
        throw new Error("Matching product SKU not found at destination store. Create the product there first.");
      }
    }
    return withTransaction(async () => {
      await posInventoryRepository.upsertStockDelta(tenantId, transfer.product_id, transfer.from_outlet_id, -transfer.qty);
      await posInventoryRepository.createMovement(tenantId, userId, {
        movement_type: "transfer_out",
        qty: transfer.qty,
        notes: `Transfer #${id}`,
        product_id: transfer.product_id,
        outlet_id: transfer.from_outlet_id,
      });
      await posInventoryRepository.upsertStockDelta(tenantId, destProduct.id, transfer.to_outlet_id, transfer.qty);
      await posInventoryRepository.createMovement(tenantId, userId, {
        movement_type: "transfer_in",
        qty: transfer.qty,
        notes: `Transfer #${id}`,
        product_id: destProduct.id,
        outlet_id: transfer.to_outlet_id,
      });
      await posInventoryRepository.updateTransferStatus(tenantId, id, "completed");
      return posInventoryRepository.getTransferById(tenantId, id);
    });
  },

  async cancelTransfer(tenantId, id) {
    const transfer = await posInventoryRepository.getTransferById(tenantId, id);
    if (!transfer) return null;
    if (transfer.transfer_status !== "pending") throw new Error("Only pending transfers can be cancelled");
    await posInventoryRepository.updateTransferStatus(tenantId, id, "cancelled");
    return posInventoryRepository.getTransferById(tenantId, id);
  },

  listTerminalProducts(tenantId, outletId) {
    return posInventoryRepository.listTerminalProducts(tenantId, outletId);
  },

  async deductSaleStock(tenantId, userId, outletId, items) {
    return withTransaction(async () => {
      for (const item of items) {
        if (!item.product_id) continue;
        const qty = Number(item.quantity);
        const level = await posInventoryRepository.getStockLevel(tenantId, item.product_id, outletId);
        if (level && level.available_qty < qty) {
          throw new Error(`Insufficient stock for ${item.product_name}`);
        }
        await posInventoryRepository.upsertStockDelta(tenantId, item.product_id, outletId, -qty);
        await posInventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_out",
          qty,
          notes: "POS sale",
          product_id: item.product_id,
          outlet_id: outletId,
        });
      }
    });
  },
};
