import { readDb, writeDb, getPool } from "../database/db.js";
import { DELAYED_ORDER_DAYS } from "../utils/orderConstants.js";

function tw(alias, tenantId) {
  return `${alias}.tenant_id = ? AND ${alias}.deleted_at IS NULL`;
}

const ORDER_LIST_SELECT = `
  SELECT o.*,
         c.customer_name,
         u.name AS created_by_name,
         (SELECT op.payment_method FROM order_payments op
            WHERE op.order_id = o.id AND op.deleted_at IS NULL
            ORDER BY op.id DESC LIMIT 1) AS payment_method,
         (SELECT oa.assignment_type FROM order_assignments oa
            WHERE oa.order_id = o.id AND oa.deleted_at IS NULL AND oa.assignment_type = 'warehouse'
            ORDER BY oa.id DESC LIMIT 1) AS warehouse_assignment_type,
         (SELECT usr.name FROM order_assignments oa
            INNER JOIN users usr ON usr.id = oa.assigned_to AND usr.deleted_at IS NULL
            WHERE oa.order_id = o.id AND oa.deleted_at IS NULL AND oa.assignment_type = 'warehouse'
            ORDER BY oa.id DESC LIMIT 1) AS warehouse_assignee,
         EXISTS (SELECT 1 FROM order_cancellations oc
            WHERE oc.order_id = o.id AND oc.deleted_at IS NULL) AS has_cancellation,
         EXISTS (SELECT 1 FROM order_returns ort
            WHERE ort.order_id = o.id AND ort.deleted_at IS NULL) AS has_return,
         EXISTS (SELECT 1 FROM order_exchanges oe
            WHERE oe.order_id = o.id AND oe.deleted_at IS NULL) AS has_exchange
  FROM orders o
  LEFT JOIN crm_customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
  LEFT JOIN users u ON u.id = o.created_by AND u.deleted_at IS NULL
`;

export const orderRepository = {
  async listOrderUsers(tenantId) {
    const [rows] = await readDb.query(
      `SELECT DISTINCT u.id, u.name, u.email
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND r.deleted_at IS NULL
       WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND u.status = 'active'
         AND (
           r.role_name = 'Super Admin'
           OR EXISTS (
             SELECT 1 FROM permissions p
             INNER JOIN modules m ON m.id = p.module_id
               AND m.module_name = 'Order Management' AND m.deleted_at IS NULL
             WHERE p.role_id = r.id AND p.deleted_at IS NULL
               AND p.action IN ('view', 'manage')
           )
         )
       ORDER BY u.name ASC`,
      [tenantId]
    );
    return rows;
  },

  async listCustomers(tenantId) {
    const [rows] = await readDb.query(
      `SELECT c.id, c.customer_name, c.company_name, c.phone, c.email,
              (SELECT a.city FROM crm_customer_addresses a
               WHERE a.customer_id = c.id AND a.deleted_at IS NULL
               ORDER BY a.is_default DESC, a.id ASC LIMIT 1) AS city
       FROM crm_customers c
       WHERE c.tenant_id = ? AND c.deleted_at IS NULL
         AND LOWER(TRIM(c.status)) = 'active'
       ORDER BY c.customer_name ASC`,
      [tenantId]
    );
    return rows;
  },

  async listProducts(tenantId) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.product_name,
              MIN(v.sku) AS sku,
              MIN(v.selling_price) AS selling_price,
              p.status
       FROM inventory_products p
       JOIN inventory_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND p.status = 'active'
       GROUP BY p.id
       ORDER BY p.product_name ASC`,
      [tenantId]
    );
    return rows;
  },

  async listWarehouses(tenantId) {
    const [rows] = await readDb.query(
      `SELECT id, warehouse_name, city, status
       FROM inventory_warehouses
       WHERE tenant_id = ? AND deleted_at IS NULL
         AND LOWER(TRIM(COALESCE(status, 'active'))) = 'active'
       ORDER BY warehouse_name ASC`,
      [tenantId]
    );
    return rows;
  },

  async listWarehouseProducts(tenantId, warehouseId) {
    const [rows] = await readDb.query(
      `SELECT p.id AS product_id, p.product_name,
              p.delivery_charges, p.discount, p.tax,
              v.id AS variant_id, v.sku,
              v.selling_price, v.cost_price,
              COALESCE(sl.available_qty, 0) AS available_qty
       FROM inventory_products p
       JOIN inventory_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
       LEFT JOIN inventory_stock_levels sl
         ON sl.variant_id = v.id AND sl.warehouse_id = ? AND sl.deleted_at IS NULL
       WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND p.status = 'active'
         AND LOWER(TRIM(v.status)) = 'active'
       ORDER BY p.product_name ASC, v.variant_name ASC`,
      [warehouseId, tenantId]
    );
    return rows;
  },

  async listFieldOptions(tenantId, fieldKey) {
    try {
      const [rows] = await readDb.query(
        `SELECT option_value FROM order_field_options
         WHERE tenant_id = ? AND field_key = ? AND deleted_at IS NULL
         ORDER BY option_value ASC`,
        [tenantId, fieldKey]
      );
      return rows.map((r) => r.option_value);
    } catch {
      return [];
    }
  },

  async addFieldOption(tenantId, fieldKey, optionValue) {
    const value = String(optionValue || "").trim();
    if (!value) return false;
    try {
      await writeDb.query(
        `INSERT INTO order_field_options (tenant_id, field_key, option_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE deleted_at = NULL`,
        [tenantId, fieldKey, value]
      );
      return true;
    } catch {
      return false;
    }
  },

  async dashboardStats(tenantId) {
    const [[stats]] = await readDb.query(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND deleted_at IS NULL) AS total_orders,
         (SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND deleted_at IS NULL AND order_status = 'pending') AS pending_orders,
         (SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND deleted_at IS NULL AND order_status = 'confirmed') AS confirmed_orders,
         (SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND deleted_at IS NULL AND order_status = 'cancelled') AS cancelled_orders,
         (SELECT COUNT(*) FROM order_returns WHERE tenant_id = ? AND deleted_at IS NULL) AS return_requests,
         (SELECT COUNT(*) FROM order_exchanges WHERE tenant_id = ? AND deleted_at IS NULL) AS exchange_requests,
         (SELECT COALESCE(SUM(op.amount), 0) FROM order_payments op
            WHERE op.tenant_id = ? AND op.deleted_at IS NULL AND op.payment_method = 'cod') AS cod_amount,
         (SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND deleted_at IS NULL
            AND fulfillment_status != 'fulfilled'
            AND order_status NOT IN ('cancelled', 'returned')
            AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)) AS delayed_orders`,
      [
        tenantId, tenantId, tenantId, tenantId, tenantId, tenantId,
        tenantId, tenantId, DELAYED_ORDER_DAYS,
      ]
    );
    return stats;
  },

  async dashboardOrdersByStatus(tenantId) {
    const [rows] = await readDb.query(
      `SELECT order_status AS label, COUNT(*) AS count
       FROM orders WHERE tenant_id = ? AND deleted_at IS NULL
       GROUP BY order_status ORDER BY count DESC`,
      [tenantId]
    );
    return rows;
  },

  async dashboardFulfillmentByStatus(tenantId) {
    const [rows] = await readDb.query(
      `SELECT fulfillment_status AS label, COUNT(*) AS count
       FROM orders WHERE tenant_id = ? AND deleted_at IS NULL
       GROUP BY fulfillment_status ORDER BY count DESC`,
      [tenantId]
    );
    return rows;
  },

  async dashboardPaymentByStatus(tenantId) {
    const [rows] = await readDb.query(
      `SELECT payment_status AS label, COUNT(*) AS count
       FROM orders WHERE tenant_id = ? AND deleted_at IS NULL
       GROUP BY payment_status ORDER BY count DESC`,
      [tenantId]
    );
    return rows;
  },

  async dashboardOrdersByMonth(tenantId, months = 6) {
    const [rows] = await readDb.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month_key,
              MONTHNAME(created_at) AS month_label,
              COUNT(*) AS count,
              COALESCE(SUM(payable_amount), 0) AS revenue
       FROM orders
       WHERE tenant_id = ? AND deleted_at IS NULL
         AND created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
       GROUP BY month_key, month_label
       ORDER BY month_key ASC`,
      [tenantId, months - 1]
    );
    return rows;
  },

  async dashboardRecentOrders(tenantId, limit = 8) {
    const [rows] = await readDb.query(
      `${ORDER_LIST_SELECT}
       WHERE ${tw("o", tenantId)}
       ORDER BY o.created_at DESC
       LIMIT ?`,
      [tenantId, limit]
    );
    return rows;
  },

  async listOrders(tenantId) {
    const [rows] = await readDb.query(
      `${ORDER_LIST_SELECT}
       WHERE ${tw("o", tenantId)}
       ORDER BY o.created_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async getOrder(tenantId, id) {
    const [rows] = await readDb.query(
      `${ORDER_LIST_SELECT}
       WHERE o.id = ? AND ${tw("o", tenantId)} LIMIT 1`,
      [tenantId, id]
    );
    if (!rows.length) return null;
    const order = rows[0];
    const [items] = await readDb.query(
      `SELECT oi.*,
              ip.delivery_charges AS product_delivery,
              ip.discount AS product_discount_unit,
              ip.tax AS product_tax_unit
       FROM order_items oi
       LEFT JOIN inventory_products ip ON ip.id = oi.product_id AND ip.deleted_at IS NULL
       WHERE oi.order_id = ? AND ${tw("oi", tenantId)}
       ORDER BY oi.id ASC`,
      [id, tenantId]
    );
    order.items = items;
    return order;
  },

  async generateOrderNo(tenantId) {
    const prefix = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    const [rows] = await readDb.query(
      `SELECT COUNT(*) AS cnt FROM orders
       WHERE tenant_id = ? AND order_no LIKE ?`,
      [tenantId, `${prefix}%`]
    );
    const seq = (Number(rows[0]?.cnt) || 0) + 1;
    return `${prefix}-${String(seq).padStart(4, "0")}`;
  },

  async createOrder(tenantId, userId, data, items) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO orders
           (order_no, order_source, order_status, payment_status, fulfillment_status,
            total_amount, discount_amount, delivery_charges, payable_amount,
            city, delivery_address, notes, customer_id, created_by, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.order_no,
          data.order_source,
          data.order_status,
          data.payment_status,
          data.fulfillment_status,
          data.total_amount,
          data.discount_amount,
          data.delivery_charges,
          data.payable_amount,
          data.city,
          data.delivery_address,
          data.notes,
          data.customer_id,
          userId,
          tenantId,
        ]
      );
      const orderId = result.insertId;
      for (const item of items) {
        await connection.execute(
          `INSERT INTO order_items
             (product_name, sku, quantity, unit_price, discount, total_price, order_id, product_id, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.product_name,
            item.sku,
            item.quantity,
            item.unit_price,
            item.discount,
            item.total_price,
            orderId,
            item.product_id,
            tenantId,
          ]
        );
      }
      await connection.commit();
      return orderId;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  async updateOrder(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE orders SET
         order_source = ?, order_status = ?, payment_status = ?, fulfillment_status = ?,
         total_amount = ?, discount_amount = ?, delivery_charges = ?, payable_amount = ?,
         city = ?, delivery_address = ?, notes = ?, customer_id = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [
        data.order_source,
        data.order_status,
        data.payment_status,
        data.fulfillment_status,
        data.total_amount,
        data.discount_amount,
        data.delivery_charges,
        data.payable_amount,
        data.city,
        data.delivery_address,
        data.notes,
        data.customer_id,
        id,
        tenantId,
      ]
    );
    return (result.affectedRows ?? 0) === 1;
  },

  async replaceOrderItems(tenantId, orderId, items) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE order_items SET deleted_at = NOW()
         WHERE order_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [orderId, tenantId]
      );
      for (const item of items) {
        await connection.execute(
          `INSERT INTO order_items
             (product_name, sku, quantity, unit_price, discount, total_price, order_id, product_id, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.product_name,
            item.sku,
            item.quantity,
            item.unit_price,
            item.discount,
            item.total_price,
            orderId,
            item.product_id,
            tenantId,
          ]
        );
      }
      await connection.commit();
      return true;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  // Assignments
  async listAssignments(tenantId) {
    const [rows] = await readDb.query(
      `SELECT oa.*, o.order_no, u.name AS assigned_to_name, cb.customer_name AS order_customer_name
       FROM order_assignments oa
       INNER JOIN orders o ON o.id = oa.order_id AND o.deleted_at IS NULL
       LEFT JOIN users u ON u.id = oa.assigned_to AND u.deleted_at IS NULL
       LEFT JOIN crm_customers cb ON cb.id = o.customer_id AND cb.deleted_at IS NULL
       WHERE ${tw("oa", tenantId)}
       ORDER BY oa.assigned_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async createAssignment(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO order_assignments (assigned_to, assignment_type, status, order_id, tenant_id)
       VALUES (?, ?, ?, ?, ?)`,
      [data.assigned_to, data.assignment_type, data.status, data.order_id, tenantId]
    );
    return result.insertId;
  },

  async updateAssignment(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE order_assignments SET assigned_to = ?, assignment_type = ?, status = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [data.assigned_to, data.assignment_type, data.status, id, tenantId]
    );
    return (result.affectedRows ?? 0) === 1;
  },

  async deleteAssignment(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE order_assignments SET deleted_at = NOW()
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return (result.affectedRows ?? 0) === 1;
  },

  // Payments
  async listPayments(tenantId) {
    const [rows] = await readDb.query(
      `SELECT op.*, o.order_no, o.payment_status AS order_payment_status, o.payable_amount,
              c.customer_name
       FROM order_payments op
       INNER JOIN orders o ON o.id = op.order_id AND o.deleted_at IS NULL
       LEFT JOIN crm_customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
       WHERE ${tw("op", tenantId)}
       ORDER BY op.id DESC`,
      [tenantId]
    );
    return rows;
  },

  async listPaymentsForOrder(tenantId, orderId) {
    const [rows] = await readDb.query(
      `SELECT id, bank, cash, amount, payment_method, payment_status, paid_at, order_id
       FROM order_payments
       WHERE order_id = ? AND ${tw("order_payments", tenantId)}
       ORDER BY COALESCE(paid_at, id) DESC, id DESC`,
      [orderId, tenantId]
    );
    return rows;
  },

  async listPaymentTransactions(tenantId) {
    const [rows] = await readDb.query(
      `SELECT o.id AS order_id, o.order_no, o.order_status, o.payment_status,
              o.payable_amount, o.created_at, c.customer_name,
              COALESCE(pay.total_received, 0) AS total_received,
              COALESCE(pay.total_bank, 0) AS total_bank,
              COALESCE(pay.total_cash, 0) AS total_cash,
              GREATEST(0, o.payable_amount - COALESCE(pay.total_received, 0)) AS amount_due
       FROM orders o
       LEFT JOIN crm_customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
       LEFT JOIN (
         SELECT order_id,
                SUM(amount) AS total_received,
                SUM(COALESCE(bank, 0)) AS total_bank,
                SUM(COALESCE(cash, 0)) AS total_cash
         FROM order_payments
         WHERE tenant_id = ? AND deleted_at IS NULL
           AND payment_status IN ('paid', 'partial')
         GROUP BY order_id
       ) pay ON pay.order_id = o.id
       WHERE ${tw("o", tenantId)}
       ORDER BY o.created_at DESC`,
      [tenantId, tenantId]
    );
    return rows;
  },

  async paymentSummary(tenantId) {
    const [[outstanding]] = await readDb.query(
      `SELECT COALESCE(SUM(GREATEST(0, o.payable_amount - COALESCE(pay.total_paid, 0))), 0) AS outstanding_dues
       FROM orders o
       LEFT JOIN (
         SELECT order_id, SUM(amount) AS total_paid
         FROM order_payments
         WHERE tenant_id = ? AND deleted_at IS NULL AND payment_status IN ('paid', 'partial')
         GROUP BY order_id
       ) pay ON pay.order_id = o.id
       WHERE o.tenant_id = ? AND o.deleted_at IS NULL
         AND o.order_status NOT IN ('cancelled')`,
      [tenantId, tenantId]
    );
    const [[received]] = await readDb.query(
      `SELECT COALESCE(SUM(amount), 0) AS received_this_month
       FROM order_payments
       WHERE tenant_id = ? AND deleted_at IS NULL
         AND payment_status IN ('paid', 'partial')
         AND paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
      [tenantId]
    );
    return {
      outstanding_dues: Number(outstanding?.outstanding_dues || 0),
      received_this_month: Number(received?.received_this_month || 0),
    };
  },

  async createPayment(tenantId, data) {
    const bank = Number(data.bank) || 0;
    const cash = Number(data.cash) || 0;
    const amount = Number(data.amount) || bank + cash;
    const [result] = await writeDb.query(
      `INSERT INTO order_payments (payment_method, bank, cash, amount, payment_status, paid_at, order_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.payment_method || (bank > 0 && cash > 0 ? "mixed" : bank > 0 ? "bank_transfer" : "cash"),
        bank,
        cash,
        amount,
        data.payment_status,
        data.paid_at,
        data.order_id,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updatePayment(tenantId, id, data) {
    const bank = Number(data.bank) || 0;
    const cash = Number(data.cash) || 0;
    const amount = Number(data.amount) || bank + cash;
    const [result] = await writeDb.query(
      `UPDATE order_payments
       SET payment_method = ?, bank = ?, cash = ?, amount = ?, payment_status = ?, paid_at = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [
        data.payment_method || (bank > 0 && cash > 0 ? "mixed" : bank > 0 ? "bank_transfer" : "cash"),
        bank,
        cash,
        amount,
        data.payment_status,
        data.paid_at,
        id,
        tenantId,
      ]
    );
    return (result.affectedRows ?? 0) === 1;
  },

  async deletePayment(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE order_payments SET deleted_at = NOW()
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return (result.affectedRows ?? 0) === 1;
  },

  async sumPaymentsForOrder(tenantId, orderId) {
    const [[row]] = await readDb.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid
       FROM order_payments
       WHERE order_id = ? AND tenant_id = ? AND deleted_at IS NULL
         AND payment_status IN ('paid', 'partial')`,
      [orderId, tenantId]
    );
    return Number(row?.total_paid) || 0;
  },

  // Cancellations
  async listCancellations(tenantId) {
    const [rows] = await readDb.query(
      `SELECT oc.*, o.order_no, u.name AS cancelled_by_name, c.customer_name
       FROM order_cancellations oc
       INNER JOIN orders o ON o.id = oc.order_id AND o.deleted_at IS NULL
       LEFT JOIN users u ON u.id = oc.cancelled_by AND u.deleted_at IS NULL
       LEFT JOIN crm_customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
       WHERE ${tw("oc", tenantId)}
       ORDER BY oc.cancelled_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async createCancellation(tenantId, userId, data) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO order_cancellations (reason, order_id, cancelled_by, tenant_id)
         VALUES (?, ?, ?, ?)`,
        [data.reason, data.order_id, userId, tenantId]
      );
      await connection.execute(
        `UPDATE orders SET order_status = 'cancelled'
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [data.order_id, tenantId]
      );
      await connection.commit();
      return result.insertId;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  // Returns
  async listReturns(tenantId) {
    const [rows] = await readDb.query(
      `SELECT ort.*, o.order_no, u.name AS created_by_name, c.customer_name
       FROM order_returns ort
       INNER JOIN orders o ON o.id = ort.order_id AND o.deleted_at IS NULL
       LEFT JOIN users u ON u.id = ort.created_by AND u.deleted_at IS NULL
       LEFT JOIN crm_customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
       WHERE ${tw("ort", tenantId)}
       ORDER BY ort.created_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async createReturn(tenantId, userId, data) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO order_returns (reason, return_status, order_id, created_by, tenant_id)
         VALUES (?, ?, ?, ?, ?)`,
        [data.reason, data.return_status, data.order_id, userId, tenantId]
      );
      await connection.execute(
        `UPDATE orders SET order_status = 'returned'
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [data.order_id, tenantId]
      );
      await connection.commit();
      return result.insertId;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  async updateReturn(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE order_returns SET reason = ?, return_status = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [data.reason, data.return_status, id, tenantId]
    );
    return (result.affectedRows ?? 0) === 1;
  },

  // Exchanges
  async listExchanges(tenantId) {
    const [rows] = await readDb.query(
      `SELECT oe.*, o.order_no, u.name AS created_by_name, c.customer_name,
              op.product_name AS old_product_name, np.product_name AS new_product_name
       FROM order_exchanges oe
       INNER JOIN orders o ON o.id = oe.order_id AND o.deleted_at IS NULL
       LEFT JOIN users u ON u.id = oe.created_by AND u.deleted_at IS NULL
       LEFT JOIN crm_customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
       LEFT JOIN inventory_products op ON op.id = oe.old_product_id AND op.deleted_at IS NULL
       LEFT JOIN inventory_products np ON np.id = oe.new_product_id AND np.deleted_at IS NULL
       WHERE ${tw("oe", tenantId)}
       ORDER BY oe.created_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async createExchange(tenantId, userId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO order_exchanges
         (reason, exchange_status, order_id, old_product_id, new_product_id, created_by, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.reason,
        data.exchange_status,
        data.order_id,
        data.old_product_id,
        data.new_product_id,
        userId,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateExchange(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE order_exchanges SET reason = ?, exchange_status = ?,
         old_product_id = ?, new_product_id = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [data.reason, data.exchange_status, data.old_product_id, data.new_product_id, id, tenantId]
    );
    return (result.affectedRows ?? 0) === 1;
  },

  // Refunds
  async listRefunds(tenantId) {
    const [rows] = await readDb.query(
      `SELECT orf.*, o.order_no, u.name AS created_by_name, c.customer_name
       FROM order_refunds orf
       INNER JOIN orders o ON o.id = orf.order_id AND o.deleted_at IS NULL
       LEFT JOIN users u ON u.id = orf.created_by AND u.deleted_at IS NULL
       LEFT JOIN crm_customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
       WHERE ${tw("orf", tenantId)}
       ORDER BY orf.id DESC`,
      [tenantId]
    );
    return rows;
  },

  async createRefund(tenantId, userId, data) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO order_refunds
           (refund_amount, refund_method, refund_status, reason, refunded_at, order_id, created_by, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.refund_amount,
          data.refund_method,
          data.refund_status,
          data.reason,
          data.refunded_at,
          data.order_id,
          userId,
          tenantId,
        ]
      );
      if (data.refund_status === "processed") {
        await connection.execute(
          `UPDATE orders SET payment_status = 'refunded'
           WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
          [data.order_id, tenantId]
        );
      }
      await connection.commit();
      return result.insertId;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  async updateRefund(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE order_refunds SET refund_amount = ?, refund_method = ?, refund_status = ?,
         reason = ?, refunded_at = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [
        data.refund_amount,
        data.refund_method,
        data.refund_status,
        data.reason,
        data.refunded_at,
        id,
        tenantId,
      ]
    );
    return (result.affectedRows ?? 0) === 1;
  },
};
