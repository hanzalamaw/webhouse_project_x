import { readDb, writeDb } from "../database/db.js";

const PRODUCT_SELECT = `
  p.id, p.product_name, p.unit, p.delivery_charges, p.discount, p.tax,
  p.status, p.created_at, p.updated_at, p.category_id, p.outlet_id, p.tenant_id,
  c.category_name, o.outlet_name,
  COUNT(DISTINCT v.id) AS variant_count,
  MIN(v.selling_price) AS min_selling_price,
  MAX(v.selling_price) AS max_selling_price,
  MIN(v.cost_price) AS min_cost_price,
  MAX(v.cost_price) AS max_cost_price,
  GROUP_CONCAT(DISTINCT v.sku ORDER BY v.sku SEPARATOR ', ') AS skus,
  COALESCE(SUM(sl.available_qty), 0) AS total_available,
  COALESCE(SUM(sl.reserved_qty), 0) AS total_reserved,
  COALESCE(SUM(sl.damaged_qty), 0) AS total_damaged,
  COALESCE(SUM(sl.total_qty), 0) AS total_qty
`;

const PRODUCT_FROM = `
  FROM pos_products p
  LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
  INNER JOIN pos_outlets o ON o.id = p.outlet_id AND o.deleted_at IS NULL
  LEFT JOIN pos_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
  LEFT JOIN pos_stock_levels sl ON sl.variant_id = v.id AND sl.outlet_id = p.outlet_id AND sl.deleted_at IS NULL
`;

const VARIANT_SELECT = `
  v.id, v.product_id, v.sku, v.variant_name, v.cost_price, v.selling_price,
  v.status, v.created_at, v.updated_at, v.outlet_id, v.tenant_id,
  p.product_name, p.unit, p.delivery_charges, p.discount, p.tax,
  p.category_id, c.category_name, o.outlet_name
`;

function tw(alias, tenantId) {
  return `${alias}.tenant_id = ? AND ${alias}.deleted_at IS NULL`;
}

async function ensureOutlet(tenantId, outletId) {
  const [rows] = await readDb.query(
    `SELECT id FROM pos_outlets WHERE id = ? AND ${tw("pos_outlets", tenantId)} LIMIT 1`,
    [outletId, tenantId]
  );
  if (!rows[0]) throw new Error("Store not found");
  return rows[0].id;
}

export const posInventoryRepository = {
  ensureOutlet,

  // ── Reference data ───────────────────────────────────────────────────────
  async reference(tenantId, outletId = null) {
    const outletFilter = outletId ? " AND c.outlet_id = ?" : "";
    const params = outletId ? [tenantId, outletId] : [tenantId];
    const [categories] = await readDb.query(
      `SELECT c.id, c.category_name, c.status, c.outlet_id, o.outlet_name
       FROM pos_categories c
       INNER JOIN pos_outlets o ON o.id = c.outlet_id AND o.deleted_at IS NULL
       WHERE ${tw("c", tenantId)}${outletFilter}
       ORDER BY o.outlet_name, c.category_name`,
      params
    );
    const [outlets] = await readDb.query(
      `SELECT id, outlet_name, city, status FROM pos_outlets
       WHERE ${tw("pos_outlets", tenantId)} AND status = 'active'
       ORDER BY outlet_name ASC`,
      [tenantId]
    );
    const productParams = outletId ? [tenantId, outletId] : [tenantId];
    const productFilter = outletId ? " AND p.outlet_id = ?" : "";
    const [products] = await readDb.query(
      `SELECT p.id, p.product_name, p.outlet_id, o.outlet_name,
              p.category_id, c.category_name, p.status,
              COUNT(v.id) AS variant_count
       FROM pos_products p
       INNER JOIN pos_outlets o ON o.id = p.outlet_id AND o.deleted_at IS NULL
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN pos_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       WHERE ${tw("p", tenantId)}${productFilter}
       GROUP BY p.id
       ORDER BY p.product_name ASC`,
      productParams
    );
    const variantParams = outletId ? [tenantId, outletId] : [tenantId];
    const variantFilter = outletId ? " AND v.outlet_id = ?" : "";
    const [variants] = await readDb.query(
      `SELECT v.id, v.product_id, v.sku, v.variant_name, v.selling_price, v.cost_price,
              v.status, v.outlet_id, o.outlet_name,
              p.product_name, p.category_id, c.category_name
       FROM pos_product_variants v
       JOIN pos_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       INNER JOIN pos_outlets o ON o.id = v.outlet_id AND o.deleted_at IS NULL
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       WHERE ${tw("v", tenantId)}${variantFilter}
       ORDER BY p.product_name ASC, v.variant_name ASC`,
      variantParams
    );
    return { categories, outlets, products, variants };
  },

  // ── Categories ─────────────────────────────────────────────────────────────
  async listCategories(tenantId, { limit, offset, outletId = null }) {
    const params = [tenantId];
    let outletFilter = "";
    if (outletId) {
      outletFilter = " AND c.outlet_id = ?";
      params.push(outletId);
    }
    params.push(limit, offset);
    const [rows] = await readDb.query(
      `SELECT c.id, c.category_name, c.status, c.outlet_id, c.created_at, c.tenant_id,
              o.outlet_name, COUNT(p.id) AS product_count
       FROM pos_categories c
       INNER JOIN pos_outlets o ON o.id = c.outlet_id AND o.deleted_at IS NULL
       LEFT JOIN pos_products p ON p.category_id = c.id AND p.deleted_at IS NULL
       WHERE ${tw("c", tenantId)}${outletFilter}
       GROUP BY c.id
       ORDER BY o.outlet_name, c.category_name ASC
       LIMIT ? OFFSET ?`,
      params
    );
    const countParams = outletId ? [tenantId, outletId] : [tenantId];
    const countFilter = outletId ? " AND outlet_id = ?" : "";
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM pos_categories c WHERE ${tw("c", tenantId)}${countFilter}`,
      countParams
    );
    return { rows, total };
  },

  async getCategoryById(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT c.*, o.outlet_name FROM pos_categories c
       INNER JOIN pos_outlets o ON o.id = c.outlet_id AND o.deleted_at IS NULL
       WHERE c.id = ? AND ${tw("c", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async findCategoryByName(tenantId, outletId, categoryName, excludeId = null) {
    const name = String(categoryName || "").trim();
    if (!name) return null;
    const params = [tenantId, outletId, name];
    let sql = `SELECT * FROM pos_categories WHERE tenant_id = ? AND deleted_at IS NULL
      AND outlet_id = ? AND LOWER(TRIM(category_name)) = LOWER(?)`;
    if (excludeId != null) {
      sql += " AND id != ?";
      params.push(excludeId);
    }
    sql += " LIMIT 1";
    const [rows] = await readDb.query(sql, params);
    return rows[0] || null;
  },

  async getCategoryProducts(tenantId, categoryId) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name, p.status, p.category_id, p.outlet_id,
              COUNT(v.id) AS variant_count,
              GROUP_CONCAT(v.sku ORDER BY v.sku SEPARATOR ', ') AS skus
       FROM pos_products p
       LEFT JOIN pos_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       WHERE p.tenant_id = ? AND p.category_id = ? AND p.deleted_at IS NULL
       GROUP BY p.id
       ORDER BY p.product_name ASC`,
      [tenantId, categoryId]
    );
    return rows;
  },

  async createCategory(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_categories (category_name, status, outlet_id, tenant_id) VALUES (?, ?, ?, ?)`,
      [data.category_name, data.status, data.outlet_id, tenantId]
    );
    return result.insertId;
  },

  async updateCategory(tenantId, id, data) {
    await writeDb.query(
      `UPDATE pos_categories SET category_name = ?, status = ?, outlet_id = ?
       WHERE id = ? AND ${tw("pos_categories", tenantId)}`,
      [data.category_name, data.status, data.outlet_id, id, tenantId]
    );
  },

  async softDeleteCategory(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE pos_categories SET deleted_at = NOW() WHERE id = ? AND ${tw("pos_categories", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async assignProductsToCategory(tenantId, categoryId, productIds) {
    if (!productIds?.length) return;
    const placeholders = productIds.map(() => "?").join(",");
    await writeDb.query(
      `UPDATE pos_products SET category_id = ?
       WHERE tenant_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
      [categoryId, tenantId, ...productIds]
    );
  },

  // ── Products (parent) ────────────────────────────────────────────────────
  async listProducts(tenantId, { limit, offset, outletId = null }) {
    const params = [tenantId];
    let outletFilter = "";
    if (outletId) {
      outletFilter = " AND p.outlet_id = ?";
      params.push(outletId);
    }
    params.push(limit, offset);
    const [rows] = await readDb.query(
      `SELECT ${PRODUCT_SELECT} ${PRODUCT_FROM}
       WHERE ${tw("p", tenantId)}${outletFilter}
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );
    const countParams = outletId ? [tenantId, outletId] : [tenantId];
    const countFilter = outletId ? " AND outlet_id = ?" : "";
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM pos_products p WHERE ${tw("p", tenantId)}${countFilter}`,
      countParams
    );
    return { rows, total };
  },

  async getProductById(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT ${PRODUCT_SELECT} ${PRODUCT_FROM}
       WHERE p.id = ? AND ${tw("p", tenantId)}
       GROUP BY p.id
       LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createProduct(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_products
         (product_name, unit, delivery_charges, discount, tax, status, category_id, outlet_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.product_name,
        data.unit,
        data.delivery_charges ?? 0,
        data.discount ?? 0,
        data.tax ?? 0,
        data.status,
        data.category_id,
        data.outlet_id,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateProduct(tenantId, id, data) {
    await writeDb.query(
      `UPDATE pos_products SET
         product_name = ?, unit = ?, delivery_charges = ?, discount = ?, tax = ?,
         status = ?, category_id = ?, outlet_id = ?
       WHERE id = ? AND ${tw("pos_products", tenantId)}`,
      [
        data.product_name,
        data.unit,
        data.delivery_charges ?? 0,
        data.discount ?? 0,
        data.tax ?? 0,
        data.status,
        data.category_id,
        data.outlet_id,
        id,
        tenantId,
      ]
    );
  },

  async softDeleteProduct(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE pos_products SET deleted_at = NOW() WHERE id = ? AND ${tw("pos_products", tenantId)}`,
      [id, tenantId]
    );
    if (result.affectedRows > 0) {
      await writeDb.query(
        `UPDATE pos_product_variants SET deleted_at = NOW()
         WHERE product_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [id, tenantId]
      );
    }
    return result.affectedRows > 0;
  },

  async listAllProductsBrief(tenantId) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name, p.status, p.category_id, p.outlet_id,
              c.category_name, o.outlet_name,
              COUNT(v.id) AS variant_count
       FROM pos_products p
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN pos_outlets o ON o.id = p.outlet_id AND o.deleted_at IS NULL
       LEFT JOIN pos_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       WHERE ${tw("p", tenantId)}
       GROUP BY p.id
       ORDER BY p.product_name ASC`,
      [tenantId]
    );
    return rows;
  },

  // ── Variants ───────────────────────────────────────────────────────────────
  async getVariantsByProductId(tenantId, productId) {
    const [rows] = await readDb.query(
      `SELECT ${VARIANT_SELECT},
              COALESCE(sl.available_qty, 0) AS total_available,
              COALESCE(sl.total_qty, 0) AS total_qty
       FROM pos_product_variants v
       JOIN pos_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       INNER JOIN pos_outlets o ON o.id = v.outlet_id AND o.deleted_at IS NULL
       LEFT JOIN pos_stock_levels sl ON sl.variant_id = v.id AND sl.outlet_id = v.outlet_id AND sl.deleted_at IS NULL
       WHERE v.product_id = ? AND ${tw("v", tenantId)}
       ORDER BY v.variant_name ASC`,
      [productId, tenantId]
    );
    for (const row of rows) {
      row.attributes = await this.getVariantAttributes(row.id);
    }
    return rows;
  },

  async getVariantById(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT ${VARIANT_SELECT}
       FROM pos_product_variants v
       JOIN pos_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       INNER JOIN pos_outlets o ON o.id = v.outlet_id AND o.deleted_at IS NULL
       WHERE v.id = ? AND ${tw("v", tenantId)}
       LIMIT 1`,
      [id, tenantId]
    );
    if (!rows[0]) return null;
    rows[0].attributes = await this.getVariantAttributes(id);
    return rows[0];
  },

  async getDefaultVariantForProduct(tenantId, productId) {
    const [rows] = await readDb.query(
      `SELECT id FROM pos_product_variants
       WHERE product_id = ? AND ${tw("pos_product_variants", tenantId)}
       ORDER BY id ASC LIMIT 1`,
      [productId, tenantId]
    );
    return rows[0] || null;
  },

  async findVariantBySku(tenantId, outletId, sku, excludeId = null) {
    const params = [tenantId, outletId, String(sku || "").trim()];
    let sql = `SELECT v.id, v.product_id, v.sku, v.variant_name, v.cost_price, v.selling_price, v.status, v.outlet_id
       FROM pos_product_variants v
       WHERE v.tenant_id = ? AND v.outlet_id = ? AND v.sku = ? AND v.deleted_at IS NULL`;
    if (excludeId != null) {
      sql += " AND v.id != ?";
      params.push(excludeId);
    }
    sql += " LIMIT 1";
    const [rows] = await readDb.query(sql, params);
    return rows[0] || null;
  },

  /** @deprecated use findVariantBySku */
  async findProductBySku(tenantId, outletId, sku, excludeId = null) {
    return this.findVariantBySku(tenantId, outletId, sku, excludeId);
  },

  async createVariant(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_product_variants
         (product_id, outlet_id, sku, variant_name, cost_price, selling_price, status, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.product_id,
        data.outlet_id,
        data.sku,
        data.variant_name,
        data.cost_price,
        data.selling_price,
        data.status,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateVariant(tenantId, id, data) {
    await writeDb.query(
      `UPDATE pos_product_variants
       SET sku = ?, variant_name = ?, cost_price = ?, selling_price = ?, status = ?
       WHERE id = ? AND ${tw("pos_product_variants", tenantId)}`,
      [data.sku, data.variant_name, data.cost_price, data.selling_price, data.status, id, tenantId]
    );
  },

  async softDeleteVariant(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE pos_product_variants SET deleted_at = NOW()
       WHERE id = ? AND ${tw("pos_product_variants", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async getVariantAttributes(variantId) {
    const [rows] = await readDb.query(
      `SELECT a.attribute_name, av.value
       FROM pos_variant_attribute_values av
       JOIN pos_variant_attributes a ON a.id = av.attribute_id
       WHERE av.variant_id = ?
       ORDER BY a.attribute_name ASC`,
      [variantId]
    );
    return rows;
  },

  async ensureAttribute(tenantId, attributeName) {
    const name = String(attributeName || "").trim();
    if (!name) return null;
    const [existing] = await readDb.query(
      `SELECT id FROM pos_variant_attributes
       WHERE tenant_id = ? AND LOWER(attribute_name) = LOWER(?)
       LIMIT 1`,
      [tenantId, name]
    );
    if (existing[0]) return existing[0].id;
    const [result] = await writeDb.query(
      `INSERT INTO pos_variant_attributes (attribute_name, tenant_id) VALUES (?, ?)`,
      [name, tenantId]
    );
    return result.insertId;
  },

  async setVariantAttributes(tenantId, variantId, attributes) {
    await writeDb.query(
      `DELETE av FROM pos_variant_attribute_values av WHERE av.variant_id = ?`,
      [variantId]
    );
    if (!Array.isArray(attributes) || !attributes.length) return;
    for (const attr of attributes) {
      const attrName = String(attr.attribute_name || attr.name || "").trim();
      const value = String(attr.value || "").trim();
      if (!attrName || !value) continue;
      const attributeId = await this.ensureAttribute(tenantId, attrName);
      await writeDb.query(
        `INSERT INTO pos_variant_attribute_values (variant_id, attribute_id, value) VALUES (?, ?, ?)`,
        [variantId, attributeId, value]
      );
    }
  },

  async listAllVariantsBrief(tenantId) {
    const [rows] = await readDb.query(
      `SELECT v.id, v.product_id, v.sku, v.variant_name, v.selling_price, v.cost_price, v.status,
              v.outlet_id, o.outlet_name,
              p.product_name, p.unit, p.delivery_charges, p.discount, p.tax,
              p.category_id, c.category_name,
              COALESCE(sl.available_qty, 0) AS total_available
       FROM pos_product_variants v
       JOIN pos_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       INNER JOIN pos_outlets o ON o.id = v.outlet_id AND o.deleted_at IS NULL
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN pos_stock_levels sl ON sl.variant_id = v.id AND sl.outlet_id = v.outlet_id AND sl.deleted_at IS NULL
       WHERE ${tw("v", tenantId)} AND LOWER(TRIM(v.status)) = 'active'
       ORDER BY p.product_name ASC, v.variant_name ASC`,
      [tenantId]
    );
    return rows;
  },

  async getVariantStockLevels(tenantId, variantId) {
    const [rows] = await readDb.query(
      `SELECT sl.id, sl.available_qty, sl.reserved_qty, sl.damaged_qty, sl.total_qty,
              sl.updated_at, sl.variant_id, sl.outlet_id, sl.tenant_id,
              o.outlet_name, o.city, o.status AS outlet_status
       FROM pos_stock_levels sl
       JOIN pos_outlets o ON o.id = sl.outlet_id AND o.deleted_at IS NULL
       WHERE sl.variant_id = ? AND ${tw("sl", tenantId)}
       ORDER BY o.outlet_name ASC`,
      [variantId, tenantId]
    );
    return rows;
  },

  // ── Stock levels (variant-scoped) ──────────────────────────────────────────
  async getStockLevel(tenantId, variantId, outletId) {
    const [rows] = await readDb.query(
      `SELECT id, available_qty, reserved_qty, damaged_qty, total_qty
       FROM pos_stock_levels
       WHERE variant_id = ? AND outlet_id = ? AND ${tw("pos_stock_levels", tenantId)}
       LIMIT 1`,
      [variantId, outletId, tenantId]
    );
    return rows[0] || null;
  },

  async upsertStockDelta(tenantId, variantId, outletId, deltaAvailable, deltaDamaged = 0) {
    const existing = await this.getStockLevel(tenantId, variantId, outletId);
    if (existing) {
      const available = Math.max(0, existing.available_qty + deltaAvailable);
      const damaged = Math.max(0, existing.damaged_qty + deltaDamaged);
      const total = available + existing.reserved_qty + damaged;
      await writeDb.query(
        `UPDATE pos_stock_levels SET available_qty = ?, damaged_qty = ?, total_qty = ? WHERE id = ?`,
        [available, damaged, total, existing.id]
      );
      return existing.id;
    }
    const available = Math.max(0, deltaAvailable);
    const damaged = Math.max(0, deltaDamaged);
    const total = available + damaged;
    const [result] = await writeDb.query(
      `INSERT INTO pos_stock_levels
         (available_qty, reserved_qty, damaged_qty, total_qty, variant_id, outlet_id, tenant_id)
       VALUES (?, 0, ?, ?, ?, ?, ?)`,
      [available, damaged, total, variantId, outletId, tenantId]
    );
    return result.insertId;
  },

  async setStockLevelAbsolute(tenantId, variantId, outletId, { available_qty, reserved_qty, damaged_qty }) {
    const available = Math.max(0, Number(available_qty) || 0);
    const reserved = Math.max(0, Number(reserved_qty) || 0);
    const damaged = Math.max(0, Number(damaged_qty) || 0);
    const total = available + reserved + damaged;
    const existing = await this.getStockLevel(tenantId, variantId, outletId);
    if (existing) {
      await writeDb.query(
        `UPDATE pos_stock_levels SET available_qty = ?, reserved_qty = ?, damaged_qty = ?, total_qty = ? WHERE id = ?`,
        [available, reserved, damaged, total, existing.id]
      );
      return existing.id;
    }
    const [result] = await writeDb.query(
      `INSERT INTO pos_stock_levels
         (available_qty, reserved_qty, damaged_qty, total_qty, variant_id, outlet_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [available, reserved, damaged, total, variantId, outletId, tenantId]
    );
    return result.insertId;
  },

  // ── Stock movements ────────────────────────────────────────────────────────
  async createMovement(tenantId, userId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_stock_movements
         (movement_type, qty, notes, variant_id, outlet_id, created_by, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.movement_type,
        data.qty,
        data.notes || null,
        data.variant_id,
        data.outlet_id,
        userId,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async listMovements(tenantId, { limit, offset, movement_type, outletId = null }) {
    const params = [tenantId];
    let filters = "";
    if (movement_type) {
      filters += " AND m.movement_type = ?";
      params.push(movement_type);
    }
    if (outletId) {
      filters += " AND m.outlet_id = ?";
      params.push(outletId);
    }
    params.push(limit, offset);
    const [rows] = await readDb.query(
      `SELECT m.id, m.movement_type, m.qty, m.notes, m.created_at,
              m.variant_id, m.outlet_id, m.created_by, m.tenant_id,
              p.product_name, v.sku, v.variant_name, o.outlet_name, u.name AS created_by_name
       FROM pos_stock_movements m
       JOIN pos_product_variants v ON v.id = m.variant_id AND v.deleted_at IS NULL
       JOIN pos_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       JOIN pos_outlets o ON o.id = m.outlet_id AND o.deleted_at IS NULL
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.tenant_id = ? AND m.deleted_at IS NULL${filters}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );
    const countParams = [tenantId];
    let countFilter = "";
    if (movement_type) {
      countFilter += " AND movement_type = ?";
      countParams.push(movement_type);
    }
    if (outletId) {
      countFilter += " AND outlet_id = ?";
      countParams.push(outletId);
    }
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM pos_stock_movements
       WHERE tenant_id = ? AND deleted_at IS NULL${countFilter}`,
      countParams
    );
    return { rows, total };
  },

  // ── Stock transfers ────────────────────────────────────────────────────────
  async listTransfers(tenantId, { limit, offset, outletId = null }) {
    const params = [tenantId];
    let filter = "";
    if (outletId) {
      filter = " AND (t.from_outlet_id = ? OR t.to_outlet_id = ?)";
      params.push(outletId, outletId);
    }
    const countParams = [...params];
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM pos_stock_transfers t WHERE ${tw("t", tenantId)}${filter}`,
      countParams
    );
    params.push(limit, offset);
    const [rows] = await readDb.query(
      `SELECT t.id, t.qty, t.transfer_status, t.created_at, t.updated_at,
              t.variant_id, t.from_outlet_id, t.to_outlet_id, t.tenant_id,
              p.product_name, v.sku, v.variant_name,
              fo.outlet_name AS from_outlet_name, to_o.outlet_name AS to_outlet_name
       FROM pos_stock_transfers t
       JOIN pos_product_variants v ON v.id = t.variant_id AND v.deleted_at IS NULL
       JOIN pos_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       JOIN pos_outlets fo ON fo.id = t.from_outlet_id AND fo.deleted_at IS NULL
       JOIN pos_outlets to_o ON to_o.id = t.to_outlet_id AND to_o.deleted_at IS NULL
       WHERE ${tw("t", tenantId)}${filter}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );
    return { rows, total };
  },

  async getTransferById(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT t.*, p.product_name, v.sku, v.variant_name,
              fo.outlet_name AS from_outlet_name, to_o.outlet_name AS to_outlet_name
       FROM pos_stock_transfers t
       JOIN pos_product_variants v ON v.id = t.variant_id AND v.deleted_at IS NULL
       JOIN pos_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       JOIN pos_outlets fo ON fo.id = t.from_outlet_id AND fo.deleted_at IS NULL
       JOIN pos_outlets to_o ON to_o.id = t.to_outlet_id AND to_o.deleted_at IS NULL
       WHERE t.id = ? AND ${tw("t", tenantId)}
       LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createTransfer(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_stock_transfers
         (qty, transfer_status, variant_id, from_outlet_id, to_outlet_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.qty,
        data.transfer_status || "pending",
        data.variant_id,
        data.from_outlet_id,
        data.to_outlet_id,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateTransferStatus(tenantId, id, status) {
    await writeDb.query(
      `UPDATE pos_stock_transfers SET transfer_status = ?, updated_at = NOW()
       WHERE id = ? AND ${tw("pos_stock_transfers", tenantId)}`,
      [status, id, tenantId]
    );
  },

  // ── POS terminal catalog ───────────────────────────────────────────────────
  async listTerminalProducts(tenantId, outletId) {
    const oid = Number(outletId);
    if (!Number.isInteger(oid) || oid <= 0) return [];
    const [rows] = await readDb.query(
      `SELECT v.id, v.product_id, p.product_name, v.sku, v.variant_name, p.unit,
              v.selling_price, p.discount, p.tax, v.status,
              COALESCE(c.category_name, 'Uncategorized') AS category_name,
              c.id AS category_id,
              COALESCE(sl.available_qty, 0) AS available_qty,
              v.outlet_id
       FROM pos_product_variants v
       JOIN pos_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN pos_stock_levels sl ON sl.variant_id = v.id AND sl.outlet_id = v.outlet_id AND sl.deleted_at IS NULL
       WHERE v.tenant_id = ? AND v.deleted_at IS NULL
         AND LOWER(TRIM(v.status)) = 'active'
         AND LOWER(TRIM(p.status)) = 'active'
         AND v.outlet_id = ?
       ORDER BY category_name, p.product_name ASC, v.variant_name ASC`,
      [tenantId, oid]
    );
    return rows;
  },
};
