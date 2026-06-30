import { getPool } from "../database/db.js";
import { posInventoryRepository } from "../repositories/posInventoryRepository.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";
import {
  resolveVariantsFromBody,
  reconstructOptionsFromVariants,
  variantComboKey,
} from "../utils/productVariants.js";

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

function parseVariantPricing(body, existing = {}) {
  return {
    cost_price: assertPrice(body.cost_price ?? existing.cost_price ?? 0, "Cost price"),
    selling_price: assertPrice(body.selling_price ?? existing.selling_price ?? 0, "Selling price"),
  };
}

function parseProductPricing(body, existing = {}) {
  return {
    delivery_charges: 0,
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

async function persistPosVariantRow(tenantId, userId, productId, outletId, v) {
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
    const dup = await posInventoryRepository.findVariantBySku(tenantId, outletId, sku, Number(v.id));
    if (dup) throw new Error(`SKU already exists for this store: ${sku}`);
    await posInventoryRepository.updateVariant(tenantId, Number(v.id), {
      sku,
      variant_name,
      ...pricing,
      status: vStatus,
    });
    variantId = Number(v.id);
  } else {
    const dup = await posInventoryRepository.findVariantBySku(tenantId, outletId, sku);
    if (dup) throw new Error(`SKU already exists for this store: ${sku}`);
    variantId = await posInventoryRepository.createVariant(tenantId, {
      product_id: productId,
      outlet_id: outletId,
      sku,
      variant_name,
      ...pricing,
      status: vStatus,
    });
  }

  await posInventoryRepository.setVariantAttributes(tenantId, variantId, v.attributes || []);

  const outletStocks = v.outlet_stocks?.length
    ? v.outlet_stocks
    : v.warehouse_stocks?.length
      ? v.warehouse_stocks
      : [];

  if (Array.isArray(v.stock_levels) && v.stock_levels.length) {
    for (const sl of v.stock_levels) {
      const oid = Number(sl.outlet_id ?? sl.warehouse_id ?? outletId);
      if (!oid) continue;
      await ensureOutlet(tenantId, oid);
      await posInventoryRepository.setStockLevelAbsolute(tenantId, variantId, oid, {
        available_qty: sl.available_qty ?? 0,
        reserved_qty: sl.reserved_qty ?? 0,
        damaged_qty: sl.damaged_qty ?? 0,
      });
    }
  } else if (outletStocks.length) {
    await applyVariantOutletStocks(tenantId, userId, variantId, outletStocks, outletId);
  }

  return variantId;
}

async function syncPosProductVariants(tenantId, userId, productId, outletId, body, productName) {
  const { variants } = resolveVariantsFromBody(body, productName);
  const existing = await posInventoryRepository.getVariantsByProductId(tenantId, productId);
  const existingByKey = new Map();
  for (const v of existing) {
    existingByKey.set(variantComboKey(v.attributes), v);
  }

  const seenKeys = new Set();
  for (const v of variants) {
    const key = v.combo_key || variantComboKey(v.attributes);
    seenKeys.add(key);
    const match = existingByKey.get(key);
    await persistPosVariantRow(tenantId, userId, productId, outletId, {
      ...v,
      id: v.id || match?.id || null,
    });
  }

  for (const v of existing) {
    const key = variantComboKey(v.attributes);
    if (!seenKeys.has(key)) {
      await posInventoryRepository.softDeleteVariant(tenantId, v.id);
    }
  }
}

function parseCreateOutletStocks(body, outletId) {
  const outlet_id = Number(outletId);
  if (Array.isArray(body.warehouse_stocks) && body.warehouse_stocks.length) {
    const stocks = body.warehouse_stocks.map((entry, i) => {
      const label = `store entry ${i + 1}`;
      const entryOutletId = Number(entry.warehouse_id ?? entry.outlet_id);
      if (!entryOutletId) throw new Error(`Select a store for ${label}`);
      if (entryOutletId !== outlet_id) throw new Error("Stock store must match the product store");
      const initial_qty = assertNonNegativeInt(
        entry.initial_qty ?? entry.available_qty ?? 0,
        `Available quantity for ${label}`
      );
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
    return [
      {
        outlet_id,
        initial_qty,
        reserved_qty,
        damaged_qty,
        stock_notes: body.stock_notes ? String(body.stock_notes).trim() : null,
      },
    ];
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

async function ensureVariant(tenantId, variantId) {
  const variant = await posInventoryRepository.getVariantById(tenantId, variantId);
  if (!variant) throw new Error("Variant not found");
  return variant;
}

async function resolveVariantId(tenantId, body) {
  if (body.variant_id) {
    return ensureVariant(tenantId, Number(body.variant_id));
  }
  if (body.product_id) {
    const def = await posInventoryRepository.getDefaultVariantForProduct(tenantId, Number(body.product_id));
    if (!def) throw new Error("Product has no variants");
    return ensureVariant(tenantId, def.id);
  }
  throw new Error("variant_id is required");
}

function parseOutletId(body, existing = null) {
  const outletId = Number(body.outlet_id ?? existing?.outlet_id);
  if (!Number.isInteger(outletId) || outletId <= 0) throw new Error("Store is required");
  return outletId;
}

async function applyStockDelta(tenantId, variantId, outletId, deltaAvailable, deltaDamaged = 0) {
  const level = await posInventoryRepository.getStockLevel(tenantId, variantId, outletId);
  const current = level?.available_qty ?? 0;
  if (deltaAvailable < 0 && current + deltaAvailable < 0) {
    throw new Error("Insufficient available stock");
  }
  return posInventoryRepository.upsertStockDelta(tenantId, variantId, outletId, deltaAvailable, deltaDamaged);
}

async function applyVariantOutletStocks(tenantId, userId, variantId, outletStocks, defaultOutletId) {
  for (const row of outletStocks) {
    const outlet_id = Number(row.outlet_id ?? row.warehouse_id ?? defaultOutletId);
    if (!outlet_id) continue;
    await ensureOutlet(tenantId, outlet_id);
    const initial_qty = assertNonNegativeInt(row.initial_qty ?? row.available_qty ?? 0, "Initial quantity");
    const reserved_qty = assertNonNegativeInt(row.reserved_qty ?? 0, "Reserved quantity");
    const damaged_qty = assertNonNegativeInt(row.damaged_qty ?? 0, "Damaged quantity");
    if (initial_qty > 0 || reserved_qty > 0 || damaged_qty > 0) {
      await posInventoryRepository.setStockLevelAbsolute(tenantId, variantId, outlet_id, {
        available_qty: initial_qty,
        reserved_qty,
        damaged_qty,
      });
      if (initial_qty > 0) {
        await posInventoryRepository.createMovement(tenantId, userId, {
          movement_type: "initial_stock",
          qty: initial_qty,
          notes: row.stock_notes || "Initial stock on product creation",
          variant_id: variantId,
          outlet_id,
        });
      }
    }
  }
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
    const variants = await posInventoryRepository.getVariantsByProductId(tenantId, id);
    for (const v of variants) {
      v.stock_levels = await posInventoryRepository.getVariantStockLevels(tenantId, v.id);
    }
    return { ...product, options: reconstructOptionsFromVariants(variants), variants };
  },

  async createProduct(tenantId, userId, body) {
    const outlet_id = parseOutletId(body);
    await ensureOutlet(tenantId, outlet_id);
    const category_id = await resolveCategoryId(tenantId, body, outlet_id);
    const product_name = String(body.product_name || "").trim();
    if (!product_name) throw new Error("Product name is required");

    const status = body.status || "active";
    assertStatus(status);
    const unit = String(body.unit || "piece").trim();
    const productPricing = parseProductPricing(body);
    const { variants } = resolveVariantsFromBody(body, product_name);

    for (const v of variants) {
      const dup = await posInventoryRepository.findVariantBySku(tenantId, outlet_id, v.sku);
      if (dup) throw new Error(`SKU already exists for this store: ${v.sku}`);
    }

    return withTransaction(async () => {
      const productId = await posInventoryRepository.createProduct(tenantId, {
        product_name,
        unit,
        ...productPricing,
        status,
        category_id,
        outlet_id,
      });

      for (const v of variants) {
        await persistPosVariantRow(tenantId, userId, productId, outlet_id, v);
      }

      return this.getProduct(tenantId, productId);
    });
  },

  async updateProduct(tenantId, userId, id, body) {
    const existing = await posInventoryRepository.getProductById(tenantId, id);
    if (!existing) return null;

    const outlet_id = parseOutletId(body, existing);
    await ensureOutlet(tenantId, outlet_id);
    const category_id = Number(body.category_id ?? existing.category_id);
    await ensureCategory(tenantId, category_id, outlet_id);

    const product_name = String(body.product_name ?? existing.product_name).trim();
    if (!product_name) throw new Error("Product name is required");

    const status = body.status ?? existing.status;
    assertStatus(status);
    const productPricing = parseProductPricing(body, existing);

    await posInventoryRepository.updateProduct(tenantId, id, {
      product_name,
      unit: String(body.unit ?? existing.unit).trim(),
      ...productPricing,
      status,
      category_id,
      outlet_id,
    });

    if (body.options != null || Array.isArray(body.variants)) {
      await syncPosProductVariants(tenantId, userId, id, outlet_id, body, product_name);
    }

    return this.getProduct(tenantId, id);
  },

  async exportProducts(tenantId, query = {}) {
    const outletId = query.outlet_id ? Number(query.outlet_id) : null;
    const { rows } = await posInventoryRepository.listProducts(tenantId, { limit: 10000, offset: 0, outletId });
    const flattened = [];

    for (const p of rows) {
      const full = await this.getProduct(tenantId, p.id);
      if (!full) continue;

      if (!full.variants?.length) {
        flattened.push({
          product_name: full.product_name,
          variant_name: "",
          sku: "",
          unit: full.unit,
          cost_price: "",
          selling_price: "",
          discount: full.discount,
          tax: full.tax,
          status: full.status,
          category_name: full.category_name,
          outlet_id: full.outlet_id,
          outlet_name: full.outlet_name,
          initial_qty: 0,
          reserved_qty: 0,
          damaged_qty: 0,
          stock_notes: "",
        });
        continue;
      }

      for (const v of full.variants) {
        const sl = v.stock_levels?.find((row) => Number(row.outlet_id) === Number(full.outlet_id)) || v.stock_levels?.[0] || {};
        flattened.push({
          product_name: full.product_name,
          variant_name: v.variant_name,
          sku: v.sku,
          unit: full.unit,
          cost_price: v.cost_price,
          selling_price: v.selling_price,
          discount: full.discount,
          tax: full.tax,
          status: v.status,
          category_name: full.category_name,
          outlet_id: full.outlet_id,
          outlet_name: full.outlet_name,
          initial_qty: sl.available_qty ?? v.total_available ?? 0,
          reserved_qty: sl.reserved_qty ?? 0,
          damaged_qty: sl.damaged_qty ?? 0,
          stock_notes: "",
        });
      }
    }

    return flattened;
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
    const outlet_id = Number(body.outlet_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    const variant = await resolveVariantId(tenantId, body);
    if (Number(variant.outlet_id) !== outlet_id) {
      throw new Error("Variant does not belong to this store");
    }
    await ensureOutlet(tenantId, outlet_id);

    return withTransaction(async () => {
      await applyStockDelta(tenantId, variant.id, outlet_id, qty);
      const movementId = await posInventoryRepository.createMovement(tenantId, userId, {
        movement_type: "stock_in",
        qty,
        notes: body.notes || null,
        variant_id: variant.id,
        outlet_id,
      });
      return { id: movementId };
    });
  },

  async stockOut(tenantId, userId, body) {
    const outlet_id = Number(body.outlet_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    const variant = await resolveVariantId(tenantId, body);
    if (Number(variant.outlet_id) !== outlet_id) {
      throw new Error("Variant does not belong to this store");
    }
    await ensureOutlet(tenantId, outlet_id);

    return withTransaction(async () => {
      await applyStockDelta(tenantId, variant.id, outlet_id, -qty);
      const movementId = await posInventoryRepository.createMovement(tenantId, userId, {
        movement_type: "stock_out",
        qty,
        notes: body.notes || null,
        variant_id: variant.id,
        outlet_id,
      });
      return { id: movementId };
    });
  },

  async bulkStockIn(tenantId, userId, body) {
    const outlet_id = Number(body.outlet_id ?? body.warehouse_id);
    if (!outlet_id) throw new Error("Store is required");
    await ensureOutlet(tenantId, outlet_id);
    const lines = normalizeBulkQtyItems(body, "variant");

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        const variant = await ensureVariant(tenantId, line.variant_id);
        if (Number(variant.outlet_id) !== outlet_id) {
          throw new Error("Variant does not belong to this store");
        }
        await applyStockDelta(tenantId, line.variant_id, outlet_id, line.qty);
        const id = await posInventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_in",
          qty: line.qty,
          notes: line.notes,
          variant_id: line.variant_id,
          outlet_id,
        });
        created.push({ id, variant_id: line.variant_id });
      }
      return { count: created.length, items: created };
    });
  },

  async bulkStockOut(tenantId, userId, body) {
    const outlet_id = Number(body.outlet_id ?? body.warehouse_id);
    if (!outlet_id) throw new Error("Store is required");
    await ensureOutlet(tenantId, outlet_id);
    const lines = normalizeBulkQtyItems(body, "variant");

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        const variant = await ensureVariant(tenantId, line.variant_id);
        if (Number(variant.outlet_id) !== outlet_id) {
          throw new Error("Variant does not belong to this store");
        }
        await applyStockDelta(tenantId, line.variant_id, outlet_id, -line.qty);
        const id = await posInventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_out",
          qty: line.qty,
          notes: line.notes,
          variant_id: line.variant_id,
          outlet_id,
        });
        created.push({ id, variant_id: line.variant_id });
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
    const lines = normalizeBulkQtyItems(body, "variant");
    const completeNow = body.complete !== false;

    return withTransaction(async () => {
      const created = [];
      for (const line of lines) {
        const sourceVariant = await ensureVariant(tenantId, line.variant_id);
        if (Number(sourceVariant.outlet_id) !== from_outlet_id) {
          throw new Error("Variant does not belong to the source store");
        }

        let destVariant = sourceVariant;
        if (from_outlet_id !== to_outlet_id) {
          destVariant = await posInventoryRepository.findVariantBySku(
            tenantId,
            to_outlet_id,
            sourceVariant.sku
          );
          if (!destVariant) {
            throw new Error(`Matching variant SKU not found at destination store: ${sourceVariant.sku}`);
          }
        }

        if (completeNow) {
          await applyStockDelta(tenantId, sourceVariant.id, from_outlet_id, -line.qty);
          await posInventoryRepository.createMovement(tenantId, userId, {
            movement_type: "transfer_out",
            qty: line.qty,
            notes: line.notes || `Transfer to store #${to_outlet_id}`,
            variant_id: sourceVariant.id,
            outlet_id: from_outlet_id,
          });
          await applyStockDelta(tenantId, destVariant.id, to_outlet_id, line.qty);
          await posInventoryRepository.createMovement(tenantId, userId, {
            movement_type: "transfer_in",
            qty: line.qty,
            notes: line.notes || `Transfer from store #${from_outlet_id}`,
            variant_id: destVariant.id,
            outlet_id: to_outlet_id,
          });
        }

        const transferId = await posInventoryRepository.createTransfer(tenantId, {
          qty: line.qty,
          transfer_status: completeNow ? "completed" : "pending",
          variant_id: sourceVariant.id,
          from_outlet_id,
          to_outlet_id,
        });
        created.push({ id: transferId, variant_id: sourceVariant.id });
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
    const from_outlet_id = Number(body.from_outlet_id);
    const to_outlet_id = Number(body.to_outlet_id);
    const qty = assertPositiveInt(body.qty, "Quantity");
    if (from_outlet_id === to_outlet_id) throw new Error("Source and destination store must differ");

    const variant = await resolveVariantId(tenantId, body);
    if (Number(variant.outlet_id) !== from_outlet_id) {
      throw new Error("Variant does not belong to the source store");
    }
    await ensureOutlet(tenantId, from_outlet_id);
    await ensureOutlet(tenantId, to_outlet_id);

    const level = await posInventoryRepository.getStockLevel(tenantId, variant.id, from_outlet_id);
    if (!level || level.available_qty < qty) throw new Error("Insufficient stock at source store");

    const id = await posInventoryRepository.createTransfer(tenantId, {
      qty,
      transfer_status: "pending",
      variant_id: variant.id,
      from_outlet_id,
      to_outlet_id,
    });
    return posInventoryRepository.getTransferById(tenantId, id);
  },

  async completeTransfer(tenantId, userId, id) {
    const transfer = await posInventoryRepository.getTransferById(tenantId, id);
    if (!transfer) return null;
    if (transfer.transfer_status !== "pending") throw new Error("Transfer is not pending");

    const sourceVariant = await ensureVariant(tenantId, transfer.variant_id);
    let destVariant = sourceVariant;
    if (transfer.from_outlet_id !== transfer.to_outlet_id) {
      destVariant = await posInventoryRepository.findVariantBySku(
        tenantId,
        transfer.to_outlet_id,
        sourceVariant.sku
      );
      if (!destVariant) {
        throw new Error("Matching variant SKU not found at destination store. Create the variant there first.");
      }
    }

    return withTransaction(async () => {
      await applyStockDelta(tenantId, sourceVariant.id, transfer.from_outlet_id, -transfer.qty);
      await posInventoryRepository.createMovement(tenantId, userId, {
        movement_type: "transfer_out",
        qty: transfer.qty,
        notes: `Transfer #${id}`,
        variant_id: sourceVariant.id,
        outlet_id: transfer.from_outlet_id,
      });
      await applyStockDelta(tenantId, destVariant.id, transfer.to_outlet_id, transfer.qty);
      await posInventoryRepository.createMovement(tenantId, userId, {
        movement_type: "transfer_in",
        qty: transfer.qty,
        notes: `Transfer #${id}`,
        variant_id: destVariant.id,
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
        const variantId = Number(item.variant_id || item.product_id);
        if (!variantId) continue;
        const qty = Number(item.quantity);
        const variant = await ensureVariant(tenantId, variantId);
        if (Number(variant.outlet_id) !== Number(outletId)) {
          throw new Error("Variant does not belong to this store");
        }
        const level = await posInventoryRepository.getStockLevel(tenantId, variantId, outletId);
        if (level && level.available_qty < qty) {
          throw new Error(`Insufficient stock for ${item.product_name || variant.variant_name}`);
        }
        await applyStockDelta(tenantId, variantId, outletId, -qty);
        await posInventoryRepository.createMovement(tenantId, userId, {
          movement_type: "stock_out",
          qty,
          notes: "POS sale",
          variant_id: variantId,
          outlet_id: outletId,
        });
      }
    });
  },
};
