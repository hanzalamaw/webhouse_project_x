import { readDb, writeDb } from "../database/db.js";

const PRODUCT_SELECT = `
  p.id, p.product_name, p.sku, p.unit, p.cost_price, p.selling_price,
  p.delivery_charges, p.discount, p.tax,
  p.status, p.created_at, p.updated_at, p.category_id, p.tenant_id,
  c.category_name,
  COALESCE(SUM(sl.available_qty), 0) AS total_available,
  COALESCE(SUM(sl.reserved_qty), 0) AS total_reserved,
  COALESCE(SUM(sl.damaged_qty), 0) AS total_damaged,
  COALESCE(SUM(sl.total_qty), 0) AS total_qty
`;

const PRODUCT_FROM = `
  FROM inventory_products p
  LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
  LEFT JOIN inventory_stock_levels sl ON sl.product_id = p.id AND sl.deleted_at IS NULL
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
         (SELECT COALESCE(SUM(sl.available_qty * p.cost_price), 0)
            FROM inventory_stock_levels sl
            JOIN inventory_products p ON p.id = sl.product_id AND p.deleted_at IS NULL
           WHERE sl.tenant_id = ? AND sl.deleted_at IS NULL) AS inventory_value_cost,
         (SELECT COALESCE(SUM(sl.available_qty * GREATEST(p.selling_price - p.discount + p.tax, 0)), 0)
            FROM inventory_stock_levels sl
            JOIN inventory_products p ON p.id = sl.product_id AND p.deleted_at IS NULL
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
         (SELECT COUNT(DISTINCT p.id) FROM inventory_products p
            JOIN inventory_stock_levels sl ON sl.product_id = p.id AND sl.deleted_at IS NULL
           WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND sl.available_qty <= 5 AND sl.available_qty > 0) AS low_stock_count,
         (SELECT COUNT(DISTINCT p.id) FROM inventory_products p
            LEFT JOIN inventory_stock_levels sl ON sl.product_id = p.id AND sl.deleted_at IS NULL
           WHERE p.tenant_id = ? AND p.deleted_at IS NULL
             AND (sl.id IS NULL OR sl.available_qty = 0)) AS out_of_stock_count`,
      Array(30).fill(tenantId)
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
              COALESCE(SUM(sl.available_qty * p.cost_price), 0) AS value_cost
       FROM inventory_categories c
       LEFT JOIN inventory_products p ON p.category_id = c.id AND p.deleted_at IS NULL
       LEFT JOIN inventory_stock_levels sl ON sl.product_id = p.id AND sl.deleted_at IS NULL
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
              COUNT(DISTINCT sl.product_id) AS product_count,
              COALESCE(SUM(sl.total_qty), 0) AS total_qty,
              COALESCE(SUM(sl.available_qty), 0) AS available_qty,
              COALESCE(SUM(sl.available_qty * p.cost_price), 0) AS value_cost
       FROM inventory_warehouses w
       LEFT JOIN inventory_stock_levels sl ON sl.warehouse_id = w.id AND sl.deleted_at IS NULL
       LEFT JOIN inventory_products p ON p.id = sl.product_id AND p.deleted_at IS NULL
       WHERE w.tenant_id = ? AND w.deleted_at IS NULL
       GROUP BY w.id, w.warehouse_name
       ORDER BY total_qty DESC`,
      [tenantId]
    );
    return rows;
  },

  async dashboardTopProducts(tenantId, limit = 6) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name, p.sku, c.category_name,
              COALESCE(SUM(sl.total_qty), 0) AS total_qty,
              COALESCE(SUM(sl.available_qty), 0) AS available_qty
       FROM inventory_products p
       LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       LEFT JOIN inventory_stock_levels sl ON sl.product_id = p.id AND sl.deleted_at IS NULL
       WHERE p.tenant_id = ? AND p.deleted_at IS NULL
       GROUP BY p.id, p.product_name, p.sku, c.category_name
       ORDER BY total_qty DESC
       LIMIT ?`,
      [tenantId, limit]
    );
    return rows;
  },

  async dashboardLowStockProducts(tenantId, limit = 8) {
    const [rows] = await readDb.query(
      `SELECT p.product_name, p.sku, c.category_name,
              COALESCE(SUM(sl.available_qty), 0) AS available_qty,
              COALESCE(SUM(sl.total_qty), 0) AS total_qty
       FROM inventory_products p
       LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       JOIN inventory_stock_levels sl ON sl.product_id = p.id AND sl.deleted_at IS NULL
       WHERE p.tenant_id = ? AND p.deleted_at IS NULL
       GROUP BY p.id, p.product_name, p.sku, c.category_name
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
              p.product_name, p.sku,
              fw.warehouse_name AS from_warehouse_name,
              tw.warehouse_name AS to_warehouse_name
       FROM inventory_stock_transfers t
       JOIN inventory_products p ON p.id = t.product_id AND p.deleted_at IS NULL
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
              p.product_name, p.sku, w.warehouse_name, u.name AS created_by_name
       FROM inventory_stock_movements m
       JOIN inventory_products p ON p.id = m.product_id AND p.deleted_at IS NULL
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

  async getCategoryProducts(tenantId, categoryId) {
    const [rows] = await readDb.query(
      `SELECT id, product_name, sku, status, category_id
       FROM inventory_products
       WHERE tenant_id = ? AND category_id = ? AND deleted_at IS NULL
       ORDER BY product_name ASC`,
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

  // ── Products ───────────────────────────────────────────────────────────────
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

  async getProductStockLevels(tenantId, productId) {
    const [rows] = await readDb.query(
      `SELECT sl.id, sl.available_qty, sl.reserved_qty, sl.damaged_qty, sl.total_qty,
              sl.updated_at, sl.product_id, sl.warehouse_id, sl.tenant_id,
              w.warehouse_name, w.location, w.city, w.status AS warehouse_status
       FROM inventory_stock_levels sl
       JOIN inventory_warehouses w ON w.id = sl.warehouse_id AND w.deleted_at IS NULL
       WHERE sl.product_id = ? AND ${tenantWhere("sl", tenantId)}
       ORDER BY w.warehouse_name ASC`,
      [productId, tenantId]
    );
    return rows;
  },

  async findProductBySku(tenantId, sku, excludeId = null) {
    const params = [tenantId, sku];
    let sql = `SELECT id FROM inventory_products WHERE tenant_id = ? AND sku = ? AND deleted_at IS NULL`;
    if (excludeId) {
      sql += ` AND id != ?`;
      params.push(excludeId);
    }
    sql += ` LIMIT 1`;
    const [rows] = await readDb.query(sql, params);
    return rows[0] || null;
  },

  async createProduct(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO inventory_products
         (product_name, sku, unit, cost_price, selling_price, delivery_charges, discount, tax, status, category_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.product_name,
        data.sku,
        data.unit,
        data.cost_price,
        data.selling_price,
        data.delivery_charges ?? 0,
        data.discount ?? 0,
        data.tax ?? 0,
        data.status,
        data.category_id,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateProduct(tenantId, id, data) {
    await writeDb.query(
      `UPDATE inventory_products
       SET product_name = ?, sku = ?, unit = ?, cost_price = ?, selling_price = ?,
           delivery_charges = ?, discount = ?, tax = ?,
           status = ?, category_id = ?
       WHERE id = ? AND ${tenantWhere("inventory_products", tenantId)}`,
      [
        data.product_name,
        data.sku,
        data.unit,
        data.cost_price,
        data.selling_price,
        data.delivery_charges ?? 0,
        data.discount ?? 0,
        data.tax ?? 0,
        data.status,
        data.category_id,
        id,
        tenantId,
      ]
    );
  },

  async softDeleteProduct(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE inventory_products SET deleted_at = NOW()
       WHERE id = ? AND ${tenantWhere("inventory_products", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async listAllProductsBrief(tenantId) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name, p.sku, p.status, p.category_id, c.category_name
       FROM inventory_products p
       LEFT JOIN inventory_categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       WHERE ${tenantWhere("p", tenantId)}
       ORDER BY p.product_name ASC`,
      [tenantId]
    );
    return rows;
  },

  // ── Warehouses ─────────────────────────────────────────────────────────────
  async listWarehouses(tenantId, { limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT w.id, w.warehouse_name, w.location, w.city, w.status, w.created_at, w.tenant_id,
              COUNT(DISTINCT sl.product_id) AS product_count,
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

  // ── Stock levels ───────────────────────────────────────────────────────────
  async getStockLevel(tenantId, productId, warehouseId) {
    const [rows] = await readDb.query(
      `SELECT id, available_qty, reserved_qty, damaged_qty, total_qty
       FROM inventory_stock_levels
       WHERE product_id = ? AND warehouse_id = ? AND ${tenantWhere("inventory_stock_levels", tenantId)}
       LIMIT 1`,
      [productId, warehouseId, tenantId]
    );
    return rows[0] || null;
  },

  async upsertStockLevel(tenantId, productId, warehouseId, deltaAvailable, deltaDamaged = 0) {
    const existing = await this.getStockLevel(tenantId, productId, warehouseId);
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
         (available_qty, reserved_qty, damaged_qty, total_qty, product_id, warehouse_id, tenant_id)
       VALUES (?, 0, ?, ?, ?, ?, ?)`,
      [available, damaged, total, productId, warehouseId, tenantId]
    );
    return result.insertId;
  },

  async setStockLevelAbsolute(tenantId, productId, warehouseId, { available_qty, reserved_qty, damaged_qty }) {
    const available = Math.max(0, Number(available_qty) || 0);
    const reserved = Math.max(0, Number(reserved_qty) || 0);
    const damaged = Math.max(0, Number(damaged_qty) || 0);
    const total = available + reserved + damaged;
    const existing = await this.getStockLevel(tenantId, productId, warehouseId);
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
         (available_qty, reserved_qty, damaged_qty, total_qty, product_id, warehouse_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [available, reserved, damaged, total, productId, warehouseId, tenantId]
    );
    return result.insertId;
  },

  // ── Stock movements ────────────────────────────────────────────────────────
  async createMovement(tenantId, userId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO inventory_stock_movements
         (movement_type, qty, notes, product_id, warehouse_id, created_by, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.movement_type,
        data.qty,
        data.notes || null,
        data.product_id,
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
              m.product_id, m.warehouse_id, m.created_by, m.tenant_id,
              p.product_name, p.sku, w.warehouse_name, u.name AS created_by_name
       FROM inventory_stock_movements m
       JOIN inventory_products p ON p.id = m.product_id AND p.deleted_at IS NULL
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
         (qty, transfer_status, product_id, from_warehouse_id, to_warehouse_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.qty,
        data.transfer_status,
        data.product_id,
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
              t.product_id, t.from_warehouse_id, t.to_warehouse_id, t.tenant_id,
              p.product_name, p.sku,
              fw.warehouse_name AS from_warehouse_name,
              tw.warehouse_name AS to_warehouse_name
       FROM inventory_stock_transfers t
       JOIN inventory_products p ON p.id = t.product_id AND p.deleted_at IS NULL
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
      `SELECT t.*, p.product_name, p.sku,
              fw.warehouse_name AS from_warehouse_name,
              tw.warehouse_name AS to_warehouse_name
       FROM inventory_stock_transfers t
       JOIN inventory_products p ON p.id = t.product_id AND p.deleted_at IS NULL
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
