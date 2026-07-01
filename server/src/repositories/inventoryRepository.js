import { readDb, writeDb } from "../database/db.js";

const PRODUCT_SELECT = `
  p.id, p.product_name, p.unit, p.delivery_charges, p.discount, p.tax,
  p.status, p.source, p.created_at, p.updated_at, p.category_id, p.tenant_id,
  c.category_name,
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
  FROM inventory_products p
  LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
  LEFT JOIN inventory_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
  LEFT JOIN inventory_stock_levels sl ON sl.variant_id = v.id AND sl.deleted_at IS NULL
`;

const VARIANT_SELECT = `
  v.id, v.product_id, v.sku, v.variant_name, v.cost_price, v.selling_price,
  v.status, v.created_at, v.updated_at, v.tenant_id,
  p.product_name, p.unit, p.delivery_charges, p.discount, p.tax,
  p.category_id, c.category_name
`;

function tenantWhere(alias, tenantId) {
  return `${alias}.tenant_id = ? AND ${alias}.deleted_at IS NULL`;
}

export const inventoryRepository = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  async dashboardStats(tenantId) {
    const [[stats]] = await readDb.query(
      `SELECT
         (SELECT COUNT(*) FROM inventory_products WHERE tenant_id = ? AND deleted_at IS NULL) AS product_count,
         (SELECT COUNT(*) FROM inventory_product_variants WHERE tenant_id = ? AND deleted_at IS NULL) AS variant_count,
         (SELECT COUNT(*) FROM inventory_products WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'active') AS active_products,
         (SELECT COUNT(*) FROM inventory_products WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'inactive') AS inactive_products,
         (SELECT COUNT(*) FROM inventory_categories WHERE tenant_id = ? AND deleted_at IS NULL) AS category_count,
         (SELECT COUNT(*) FROM inventory_categories WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'active') AS active_categories,
         (SELECT COUNT(*) FROM inventory_warehouses WHERE tenant_id = ? AND deleted_at IS NULL) AS warehouse_count,
         (SELECT COUNT(*) FROM inventory_warehouses WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'active') AS active_warehouses,
         (SELECT COALESCE(SUM(total_qty), 0) FROM inventory_stock_levels WHERE tenant_id = ? AND deleted_at IS NULL) AS total_stock_units,
         (SELECT COALESCE(SUM(available_qty), 0) FROM inventory_stock_levels WHERE tenant_id = ? AND deleted_at IS NULL) AS available_units,
         (SELECT COALESCE(SUM(reserved_qty), 0) FROM inventory_stock_levels WHERE tenant_id = ? AND deleted_at IS NULL) AS reserved_units,
         (SELECT COALESCE(SUM(damaged_qty), 0) FROM inventory_stock_levels WHERE tenant_id = ? AND deleted_at IS NULL) AS damaged_units,
         (SELECT COALESCE(SUM(sl.available_qty * v.cost_price), 0)
            FROM inventory_stock_levels sl
            JOIN inventory_product_variants v ON v.id = sl.variant_id AND v.deleted_at IS NULL
           WHERE sl.tenant_id = ? AND sl.deleted_at IS NULL) AS inventory_value_cost,
         (SELECT COALESCE(SUM(sl.available_qty * GREATEST(v.selling_price - p.discount + p.tax, 0)), 0)
            FROM inventory_stock_levels sl
            JOIN inventory_product_variants v ON v.id = sl.variant_id AND v.deleted_at IS NULL
            JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
           WHERE sl.tenant_id = ? AND sl.deleted_at IS NULL) AS inventory_value_retail,
         (SELECT COUNT(*) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL) AS total_movements,
         (SELECT COUNT(*) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL AND movement_type = 'stock_in') AS total_stock_in,
         (SELECT COUNT(*) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL AND movement_type = 'stock_out') AS total_stock_out,
         (SELECT COUNT(*) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL AND movement_type = 'initial_stock') AS total_initial_stock,
         (SELECT COUNT(*) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL AND movement_type IN ('transfer_in','transfer_out')) AS total_transfer_movements,
         (SELECT COUNT(*) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL AND movement_type = 'stock_in'
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS stock_in_30d,
         (SELECT COUNT(*) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL AND movement_type = 'stock_out'
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS stock_out_30d,
         (SELECT COALESCE(SUM(qty), 0) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL AND movement_type = 'stock_in'
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS stock_in_qty_30d,
         (SELECT COALESCE(SUM(qty), 0) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL AND movement_type = 'stock_out'
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS stock_out_qty_30d,
         (SELECT COUNT(*) FROM inventory_stock_movements WHERE tenant_id = ? AND deleted_at IS NULL
            AND DATE(created_at) = CURDATE()) AS movements_today,
         (SELECT COUNT(*) FROM inventory_stock_transfers WHERE tenant_id = ? AND deleted_at IS NULL) AS total_transfers,
         (SELECT COUNT(*) FROM inventory_stock_transfers WHERE tenant_id = ? AND deleted_at IS NULL
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS transfers_30d,
         (SELECT COUNT(*) FROM inventory_stock_transfers WHERE tenant_id = ? AND deleted_at IS NULL AND transfer_status = 'pending') AS pending_transfers,
         (SELECT COUNT(*) FROM inventory_stock_transfers WHERE tenant_id = ? AND deleted_at IS NULL AND transfer_status = 'completed') AS completed_transfers,
         (SELECT COUNT(*) FROM inventory_stock_transfers WHERE tenant_id = ? AND deleted_at IS NULL AND transfer_status = 'cancelled') AS cancelled_transfers,
         (SELECT COUNT(DISTINCT v.id) FROM inventory_product_variants v
            JOIN inventory_stock_levels sl ON sl.variant_id = v.id AND sl.deleted_at IS NULL
           WHERE v.tenant_id = ? AND v.deleted_at IS NULL AND sl.available_qty <= 5 AND sl.available_qty > 0) AS low_stock_count,
         (SELECT COUNT(DISTINCT v.id) FROM inventory_product_variants v
            LEFT JOIN inventory_stock_levels sl ON sl.variant_id = v.id AND sl.deleted_at IS NULL
           WHERE v.tenant_id = ? AND v.deleted_at IS NULL
             AND (sl.id IS NULL OR sl.available_qty = 0)) AS out_of_stock_count`,
      Array(31).fill(tenantId)
    );
    return stats;
  },

  async dashboardMovementTrend(tenantId, months = 6) {
    const [rows] = await readDb.query(
      `SELECT DATE_FORMAT(m.created_at, '%Y-%m') AS month_key,
              MONTHNAME(m.created_at) AS month_label,
              m.movement_type,
              COUNT(*) AS movement_count,
              COALESCE(SUM(m.qty), 0) AS total_qty
       FROM inventory_stock_movements m
       WHERE m.tenant_id = ? AND m.deleted_at IS NULL
         AND m.created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
       GROUP BY month_key, month_label, m.movement_type
       ORDER BY month_key ASC`,
      [tenantId, months - 1]
    );
    return rows;
  },

  async dashboardMovementsByType(tenantId) {
    const [rows] = await readDb.query(
      `SELECT movement_type, COUNT(*) AS count, COALESCE(SUM(qty), 0) AS total_qty
       FROM inventory_stock_movements
       WHERE tenant_id = ? AND deleted_at IS NULL
       GROUP BY movement_type
       ORDER BY count DESC`,
      [tenantId]
    );
    return rows;
  },

  async dashboardStockByCategory(tenantId) {
    const [rows] = await readDb.query(
      `SELECT c.category_name AS label,
              COUNT(DISTINCT p.id) AS product_count,
              COALESCE(SUM(sl.total_qty), 0) AS total_qty,
              COALESCE(SUM(sl.available_qty * v.cost_price), 0) AS value_cost
       FROM inventory_categories c
       LEFT JOIN inventory_products p ON p.category_id = c.id AND p.deleted_at IS NULL
       LEFT JOIN inventory_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       LEFT JOIN inventory_stock_levels sl ON sl.variant_id = v.id AND sl.deleted_at IS NULL
       WHERE c.tenant_id = ? AND c.deleted_at IS NULL
       GROUP BY c.id, c.category_name
       ORDER BY total_qty DESC
       LIMIT 8`,
      [tenantId]
    );
    return rows;
  },

  async dashboardStockByWarehouse(tenantId) {
    const [rows] = await readDb.query(
      `SELECT w.warehouse_name AS label,
              COUNT(DISTINCT sl.variant_id) AS product_count,
              COALESCE(SUM(sl.total_qty), 0) AS total_qty,
              COALESCE(SUM(sl.available_qty), 0) AS available_qty,
              COALESCE(SUM(sl.available_qty * v.cost_price), 0) AS value_cost
       FROM inventory_warehouses w
       LEFT JOIN inventory_stock_levels sl ON sl.warehouse_id = w.id AND sl.deleted_at IS NULL
       LEFT JOIN inventory_product_variants v ON v.id = sl.variant_id AND v.deleted_at IS NULL
       WHERE w.tenant_id = ? AND w.deleted_at IS NULL
       GROUP BY w.id, w.warehouse_name
       ORDER BY total_qty DESC`,
      [tenantId]
    );
    return rows;
  },

  async dashboardTopProducts(tenantId, limit = 6) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name, c.category_name,
              COUNT(DISTINCT v.id) AS variant_count,
              COALESCE(SUM(sl.total_qty), 0) AS total_qty,
              COALESCE(SUM(sl.available_qty), 0) AS available_qty
       FROM inventory_products p
       LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN inventory_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       LEFT JOIN inventory_stock_levels sl ON sl.variant_id = v.id AND sl.deleted_at IS NULL
       WHERE p.tenant_id = ? AND p.deleted_at IS NULL
       GROUP BY p.id, p.product_name, c.category_name
       ORDER BY total_qty DESC
       LIMIT ?`,
      [tenantId, limit]
    );
    return rows;
  },

  async dashboardLowStockProducts(tenantId, limit = 8) {
    const [rows] = await readDb.query(
      `SELECT p.product_name, v.sku, v.variant_name, c.category_name,
              COALESCE(SUM(sl.available_qty), 0) AS available_qty,
              COALESCE(SUM(sl.total_qty), 0) AS total_qty
       FROM inventory_product_variants v
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       JOIN inventory_stock_levels sl ON sl.variant_id = v.id AND sl.deleted_at IS NULL
       WHERE v.tenant_id = ? AND v.deleted_at IS NULL
       GROUP BY v.id, p.product_name, v.sku, v.variant_name, c.category_name
       HAVING available_qty <= 5
       ORDER BY available_qty ASC
       LIMIT ?`,
      [tenantId, limit]
    );
    return rows;
  },

  async dashboardRecentTransfers(tenantId, limit = 6) {
    const [rows] = await readDb.query(
      `SELECT t.id, t.qty, t.transfer_status, t.created_at,
              p.product_name, v.sku, v.variant_name,
              fw.warehouse_name AS from_warehouse_name,
              tw.warehouse_name AS to_warehouse_name
       FROM inventory_stock_transfers t
       JOIN inventory_product_variants v ON v.id = t.variant_id AND v.deleted_at IS NULL
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       JOIN inventory_warehouses fw ON fw.id = t.from_warehouse_id AND fw.deleted_at IS NULL
       JOIN inventory_warehouses tw ON tw.id = t.to_warehouse_id AND tw.deleted_at IS NULL
       WHERE t.tenant_id = ? AND t.deleted_at IS NULL
       ORDER BY t.created_at DESC
       LIMIT ?`,
      [tenantId, limit]
    );
    return rows;
  },

  async recentMovements(tenantId, limit = 8) {
    const [rows] = await readDb.query(
      `SELECT m.id, m.movement_type, m.qty, m.notes, m.created_at,
              p.product_name, v.sku, v.variant_name, w.warehouse_name, u.name AS created_by_name
       FROM inventory_stock_movements m
       JOIN inventory_product_variants v ON v.id = m.variant_id AND v.deleted_at IS NULL
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       JOIN inventory_warehouses w ON w.id = m.warehouse_id AND w.deleted_at IS NULL
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.tenant_id = ? AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [tenantId, limit]
    );
    return rows;
  },

  // ── Categories ─────────────────────────────────────────────────────────────
  async listCategories(tenantId, { limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT c.id, c.category_name, c.status, c.created_at, c.tenant_id,
              COUNT(p.id) AS product_count
       FROM inventory_categories c
       LEFT JOIN inventory_products p ON p.category_id = c.id AND p.deleted_at IS NULL
       WHERE ${tenantWhere("c", tenantId)}
       GROUP BY c.id
       ORDER BY c.category_name ASC
       LIMIT ? OFFSET ?`,
      [tenantId, limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM inventory_categories c WHERE ${tenantWhere("c", tenantId)}`,
      [tenantId]
    );
    return { rows, total };
  },

  async getCategoryById(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT c.id, c.category_name, c.status, c.created_at, c.tenant_id
       FROM inventory_categories c
       WHERE c.id = ? AND ${tenantWhere("c", tenantId)}
       LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async findCategoryByName(tenantId, categoryName, excludeId = null) {
    const name = String(categoryName || "").trim();
    if (!name) return null;
    const params = [tenantId, name];
    let sql = `SELECT c.id, c.category_name, c.status, c.created_at, c.tenant_id
       FROM inventory_categories c
       WHERE c.tenant_id = ? AND c.deleted_at IS NULL
         AND LOWER(TRIM(c.category_name)) = LOWER(?)`;
    if (excludeId != null) {
      sql += ` AND c.id != ?`;
      params.push(excludeId);
    }
    sql += ` LIMIT 1`;
    const [rows] = await readDb.query(sql, params);
    return rows[0] || null;
  },

  async getCategoryProducts(tenantId, categoryId) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name, p.status, p.category_id,
              COUNT(v.id) AS variant_count,
              GROUP_CONCAT(v.sku ORDER BY v.sku SEPARATOR ', ') AS skus
       FROM inventory_products p
       LEFT JOIN inventory_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       WHERE p.tenant_id = ? AND p.category_id = ? AND p.deleted_at IS NULL
       GROUP BY p.id
       ORDER BY p.product_name ASC`,
      [tenantId, categoryId]
    );
    return rows;
  },

  async createCategory(tenantId, { category_name, status }) {
    const [result] = await writeDb.query(
      `INSERT INTO inventory_categories (category_name, status, tenant_id) VALUES (?, ?, ?)`,
      [category_name, status, tenantId]
    );
    return result.insertId;
  },

  async updateCategory(tenantId, id, { category_name, status }) {
    await writeDb.query(
      `UPDATE inventory_categories SET category_name = ?, status = ?
       WHERE id = ? AND ${tenantWhere("inventory_categories", tenantId)}`,
      [category_name, status, id, tenantId]
    );
  },

  async softDeleteCategory(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE inventory_categories SET deleted_at = NOW()
       WHERE id = ? AND ${tenantWhere("inventory_categories", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async assignProductsToCategory(tenantId, categoryId, productIds) {
    if (!productIds?.length) return;
    const placeholders = productIds.map(() => "?").join(",");
    await writeDb.query(
      `UPDATE inventory_products SET category_id = ?
       WHERE tenant_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
      [categoryId, tenantId, ...productIds]
    );
  },

  // ── Products (parent) ──────────────────────────────────────────────────────
  async listProducts(tenantId, { limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT ${PRODUCT_SELECT}
       ${PRODUCT_FROM}
       WHERE ${tenantWhere("p", tenantId)}
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [tenantId, limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM inventory_products p WHERE ${tenantWhere("p", tenantId)}`,
      [tenantId]
    );
    return { rows, total };
  },

  async getProductById(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT ${PRODUCT_SELECT}
       ${PRODUCT_FROM}
       WHERE p.id = ? AND ${tenantWhere("p", tenantId)}
       GROUP BY p.id
       LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createProduct(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO inventory_products
         (product_name, unit, delivery_charges, discount, tax, status, source, category_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.product_name,
        data.unit,
        data.delivery_charges ?? 0,
        data.discount ?? 0,
        data.tax ?? 0,
        data.status,
        data.source || "manual",
        data.category_id,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateProduct(tenantId, id, data) {
    const sets = [
      "product_name = ?",
      "unit = ?",
      "delivery_charges = ?",
      "discount = ?",
      "tax = ?",
      "status = ?",
      "category_id = ?",
    ];
    const params = [
      data.product_name,
      data.unit,
      data.delivery_charges ?? 0,
      data.discount ?? 0,
      data.tax ?? 0,
      data.status,
      data.category_id,
    ];
    if (data.source != null) {
      sets.push("source = ?");
      params.push(data.source);
    }
    params.push(id, tenantId);
    await writeDb.query(
      `UPDATE inventory_products SET ${sets.join(", ")}
       WHERE id = ? AND ${tenantWhere("inventory_products", tenantId)}`,
      params
    );
  },

  async softDeleteProduct(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE inventory_products SET deleted_at = NOW()
       WHERE id = ? AND ${tenantWhere("inventory_products", tenantId)}`,
      [id, tenantId]
    );
    if (result.affectedRows > 0) {
      await writeDb.query(
        `UPDATE inventory_product_variants SET deleted_at = NOW()
         WHERE product_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [id, tenantId]
      );
    }
    return result.affectedRows > 0;
  },

  async listAllProductsBrief(tenantId) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name, p.status, p.category_id, c.category_name,
              COUNT(v.id) AS variant_count
       FROM inventory_products p
       LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN inventory_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       WHERE ${tenantWhere("p", tenantId)}
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
              COALESCE(SUM(sl.available_qty), 0) AS total_available,
              COALESCE(SUM(sl.total_qty), 0) AS total_qty
       FROM inventory_product_variants v
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN inventory_stock_levels sl ON sl.variant_id = v.id AND sl.deleted_at IS NULL
       WHERE v.product_id = ? AND ${tenantWhere("v", tenantId)}
       GROUP BY v.id
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
       FROM inventory_product_variants v
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       WHERE v.id = ? AND ${tenantWhere("v", tenantId)}
       LIMIT 1`,
      [id, tenantId]
    );
    if (!rows[0]) return null;
    rows[0].attributes = await this.getVariantAttributes(id);
    return rows[0];
  },

  async getDefaultVariantForProduct(tenantId, productId) {
    const [rows] = await readDb.query(
      `SELECT id FROM inventory_product_variants
       WHERE product_id = ? AND ${tenantWhere("inventory_product_variants", tenantId)}
       ORDER BY id ASC LIMIT 1`,
      [productId, tenantId]
    );
    return rows[0] || null;
  },

  async findVariantBySku(tenantId, sku, excludeId = null) {
    const params = [tenantId, sku];
    let sql = `SELECT v.id, v.product_id, v.sku, v.variant_name, v.cost_price, v.selling_price, v.status
       FROM inventory_product_variants v
       WHERE v.tenant_id = ? AND v.sku = ? AND v.deleted_at IS NULL`;
    if (excludeId) {
      sql += ` AND v.id != ?`;
      params.push(excludeId);
    }
    sql += ` LIMIT 1`;
    const [rows] = await readDb.query(sql, params);
    return rows[0] || null;
  },

  /** @deprecated use findVariantBySku */
  async findProductBySku(tenantId, sku, excludeId = null) {
    return this.findVariantBySku(tenantId, sku, excludeId);
  },

  async createVariant(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO inventory_product_variants
         (product_id, sku, variant_name, cost_price, selling_price, status, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.product_id,
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
      `UPDATE inventory_product_variants
       SET sku = ?, variant_name = ?, cost_price = ?, selling_price = ?, status = ?
       WHERE id = ? AND ${tenantWhere("inventory_product_variants", tenantId)}`,
      [data.sku, data.variant_name, data.cost_price, data.selling_price, data.status, id, tenantId]
    );
  },

  async softDeleteVariant(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE inventory_product_variants SET deleted_at = NOW()
       WHERE id = ? AND ${tenantWhere("inventory_product_variants", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async getVariantAttributes(variantId) {
    const [rows] = await readDb.query(
      `SELECT a.attribute_name, av.value
       FROM inventory_variant_attribute_values av
       JOIN inventory_variant_attributes a ON a.id = av.attribute_id
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
      `SELECT id FROM inventory_variant_attributes
       WHERE tenant_id = ? AND LOWER(attribute_name) = LOWER(?)
       LIMIT 1`,
      [tenantId, name]
    );
    if (existing[0]) return existing[0].id;
    const [result] = await writeDb.query(
      `INSERT INTO inventory_variant_attributes (attribute_name, tenant_id) VALUES (?, ?)`,
      [name, tenantId]
    );
    return result.insertId;
  },

  async setVariantAttributes(tenantId, variantId, attributes) {
    await writeDb.query(
      `DELETE av FROM inventory_variant_attribute_values av
       WHERE av.variant_id = ?`,
      [variantId]
    );
    if (!Array.isArray(attributes) || !attributes.length) return;
    for (const attr of attributes) {
      const attrName = String(attr.attribute_name || attr.name || "").trim();
      const value = String(attr.value || "").trim();
      if (!attrName || !value) continue;
      const attributeId = await this.ensureAttribute(tenantId, attrName);
      await writeDb.query(
        `INSERT INTO inventory_variant_attribute_values (variant_id, attribute_id, value) VALUES (?, ?, ?)`,
        [variantId, attributeId, value]
      );
    }
  },

  async listAllVariantsBrief(tenantId) {
    const [rows] = await readDb.query(
      `SELECT v.id, v.product_id, v.sku, v.variant_name, v.selling_price, v.cost_price, v.status,
              p.product_name, p.unit, p.delivery_charges, p.discount, p.tax,
              p.category_id, c.category_name,
              COALESCE(SUM(sl.available_qty), 0) AS total_available
       FROM inventory_product_variants v
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN inventory_stock_levels sl ON sl.variant_id = v.id AND sl.deleted_at IS NULL
       WHERE ${tenantWhere("v", tenantId)} AND LOWER(TRIM(v.status)) = 'active'
       GROUP BY v.id
       ORDER BY p.product_name ASC, v.variant_name ASC`,
      [tenantId]
    );
    return rows;
  },

  async getVariantStockLevels(tenantId, variantId) {
    const [rows] = await readDb.query(
      `SELECT sl.id, sl.available_qty, sl.reserved_qty, sl.damaged_qty, sl.total_qty,
              sl.updated_at, sl.variant_id, sl.warehouse_id, sl.tenant_id,
              w.warehouse_name, w.location, w.city, w.status AS warehouse_status
       FROM inventory_stock_levels sl
       JOIN inventory_warehouses w ON w.id = sl.warehouse_id AND w.deleted_at IS NULL
       WHERE sl.variant_id = ? AND ${tenantWhere("sl", tenantId)}
       ORDER BY w.warehouse_name ASC`,
      [variantId, tenantId]
    );
    return rows;
  },

  // ── Warehouses ─────────────────────────────────────────────────────────────
  async countWarehouses(tenantId) {
    const [[row]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM inventory_warehouses
       WHERE tenant_id = ? AND deleted_at IS NULL`,
      [tenantId]
    );
    return Number(row.total || 0);
  },

  async getTenantWarehouseLimit(tenantId) {
    const [rows] = await readDb.query(
      `SELECT max_warehouses FROM wh_tenant_limits
       WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [tenantId]
    );
    return Number(rows[0]?.max_warehouses || 0);
  },

  async listWarehouses(tenantId, { limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT w.id, w.warehouse_name, w.location, w.city, w.status, w.created_at, w.tenant_id,
              COUNT(DISTINCT sl.variant_id) AS product_count,
              COALESCE(SUM(sl.total_qty), 0) AS total_units
       FROM inventory_warehouses w
       LEFT JOIN inventory_stock_levels sl ON sl.warehouse_id = w.id AND sl.deleted_at IS NULL
       WHERE ${tenantWhere("w", tenantId)}
       GROUP BY w.id
       ORDER BY w.warehouse_name ASC
       LIMIT ? OFFSET ?`,
      [tenantId, limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM inventory_warehouses w WHERE ${tenantWhere("w", tenantId)}`,
      [tenantId]
    );
    return { rows, total };
  },

  async getWarehouseById(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT id, warehouse_name, location, city, status, created_at, tenant_id
       FROM inventory_warehouses
       WHERE id = ? AND ${tenantWhere("inventory_warehouses", tenantId)}
       LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async getWarehouseStats(tenantId, warehouseId) {
    const [[row]] = await readDb.query(
      `SELECT COUNT(DISTINCT v.product_id) AS product_count,
              COUNT(DISTINCT sl.variant_id) AS variant_count,
              COALESCE(SUM(sl.total_qty), 0) AS total_units,
              COALESCE(SUM(sl.available_qty), 0) AS available_units,
              COALESCE(SUM(sl.reserved_qty), 0) AS reserved_units,
              COALESCE(SUM(sl.damaged_qty), 0) AS damaged_units,
              COALESCE(SUM(sl.available_qty * v.cost_price), 0) AS stock_value_cost,
              COALESCE(SUM(sl.available_qty * v.selling_price), 0) AS stock_value_retail
       FROM inventory_stock_levels sl
       JOIN inventory_product_variants v ON v.id = sl.variant_id AND v.deleted_at IS NULL
       WHERE sl.warehouse_id = ? AND ${tenantWhere("sl", tenantId)}`,
      [warehouseId, tenantId]
    );
    return row || {};
  },

  async getWarehouseStockLines(tenantId, warehouseId, limit = 12) {
    const [rows] = await readDb.query(
      `SELECT p.id AS product_id, p.product_name, p.status AS product_status,
              v.id AS variant_id, v.sku, v.variant_name, v.status AS variant_status,
              sl.available_qty, sl.total_qty, sl.reserved_qty, sl.damaged_qty,
              v.selling_price, v.cost_price
       FROM inventory_stock_levels sl
       JOIN inventory_product_variants v ON v.id = sl.variant_id AND v.deleted_at IS NULL
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       WHERE sl.warehouse_id = ? AND ${tenantWhere("sl", tenantId)}
       ORDER BY sl.total_qty DESC, p.product_name ASC, v.variant_name ASC
       LIMIT ?`,
      [warehouseId, tenantId, limit]
    );
    return rows;
  },

  async getWarehouseMovements(tenantId, warehouseId, limit = 8) {
    const [rows] = await readDb.query(
      `SELECT m.id, m.movement_type, m.qty, m.notes, m.created_at,
              p.product_name, v.sku, v.variant_name, u.name AS created_by_name
       FROM inventory_stock_movements m
       JOIN inventory_product_variants v ON v.id = m.variant_id AND v.deleted_at IS NULL
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.warehouse_id = ? AND ${tenantWhere("m", tenantId)}
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [warehouseId, tenantId, limit]
    );
    return rows;
  },

  async getCategoryStats(tenantId, categoryId) {
    const [[row]] = await readDb.query(
      `SELECT COUNT(DISTINCT p.id) AS product_count,
              SUM(CASE WHEN LOWER(TRIM(p.status)) = 'active' THEN 1 ELSE 0 END) AS active_products,
              SUM(CASE WHEN LOWER(TRIM(p.status)) != 'active' THEN 1 ELSE 0 END) AS inactive_products,
              COUNT(DISTINCT v.id) AS variant_count,
              COALESCE(SUM(sl.total_qty), 0) AS total_units,
              COALESCE(SUM(sl.available_qty), 0) AS available_units,
              COALESCE(SUM(sl.reserved_qty), 0) AS reserved_units,
              COALESCE(SUM(sl.damaged_qty), 0) AS damaged_units,
              COALESCE(SUM(sl.available_qty * v.cost_price), 0) AS stock_value_cost,
              COALESCE(SUM(sl.available_qty * v.selling_price), 0) AS stock_value_retail
       FROM inventory_products p
       LEFT JOIN inventory_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       LEFT JOIN inventory_stock_levels sl ON sl.variant_id = v.id AND sl.deleted_at IS NULL
       WHERE p.category_id = ? AND ${tenantWhere("p", tenantId)}`,
      [categoryId, tenantId]
    );
    return row || {};
  },

  async createWarehouse(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO inventory_warehouses (warehouse_name, location, city, status, tenant_id)
       VALUES (?, ?, ?, ?, ?)`,
      [data.warehouse_name, data.location || null, data.city || null, data.status, tenantId]
    );
    return result.insertId;
  },

  async updateWarehouse(tenantId, id, data) {
    await writeDb.query(
      `UPDATE inventory_warehouses
       SET warehouse_name = ?, location = ?, city = ?, status = ?
       WHERE id = ? AND ${tenantWhere("inventory_warehouses", tenantId)}`,
      [data.warehouse_name, data.location || null, data.city || null, data.status, id, tenantId]
    );
  },

  async softDeleteWarehouse(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE inventory_warehouses SET deleted_at = NOW()
       WHERE id = ? AND ${tenantWhere("inventory_warehouses", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async listAllWarehousesBrief(tenantId) {
    const [rows] = await readDb.query(
      `SELECT id, warehouse_name, city, status
       FROM inventory_warehouses
       WHERE ${tenantWhere("inventory_warehouses", tenantId)}
       ORDER BY warehouse_name ASC`,
      [tenantId]
    );
    return rows;
  },

  // ── Stock levels (variant-scoped) ──────────────────────────────────────────
  async getStockLevel(tenantId, variantId, warehouseId) {
    const [rows] = await readDb.query(
      `SELECT id, available_qty, reserved_qty, damaged_qty, total_qty
       FROM inventory_stock_levels
       WHERE variant_id = ? AND warehouse_id = ? AND ${tenantWhere("inventory_stock_levels", tenantId)}
       LIMIT 1`,
      [variantId, warehouseId, tenantId]
    );
    return rows[0] || null;
  },

  async upsertStockLevel(tenantId, variantId, warehouseId, deltaAvailable, deltaDamaged = 0) {
    const existing = await this.getStockLevel(tenantId, variantId, warehouseId);
    if (existing) {
      const available = Math.max(0, existing.available_qty + deltaAvailable);
      const damaged = Math.max(0, existing.damaged_qty + deltaDamaged);
      const total = available + existing.reserved_qty + damaged;
      await writeDb.query(
        `UPDATE inventory_stock_levels
         SET available_qty = ?, damaged_qty = ?, total_qty = ?
         WHERE id = ?`,
        [available, damaged, total, existing.id]
      );
      return existing.id;
    }
    const available = Math.max(0, deltaAvailable);
    const damaged = Math.max(0, deltaDamaged);
    const total = available + damaged;
    const [result] = await writeDb.query(
      `INSERT INTO inventory_stock_levels
         (available_qty, reserved_qty, damaged_qty, total_qty, variant_id, warehouse_id, tenant_id)
       VALUES (?, 0, ?, ?, ?, ?, ?)`,
      [available, damaged, total, variantId, warehouseId, tenantId]
    );
    return result.insertId;
  },

  async setStockLevelAbsolute(tenantId, variantId, warehouseId, { available_qty, reserved_qty, damaged_qty }) {
    const available = Math.max(0, Number(available_qty) || 0);
    const reserved = Math.max(0, Number(reserved_qty) || 0);
    const damaged = Math.max(0, Number(damaged_qty) || 0);
    const total = available + reserved + damaged;
    const existing = await this.getStockLevel(tenantId, variantId, warehouseId);
    if (existing) {
      await writeDb.query(
        `UPDATE inventory_stock_levels
         SET available_qty = ?, reserved_qty = ?, damaged_qty = ?, total_qty = ?
         WHERE id = ?`,
        [available, reserved, damaged, total, existing.id]
      );
      return existing.id;
    }
    const [result] = await writeDb.query(
      `INSERT INTO inventory_stock_levels
         (available_qty, reserved_qty, damaged_qty, total_qty, variant_id, warehouse_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [available, reserved, damaged, total, variantId, warehouseId, tenantId]
    );
    return result.insertId;
  },

  // ── Stock movements ────────────────────────────────────────────────────────
  async createMovement(tenantId, userId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO inventory_stock_movements
         (movement_type, qty, notes, variant_id, warehouse_id, created_by, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.movement_type,
        data.qty,
        data.notes || null,
        data.variant_id,
        data.warehouse_id,
        userId,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async listMovements(tenantId, { limit, offset, movement_type }) {
    const params = [tenantId];
    let typeFilter = "";
    if (movement_type) {
      typeFilter = ` AND m.movement_type = ?`;
      params.push(movement_type);
    }
    params.push(limit, offset);
    const [rows] = await readDb.query(
      `SELECT m.id, m.movement_type, m.qty, m.notes, m.created_at,
              m.variant_id, m.warehouse_id, m.created_by, m.tenant_id,
              p.product_name, v.sku, v.variant_name, w.warehouse_name, u.name AS created_by_name
       FROM inventory_stock_movements m
       JOIN inventory_product_variants v ON v.id = m.variant_id AND v.deleted_at IS NULL
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       JOIN inventory_warehouses w ON w.id = m.warehouse_id AND w.deleted_at IS NULL
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.tenant_id = ? AND m.deleted_at IS NULL${typeFilter}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );
    const countParams = movement_type ? [tenantId, movement_type] : [tenantId];
    const countFilter = movement_type ? ` AND movement_type = ?` : "";
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM inventory_stock_movements
       WHERE tenant_id = ? AND deleted_at IS NULL${countFilter}`,
      countParams
    );
    return { rows, total };
  },

  // ── Stock transfers ────────────────────────────────────────────────────────
  async createTransfer(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO inventory_stock_transfers
         (qty, transfer_status, variant_id, from_warehouse_id, to_warehouse_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.qty,
        data.transfer_status,
        data.variant_id,
        data.from_warehouse_id,
        data.to_warehouse_id,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async listTransfers(tenantId, { limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT t.id, t.qty, t.transfer_status, t.created_at, t.updated_at,
              t.variant_id, t.from_warehouse_id, t.to_warehouse_id, t.tenant_id,
              p.product_name, v.sku, v.variant_name,
              fw.warehouse_name AS from_warehouse_name,
              tw.warehouse_name AS to_warehouse_name
       FROM inventory_stock_transfers t
       JOIN inventory_product_variants v ON v.id = t.variant_id AND v.deleted_at IS NULL
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       JOIN inventory_warehouses fw ON fw.id = t.from_warehouse_id AND fw.deleted_at IS NULL
       JOIN inventory_warehouses tw ON tw.id = t.to_warehouse_id AND tw.deleted_at IS NULL
       WHERE t.tenant_id = ? AND t.deleted_at IS NULL
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [tenantId, limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM inventory_stock_transfers WHERE tenant_id = ? AND deleted_at IS NULL`,
      [tenantId]
    );
    return { rows, total };
  },

  async getTransferById(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT t.*, p.product_name, v.sku, v.variant_name,
              fw.warehouse_name AS from_warehouse_name,
              tw.warehouse_name AS to_warehouse_name
       FROM inventory_stock_transfers t
       JOIN inventory_product_variants v ON v.id = t.variant_id AND v.deleted_at IS NULL
       JOIN inventory_products p ON p.id = v.product_id AND p.deleted_at IS NULL
       JOIN inventory_warehouses fw ON fw.id = t.from_warehouse_id AND fw.deleted_at IS NULL
       JOIN inventory_warehouses tw ON tw.id = t.to_warehouse_id AND tw.deleted_at IS NULL
       WHERE t.id = ? AND t.tenant_id = ? AND t.deleted_at IS NULL
       LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async updateTransferStatus(tenantId, id, status) {
    await writeDb.query(
      `UPDATE inventory_stock_transfers SET transfer_status = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [status, id, tenantId]
    );
  },
};
