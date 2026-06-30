import { readDb, writeDb } from "../database/db.js";

function tw(alias, tenantId) {
  return `${alias}.tenant_id = ? AND ${alias}.deleted_at IS NULL`;
}

export const posRepository = {
  async dashboardStats(tenantId) {
    const [[stats]] = await readDb.query(
      `SELECT
         (SELECT COUNT(*) FROM pos_outlets WHERE tenant_id = ? AND deleted_at IS NULL) AS outlet_count,
         (SELECT COUNT(*) FROM pos_terminals WHERE tenant_id = ? AND deleted_at IS NULL) AS terminal_count,
         (SELECT COUNT(*) FROM pos_sales WHERE tenant_id = ? AND deleted_at IS NULL
            AND DATE(created_at) = CURDATE()) AS sales_today,
         (SELECT COALESCE(SUM(payable_amount), 0) FROM pos_sales WHERE tenant_id = ? AND deleted_at IS NULL
            AND DATE(created_at) = CURDATE()) AS revenue_today,
         (SELECT COUNT(*) FROM pos_cash_registers WHERE tenant_id = ? AND deleted_at IS NULL
            AND closed_at IS NULL) AS open_registers,
         (SELECT COUNT(*) FROM pos_sales WHERE tenant_id = ? AND deleted_at IS NULL) AS total_sales`,
      [tenantId, tenantId, tenantId, tenantId, tenantId, tenantId]
    );
    return stats;
  },

  async listRecentSales(tenantId, limit = 10) {
    const [rows] = await readDb.query(
      `SELECT s.id, s.sale_no, s.payable_amount, s.payment_status, s.created_at,
              o.outlet_name, t.terminal_name, u.name AS cashier_name
       FROM pos_sales s
       INNER JOIN pos_outlets o ON o.id = s.outlet_id AND o.deleted_at IS NULL
       INNER JOIN pos_terminals t ON t.id = s.terminal_id AND t.deleted_at IS NULL
       INNER JOIN users u ON u.id = s.created_by AND u.deleted_at IS NULL
       WHERE ${tw("s", tenantId)}
       ORDER BY s.created_at DESC
       LIMIT ?`,
      [tenantId, limit]
    );
    return rows;
  },

  async listOutlets(tenantId) {
    const [rows] = await readDb.query(
      `SELECT o.*,
              (SELECT COUNT(*) FROM pos_terminals t
               WHERE t.outlet_id = o.id AND t.tenant_id = o.tenant_id AND t.deleted_at IS NULL) AS terminal_count
       FROM pos_outlets o
       WHERE ${tw("o", tenantId)}
       ORDER BY o.created_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async countOutlets(tenantId) {
    const [[row]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM pos_outlets
       WHERE tenant_id = ? AND deleted_at IS NULL`,
      [tenantId]
    );
    return Number(row.total || 0);
  },

  async getTenantStoreLimit(tenantId) {
    const [rows] = await readDb.query(
      `SELECT max_stores FROM wh_tenant_limits
       WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [tenantId]
    );
    return Number(rows[0]?.max_stores || 0);
  },

  async getOutlet(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT * FROM pos_outlets WHERE id = ? AND ${tw("pos_outlets", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async findOutletByName(tenantId, outletName, excludeId = null) {
    const name = String(outletName || "").trim();
    if (!name) return null;
    const params = [tenantId, name];
    let sql = `SELECT id, outlet_name FROM pos_outlets
      WHERE tenant_id = ? AND deleted_at IS NULL
        AND LOWER(TRIM(outlet_name)) = LOWER(?)`;
    if (excludeId != null) {
      sql += " AND id != ?";
      params.push(excludeId);
    }
    sql += " LIMIT 1";
    const [rows] = await readDb.query(sql, params);
    return rows[0] || null;
  },

  async createOutlet(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_outlets (outlet_name, location, city, status, store_open_time, store_close_time, opening_balance, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.outlet_name,
        data.location || null,
        data.city || null,
        data.status || "active",
        data.store_open_time || null,
        data.store_close_time || null,
        Number(data.opening_balance) || 0,
        tenantId,
      ]
    );
    return this.getOutlet(tenantId, result.insertId);
  },

  async updateOutlet(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE pos_outlets SET
         outlet_name = ?, location = ?, city = ?, status = ?,
         store_open_time = ?, store_close_time = ?, opening_balance = ?
       WHERE id = ? AND ${tw("pos_outlets", tenantId)}`,
      [
        data.outlet_name,
        data.location || null,
        data.city || null,
        data.status || "active",
        data.store_open_time || null,
        data.store_close_time || null,
        Number(data.opening_balance) || 0,
        id,
        tenantId,
      ]
    );
    return result.affectedRows === 1 ? this.getOutlet(tenantId, id) : null;
  },

  async deleteOutlet(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE pos_outlets SET deleted_at = NOW() WHERE id = ? AND ${tw("pos_outlets", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows === 1;
  },

  async listTerminals(tenantId) {
    const [rows] = await readDb.query(
      `SELECT t.*, o.outlet_name
       FROM pos_terminals t
       INNER JOIN pos_outlets o ON o.id = t.outlet_id AND o.deleted_at IS NULL
       WHERE ${tw("t", tenantId)}
       ORDER BY t.created_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async getTerminal(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT t.*, o.outlet_name, o.store_open_time, o.store_close_time, o.opening_balance AS store_opening_balance, o.city AS outlet_city
       FROM pos_terminals t
       INNER JOIN pos_outlets o ON o.id = t.outlet_id AND o.deleted_at IS NULL
       WHERE t.id = ? AND ${tw("t", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async getTerminalByDeviceCode(tenantId, outletId, deviceCode, excludeId = null) {
    const params = [deviceCode, outletId, tenantId];
    let exclude = "";
    if (excludeId) {
      exclude = " AND t.id <> ?";
      params.push(excludeId);
    }
    const [rows] = await readDb.query(
      `SELECT t.*, o.outlet_name, o.store_open_time, o.store_close_time, o.opening_balance AS store_opening_balance, o.city AS outlet_city
       FROM pos_terminals t
       INNER JOIN pos_outlets o ON o.id = t.outlet_id AND o.deleted_at IS NULL
       WHERE t.device_code = ? AND t.outlet_id = ? AND ${tw("t", tenantId)}${exclude}
       LIMIT 1`,
      params
    );
    return rows[0] || null;
  },

  async findTerminalByDeviceCode(tenantId, deviceCode, excludeId = null) {
    const code = String(deviceCode || "").trim();
    if (!code) return null;
    const params = [tenantId, code];
    let sql = `SELECT t.*, o.outlet_name
      FROM pos_terminals t
      INNER JOIN pos_outlets o ON o.id = t.outlet_id AND o.deleted_at IS NULL
      WHERE ${tw("t", tenantId)} AND t.device_code = ?`;
    if (excludeId != null) {
      sql += " AND t.id != ?";
      params.push(excludeId);
    }
    sql += " LIMIT 1";
    const [rows] = await readDb.query(sql, params);
    return rows[0] || null;
  },

  async createTerminal(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_terminals (terminal_name, device_code, status, outlet_id, tenant_id)
       VALUES (?, ?, ?, ?, ?)`,
      [data.terminal_name, data.device_code, data.status || "active", data.outlet_id, tenantId]
    );
    return this.getTerminal(tenantId, result.insertId);
  },

  async updateTerminal(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE pos_terminals SET
         terminal_name = ?, device_code = ?, status = ?, outlet_id = ?
       WHERE id = ? AND ${tw("pos_terminals", tenantId)}`,
      [data.terminal_name, data.device_code, data.status || "active", data.outlet_id, id, tenantId]
    );
    return result.affectedRows === 1 ? this.getTerminal(tenantId, id) : null;
  },

  async deleteTerminal(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE pos_terminals SET deleted_at = NOW() WHERE id = ? AND ${tw("pos_terminals", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows === 1;
  },

  async listSales(tenantId) {
    const [rows] = await readDb.query(
      `SELECT s.*, o.outlet_name, t.terminal_name, u.name AS cashier_name,
              c.customer_name
       FROM pos_sales s
       INNER JOIN pos_outlets o ON o.id = s.outlet_id AND o.deleted_at IS NULL
       INNER JOIN pos_terminals t ON t.id = s.terminal_id AND t.deleted_at IS NULL
       INNER JOIN users u ON u.id = s.created_by AND u.deleted_at IS NULL
       LEFT JOIN crm_customers c ON c.id = s.crm_customers_id AND c.deleted_at IS NULL
       WHERE ${tw("s", tenantId)}
       ORDER BY s.created_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async getSale(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT s.*, o.outlet_name, t.terminal_name, u.name AS cashier_name,
              c.customer_name
       FROM pos_sales s
       INNER JOIN pos_outlets o ON o.id = s.outlet_id AND o.deleted_at IS NULL
       INNER JOIN pos_terminals t ON t.id = s.terminal_id AND t.deleted_at IS NULL
       INNER JOIN users u ON u.id = s.created_by AND u.deleted_at IS NULL
       LEFT JOIN crm_customers c ON c.id = s.crm_customers_id AND c.deleted_at IS NULL
       WHERE s.id = ? AND ${tw("s", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    if (!rows[0]) return null;
    const [items] = await readDb.query(
      `SELECT * FROM pos_sale_items
       WHERE pos_sale_id = ? AND tenant_id = ? AND deleted_at IS NULL
       ORDER BY id ASC`,
      [id, tenantId]
    );
    return { ...rows[0], items };
  },

  async listRegisters(tenantId) {
    const [rows] = await readDb.query(
      `SELECT r.*, o.outlet_name, t.terminal_name,
              ob.name AS opened_by_name, cb.name AS closed_by_name
       FROM pos_cash_registers r
       INNER JOIN pos_outlets o ON o.id = r.outlet_id AND o.deleted_at IS NULL
       INNER JOIN pos_terminals t ON t.id = r.terminal_id AND t.deleted_at IS NULL
       INNER JOIN users ob ON ob.id = r.opened_by AND ob.deleted_at IS NULL
       LEFT JOIN users cb ON cb.id = r.closed_by AND cb.deleted_at IS NULL
       WHERE ${tw("r", tenantId)}
       ORDER BY r.opened_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async listTerminalBalances(tenantId) {
    const [rows] = await readDb.query(
      `SELECT t.id, t.terminal_name, t.device_code, t.status, t.outlet_id,
              o.outlet_name,
              r.id AS register_id,
              r.opening_balance,
              r.cash_collected,
              r.opened_at,
              CASE WHEN r.id IS NOT NULL AND r.closed_at IS NULL THEN 'open' ELSE 'closed' END AS shift_status
       FROM pos_terminals t
       INNER JOIN pos_outlets o ON o.id = t.outlet_id AND o.deleted_at IS NULL
       LEFT JOIN pos_cash_registers r ON r.terminal_id = t.id
         AND r.tenant_id = t.tenant_id AND r.deleted_at IS NULL AND r.closed_at IS NULL
       WHERE ${tw("t", tenantId)}
       ORDER BY o.outlet_name ASC, t.terminal_name ASC`,
      [tenantId]
    );
    return rows.map((row) => ({
      ...row,
      current_balance:
        row.shift_status === "open"
          ? Number(row.opening_balance || 0) + Number(row.cash_collected || 0)
          : null,
    }));
  },

  async getTerminalLogs(tenantId, terminalId) {
    const terminal = await this.getTerminal(tenantId, terminalId);
    if (!terminal) return null;

    const [registers] = await readDb.query(
      `SELECT r.*, ob.name AS opened_by_name, cb.name AS closed_by_name
       FROM pos_cash_registers r
       INNER JOIN users ob ON ob.id = r.opened_by AND ob.deleted_at IS NULL
       LEFT JOIN users cb ON cb.id = r.closed_by AND cb.deleted_at IS NULL
       WHERE r.terminal_id = ? AND ${tw("r", tenantId)}
       ORDER BY r.opened_at DESC
       LIMIT 50`,
      [terminalId, tenantId]
    );

    const [sales] = await readDb.query(
      `SELECT s.id, s.sale_no, s.payable_amount, s.payment_status, s.total_amount, s.discount_amount, s.created_at,
              u.name AS cashier_name, c.customer_name
       FROM pos_sales s
       INNER JOIN users u ON u.id = s.created_by AND u.deleted_at IS NULL
       LEFT JOIN crm_customers c ON c.id = s.crm_customers_id AND c.deleted_at IS NULL
       WHERE s.terminal_id = ? AND ${tw("s", tenantId)}
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [terminalId, tenantId]
    );

    const openRegister = await this.getOpenRegister(tenantId, terminalId);

    return { terminal, open_register: openRegister, registers, sales };
  },

  async outletDashboard(tenantId, outletId) {
    const outlet = await this.getOutlet(tenantId, outletId);
    if (!outlet) return null;

    const [[stats]] = await readDb.query(
      `SELECT
         (SELECT COUNT(*) FROM pos_terminals WHERE outlet_id = ? AND tenant_id = ? AND deleted_at IS NULL) AS terminal_count,
         (SELECT COUNT(*) FROM pos_sales WHERE outlet_id = ? AND tenant_id = ? AND deleted_at IS NULL
            AND DATE(created_at) = CURDATE()) AS sales_today,
         (SELECT COALESCE(SUM(payable_amount), 0) FROM pos_sales WHERE outlet_id = ? AND tenant_id = ? AND deleted_at IS NULL
            AND DATE(created_at) = CURDATE()) AS revenue_today,
         (SELECT COUNT(*) FROM pos_cash_registers r
            INNER JOIN pos_terminals t ON t.id = r.terminal_id AND t.deleted_at IS NULL
            WHERE r.outlet_id = ? AND r.tenant_id = ? AND r.deleted_at IS NULL AND r.closed_at IS NULL) AS open_registers,
         (SELECT COUNT(*) FROM pos_sales WHERE outlet_id = ? AND tenant_id = ? AND deleted_at IS NULL) AS total_sales,
         (SELECT COALESCE(SUM(payable_amount), 0) FROM pos_sales WHERE outlet_id = ? AND tenant_id = ? AND deleted_at IS NULL) AS total_revenue`,
      [outletId, tenantId, outletId, tenantId, outletId, tenantId, outletId, tenantId, outletId, tenantId, outletId, tenantId]
    );

    const [terminals] = await readDb.query(
      `SELECT t.id, t.terminal_name, t.device_code, t.status, t.created_at
       FROM pos_terminals t
       WHERE t.outlet_id = ? AND ${tw("t", tenantId)}
       ORDER BY t.terminal_name ASC`,
      [outletId, tenantId]
    );

    const [recent_sales] = await readDb.query(
      `SELECT s.id, s.sale_no, s.payable_amount, s.payment_status, s.created_at,
              t.terminal_name, u.name AS cashier_name
       FROM pos_sales s
       INNER JOIN pos_terminals t ON t.id = s.terminal_id AND t.deleted_at IS NULL
       INNER JOIN users u ON u.id = s.created_by AND u.deleted_at IS NULL
       WHERE s.outlet_id = ? AND ${tw("s", tenantId)}
       ORDER BY s.created_at DESC
       LIMIT 10`,
      [outletId, tenantId]
    );

    const [registers] = await readDb.query(
      `SELECT r.id, r.opening_balance, r.cash_collected, r.closing_balance, r.opened_at, r.closed_at,
              t.terminal_name, ob.name AS opened_by_name
       FROM pos_cash_registers r
       INNER JOIN pos_terminals t ON t.id = r.terminal_id AND t.deleted_at IS NULL
       INNER JOIN users ob ON ob.id = r.opened_by AND ob.deleted_at IS NULL
       WHERE r.outlet_id = ? AND ${tw("r", tenantId)}
       ORDER BY r.opened_at DESC
       LIMIT 15`,
      [outletId, tenantId]
    );

    return {
      outlet,
      stats: {
        terminal_count: Number(stats.terminal_count) || 0,
        sales_today: Number(stats.sales_today) || 0,
        revenue_today: Number(stats.revenue_today) || 0,
        open_registers: Number(stats.open_registers) || 0,
        total_sales: Number(stats.total_sales) || 0,
        total_revenue: Number(stats.total_revenue) || 0,
      },
      terminals,
      recent_sales,
      registers,
    };
  },

  async getOpenRegister(tenantId, terminalId) {
    const [rows] = await readDb.query(
      `SELECT * FROM pos_cash_registers
       WHERE terminal_id = ? AND ${tw("pos_cash_registers", tenantId)} AND closed_at IS NULL
       ORDER BY opened_at DESC LIMIT 1`,
      [terminalId, tenantId]
    );
    return rows[0] || null;
  },

  async getLastClosedRegister(tenantId, terminalId) {
    const [rows] = await readDb.query(
      `SELECT * FROM pos_cash_registers
       WHERE terminal_id = ? AND ${tw("pos_cash_registers", tenantId)} AND closed_at IS NOT NULL
       ORDER BY closed_at DESC LIMIT 1`,
      [terminalId, tenantId]
    );
    return rows[0] || null;
  },

  async openRegister(tenantId, userId, terminal, openingBalance) {
    const [result] = await writeDb.query(
      `INSERT INTO pos_cash_registers
         (opening_balance, cash_collected, outlet_id, terminal_id, opened_by, tenant_id)
       VALUES (?, 0, ?, ?, ?, ?)`,
      [openingBalance, terminal.outlet_id, terminal.id, userId, tenantId]
    );
    const [rows] = await readDb.query(
      `SELECT * FROM pos_cash_registers WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [result.insertId, tenantId]
    );
    return rows[0];
  },

  async closeRegister(tenantId, userId, registerId, closingBalance) {
    const [result] = await writeDb.query(
      `UPDATE pos_cash_registers SET
         closing_balance = ?, closed_at = NOW(), closed_by = ?
       WHERE id = ? AND ${tw("pos_cash_registers", tenantId)} AND closed_at IS NULL`,
      [closingBalance, userId, registerId, tenantId]
    );
    return result.affectedRows === 1;
  },

  async addCashCollected(tenantId, registerId, amount) {
    await writeDb.query(
      `UPDATE pos_cash_registers SET cash_collected = cash_collected + ?
       WHERE id = ? AND ${tw("pos_cash_registers", tenantId)} AND closed_at IS NULL`,
      [amount, registerId, tenantId]
    );
  },

  async nextSaleNo(tenantId) {
    const [[row]] = await readDb.query(
      `SELECT COUNT(*) AS cnt FROM pos_sales WHERE tenant_id = ? AND deleted_at IS NULL`,
      [tenantId]
    );
    const seq = (Number(row.cnt) || 0) + 1;
    return `PS-${String(seq).padStart(6, "0")}`;
  },

  async createSale(tenantId, userId, data) {
    const saleNo = await this.nextSaleNo(tenantId);
    const [result] = await writeDb.query(
      `INSERT INTO pos_sales
         (sale_no, total_amount, discount_amount, payable_amount, payment_status,
          outlet_id, terminal_id, crm_customers_id, created_by, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleNo,
        data.total_amount,
        data.discount_amount || 0,
        data.payable_amount,
        data.payment_status || "paid",
        data.outlet_id,
        data.terminal_id,
        data.crm_customers_id || null,
        userId,
        tenantId,
      ]
    );
    const saleId = result.insertId;
    for (const item of data.items) {
      await writeDb.query(
        `INSERT INTO pos_sale_items
           (product_name, sku, quantity, unit_price, total_price, pos_sale_id, variant_id, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.product_name,
          item.sku,
          item.quantity,
          item.unit_price,
          item.total_price,
          saleId,
          item.variant_id || item.product_id || null,
          tenantId,
        ]
      );
    }
    if (data.register_id && data.register_cash_amount) {
      await this.addCashCollected(tenantId, data.register_id, data.register_cash_amount);
    }
    return this.getSale(tenantId, saleId);
  },

  async listOutletsForReference(tenantId) {
    const [rows] = await readDb.query(
      `SELECT id, outlet_name FROM pos_outlets
       WHERE ${tw("pos_outlets", tenantId)} AND status = 'active'
       ORDER BY outlet_name ASC`,
      [tenantId]
    );
    return rows;
  },
};
