import { readDb, writeDb } from "../database/db.js";

const PRODUCT_SELECT = `
  p.id, p.product_name, p.sku, p.unit, p.cost_price, p.selling_price,
  p.delivery_charges, p.discount, p.tax,
  p.status, p.created_at, p.updated_at, p.category_id, p.outlet_id, p.tenant_id,
  c.category_name, o.outlet_name,
  COALESCE(SUM(sl.available_qty), 0) AS total_available,
  COALESCE(SUM(sl.reserved_qty), 0) AS total_reserved,
  COALESCE(SUM(sl.damaged_qty), 0) AS total_damaged,
  COALESCE(SUM(sl.total_qty), 0) AS total_qty
`;

const PRODUCT_FROM = `
  FROM pos_products p
  LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
  INNER JOIN pos_outlets o ON o.id = p.outlet_id AND o.deleted_at IS NULL
  LEFT JOIN pos_stock_levels sl ON sl.product_id = p.id AND sl.outlet_id = p.outlet_id AND sl.deleted_at IS NULL
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
      `SELECT p.id, p.product_name, p.sku, p.selling_price, p.outlet_id, o.outlet_name,
              p.category_id, c.category_name, p.status
       FROM pos_products p
       INNER JOIN pos_outlets o ON o.id = p.outlet_id AND o.deleted_at IS NULL
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       WHERE ${tw("p", tenantId)}${productFilter}
       ORDER BY p.product_name ASC`,
      productParams
    );
    return { categories, outlets, products };
  },

  // Categories
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

  async getCategoryProducts(tenantId, categoryId) {
    const [rows] = await readDb.query(
      `SELECT id, product_name, sku, status, category_id, outlet_id
       FROM pos_products
       WHERE tenant_id = ? AND category_id = ? AND deleted_at IS NULL
       ORDER BY product_name ASC`,
      [tenantId, categoryId]
    );
    return rows;
  },

  async listAllProductsBrief(tenantId) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name, p.sku, p.status, p.category_id, p.outlet_id,
              c.category_name, o.outlet_name
       FROM pos_products p
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN pos_outlets o ON o.id = p.outlet_id AND o.deleted_at IS NULL
       WHERE ${tw("p", tenantId)}
       ORDER BY p.product_name ASC`,
      [tenantId]
    );
    return rows;
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

  // Products
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

  async getProductStockLevels(tenantId, productId) {
    const [rows] = await readDb.query(
      `SELECT sl.id, sl.available_qty, sl.reserved_qty, sl.damaged_qty, sl.total_qty,
              sl.updated_at, sl.product_id, sl.outlet_id, sl.tenant_id,
              o.outlet_name, o.city, o.status AS outlet_status
       FROM pos_stock_levels sl
       JOIN pos_outlets o ON o.id = sl.outlet_id AND o.deleted_at IS NULL
       WHERE sl.product_id = ? AND ${tw("sl", tenantId)}
       ORDER BY o.outlet_name ASC`,
      [productId, tenantId]
    );
    return rows;
  },

  async findProductBySku(tenantId, outletId, sku, excludeId = null) {
    const params = [tenantId, outletId, String(sku || "").trim()];
    let sql = `SELECT id FROM pos_products WHERE tenant_id = ? AND deleted_at IS NULL
      AND outlet_id = ? AND sku = ?`;
    if (excludeId != null) {
      sql += " AND id != ?";
      params.push(excludeId);
    }
    sql += " LIMIT 1";
    const [rows] = await readDb.query(sql, params);
    return rows[0] || null;
  },

  async createProduct(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_products
         (product_name, sku, unit, cost_price, selling_price, delivery_charges, discount, tax,
          status, category_id, outlet_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.product_name,
        data.sku,
        data.unit,
        data.cost_price,
        data.selling_price,
        data.delivery_charges,
        data.discount,
        data.tax,
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
         product_name = ?, sku = ?, unit = ?, cost_price = ?, selling_price = ?,
         delivery_charges = ?, discount = ?, tax = ?, status = ?, category_id = ?, outlet_id = ?
       WHERE id = ? AND ${tw("pos_products", tenantId)}`,
      [
        data.product_name,
        data.sku,
        data.unit,
        data.cost_price,
        data.selling_price,
        data.delivery_charges,
        data.discount,
        data.tax,
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
    return result.affectedRows > 0;
  },

  // Stock levels
  async getStockLevel(tenantId, productId, outletId) {
    const [rows] = await readDb.query(
      `SELECT * FROM pos_stock_levels
       WHERE product_id = ? AND outlet_id = ? AND ${tw("pos_stock_levels", tenantId)} LIMIT 1`,
      [productId, outletId, tenantId]
    );
    return rows[0] || null;
  },

  async upsertStockDelta(tenantId, productId, outletId, deltaAvailable, deltaDamaged = 0) {
    const existing = await this.getStockLevel(tenantId, productId, outletId);
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
      `INSERT INTO pos_stock_levels (available_qty, reserved_qty, damaged_qty, total_qty, product_id, outlet_id, tenant_id)
       VALUES (?, 0, ?, ?, ?, ?, ?)`,
      [available, damaged, total, productId, outletId, tenantId]
    );
    return result.insertId;
  },

  async setStockLevelAbsolute(tenantId, productId, outletId, { available_qty, reserved_qty, damaged_qty }) {
    const available = Math.max(0, Number(available_qty) || 0);
    const reserved = Math.max(0, Number(reserved_qty) || 0);
    const damaged = Math.max(0, Number(damaged_qty) || 0);
    const total = available + reserved + damaged;
    const existing = await this.getStockLevel(tenantId, productId, outletId);
    if (existing) {
      await writeDb.query(
        `UPDATE pos_stock_levels SET available_qty = ?, reserved_qty = ?, damaged_qty = ?, total_qty = ? WHERE id = ?`,
        [available, reserved, damaged, total, existing.id]
      );
      return existing.id;
    }
    const [result] = await writeDb.query(
      `INSERT INTO pos_stock_levels (available_qty, reserved_qty, damaged_qty, total_qty, product_id, outlet_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [available, reserved, damaged, total, productId, outletId, tenantId]
    );
    return result.insertId;
  },

  async createMovement(tenantId, userId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_stock_movements (movement_type, qty, notes, product_id, outlet_id, created_by, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.movement_type, data.qty, data.notes || null, data.product_id, data.outlet_id, userId, tenantId]
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
      `SELECT m.id, m.movement_type, m.qty, m.notes, m.created_at, m.outlet_id,
              p.product_name, p.sku, o.outlet_name, u.name AS created_by_name
       FROM pos_stock_movements m
       JOIN pos_products p ON p.id = m.product_id AND p.deleted_at IS NULL
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

  // Transfers
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
      `SELECT t.*, p.product_name, p.sku,
              fo.outlet_name AS from_outlet_name, to_o.outlet_name AS to_outlet_name
       FROM pos_stock_transfers t
       JOIN pos_products p ON p.id = t.product_id AND p.deleted_at IS NULL
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
      `SELECT t.*, p.product_name, p.sku FROM pos_stock_transfers t
       JOIN pos_products p ON p.id = t.product_id AND p.deleted_at IS NULL
       WHERE t.id = ? AND ${tw("t", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createTransfer(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_stock_transfers (qty, transfer_status, product_id, from_outlet_id, to_outlet_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.qty, data.transfer_status || "pending", data.product_id, data.from_outlet_id, data.to_outlet_id, tenantId]
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

  async listTerminalProducts(tenantId, outletId) {
    const oid = Number(outletId);
    if (!Number.isInteger(oid) || oid <= 0) return [];
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name, p.sku, p.unit, p.selling_price, p.discount, p.tax, p.status,
              COALESCE(c.category_name, 'Uncategorized') AS category_name,
              c.id AS category_id,
              COALESCE(sl.available_qty, 0) AS available_qty
       FROM pos_products p
       LEFT JOIN pos_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN pos_stock_levels sl ON sl.product_id = p.id AND sl.outlet_id = p.outlet_id AND sl.deleted_at IS NULL
       WHERE p.tenant_id = ? AND p.deleted_at IS NULL
         AND LOWER(TRIM(p.status)) = 'active'
         AND p.outlet_id = ?
       ORDER BY category_name, p.product_name ASC`,
      [tenantId, oid]
    );
    return rows;
  },
};
