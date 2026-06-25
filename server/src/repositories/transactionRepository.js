import { readDb } from "../database/db.js";
import {
  addPaymentReceived,
  calcTotalBillingAmount,
  calcCurrentCycleAmount,
  countElapsedCycles,
  getCurrentCycleWindow,
  sumPaymentsInCycle,
} from "../utils/billing.js";

function formatToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Expand id list for prepared statements (mysql2 execute does not support IN (?)). */
function sqlInList(ids) {
  const list = (ids || []).filter((id) => id != null);
  if (!list.length) return { clause: "FALSE", params: [] };
  return { clause: `IN (${list.map(() => "?").join(", ")})`, params: list };
}

function enrichTenantBillingRow(row, payments = []) {
  if (!row) return row;
  const anchor = row.billing_anchor_date || row.start_date;
  const today = formatToday();
  const totalBilling = calcTotalBillingAmount(
    row.plan_price,
    row.billing_cycle,
    anchor,
    today
  );
  const totalReceived = Number(row.total_received || 0);
  const totalDue = Math.max(0, Number((totalBilling - totalReceived).toFixed(2)));
  const { cycle_start, cycle_end } = getCurrentCycleWindow(anchor, today, row.billing_cycle);
  const currentCycleAmount = calcCurrentCycleAmount(row.plan_price, row.billing_cycle);
  const currentCycleReceived = sumPaymentsInCycle(payments, cycle_start, cycle_end);
  const currentCycleDue = Math.max(
    0,
    Number((currentCycleAmount - currentCycleReceived).toFixed(2))
  );

  return {
    ...row,
    total_billing_amount: totalBilling,
    total_amount_due: totalDue,
    total_received: totalReceived,
    current_cycle_amount: currentCycleAmount,
    current_cycle_received: currentCycleReceived,
    current_cycle_due: currentCycleDue,
    cycle_start,
    cycle_end,
    elapsed_periods: countElapsedCycles(anchor, today, row.billing_cycle),
    period_total: totalBilling,
    amount_due: totalDue,
  };
}

function enrichPaymentRow(row) {
  if (!row) return row;
  const anchor = row.billing_anchor_date || row.start_date;
  const totalBilling = calcTotalBillingAmount(
    row.plan_price,
    row.billing_cycle,
    anchor,
    formatToday()
  );
  return { ...row, period_total: totalBilling, total_billing_amount: totalBilling };
}

export const transactionRepository = {
  async processAutoRenewalForTenant(tenantId, connection = null) {
    const query = connection ? connection.execute.bind(connection) : readDb.query.bind(readDb);

    const [subs] = await query(
      `SELECT id, billing_cycle, start_date, renewal_date, billing_anchor_date
       FROM wh_tenant_subscriptions
       WHERE tenant_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [tenantId]
    );
    const sub = subs[0];
    if (!sub) return false;

    const anchor = sub.billing_anchor_date || sub.start_date;
    const today = formatToday();
    const { cycle_start, cycle_end } = getCurrentCycleWindow(anchor, today, sub.billing_cycle);

    if (sub.start_date === cycle_start && sub.renewal_date === cycle_end) return false;

    await query(
      `UPDATE wh_tenant_subscriptions
       SET start_date = ?, renewal_date = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [cycle_start, cycle_end, sub.id]
    );
    await this.syncSubscriptionDues(tenantId, connection);
    return true;
  },

  async getSummary() {
    const [[revenue]] = await readDb.query(
      `SELECT COALESCE(SUM(total_received), 0) AS received_this_month
       FROM wh_tenant_payments
       WHERE deleted_at IS NULL
         AND received_at IS NOT NULL
         AND MONTH(received_at) = MONTH(CURRENT_DATE())
         AND YEAR(received_at) = YEAR(CURRENT_DATE())`
    );
    const [[dues]] = await readDb.query(
      `SELECT COALESCE(SUM(amount_due), 0) AS outstanding_dues
       FROM wh_tenant_subscriptions WHERE deleted_at IS NULL AND status = 'active'`
    );
    return {
      outstanding_dues: Number(dues.outstanding_dues || 0),
      received_this_month: Number(revenue.received_this_month || 0),
    };
  },

  async findAllTenantBilling({ limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT t.id AS tenant_id, t.company_name,
              ts.billing_cycle, ts.start_date, ts.renewal_date AS end_date,
              COALESCE(ts.billing_anchor_date, ts.start_date) AS billing_anchor_date,
              sp.plan_name, sp.plan_price,
              COALESCE(pay.bank, 0) AS bank,
              COALESCE(pay.cash, 0) AS cash,
              COALESCE(pay.total_received, 0) AS total_received
       FROM wh_tenants t
       LEFT JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
       LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
       LEFT JOIN (
         SELECT tenant_id,
                SUM(bank) AS bank,
                SUM(cash) AS cash,
                SUM(total_received) AS total_received
         FROM wh_tenant_payments
         WHERE deleted_at IS NULL AND total_received > 0
         GROUP BY tenant_id
       ) pay ON pay.tenant_id = t.id
       WHERE t.deleted_at IS NULL
       ORDER BY t.company_name ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const tenantIds = rows.map((r) => r.tenant_id).filter(Boolean);
    for (const tenantId of tenantIds) {
      await this.processAutoRenewalForTenant(tenantId);
    }

    let refreshed = rows;
    if (tenantIds.length) {
      const tenantIn = sqlInList(tenantIds);
      const [updated] = await readDb.query(
        `SELECT t.id AS tenant_id, t.company_name,
                ts.billing_cycle, ts.start_date, ts.renewal_date AS end_date,
                COALESCE(ts.billing_anchor_date, ts.start_date) AS billing_anchor_date,
                sp.plan_name, sp.plan_price,
                COALESCE(pay.bank, 0) AS bank,
                COALESCE(pay.cash, 0) AS cash,
                COALESCE(pay.total_received, 0) AS total_received
         FROM wh_tenants t
         LEFT JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
         LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
         LEFT JOIN (
           SELECT tenant_id,
                  SUM(bank) AS bank,
                  SUM(cash) AS cash,
                  SUM(total_received) AS total_received
           FROM wh_tenant_payments
           WHERE deleted_at IS NULL AND total_received > 0
           GROUP BY tenant_id
         ) pay ON pay.tenant_id = t.id
         WHERE t.deleted_at IS NULL AND t.id ${tenantIn.clause}
         ORDER BY t.company_name ASC`,
        tenantIn.params
      );
      refreshed = updated;
    }

    const paymentIn = sqlInList(tenantIds);
    const [paymentRows] = tenantIds.length
      ? await readDb.query(
          `SELECT tenant_id, total_received, received_at
           FROM wh_tenant_payments
           WHERE deleted_at IS NULL AND total_received > 0 AND tenant_id ${paymentIn.clause}`,
          paymentIn.params
        )
      : [[]];

    const paymentsByTenant = new Map();
    for (const p of paymentRows) {
      if (!paymentsByTenant.has(p.tenant_id)) paymentsByTenant.set(p.tenant_id, []);
      paymentsByTenant.get(p.tenant_id).push(p);
    }

    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM wh_tenants WHERE deleted_at IS NULL`
    );
    return {
      rows: refreshed.map((row) =>
        enrichTenantBillingRow(row, paymentsByTenant.get(row.tenant_id) || [])
      ),
      total,
    };
  },

  async findTenantBillingById(tenantId) {
    await this.processAutoRenewalForTenant(tenantId);
    const [rows] = await readDb.query(
      `SELECT t.id AS tenant_id, t.company_name,
              ts.billing_cycle, ts.start_date, ts.renewal_date AS end_date,
              COALESCE(ts.billing_anchor_date, ts.start_date) AS billing_anchor_date,
              sp.plan_name, sp.plan_price,
              COALESCE(pay.bank, 0) AS bank,
              COALESCE(pay.cash, 0) AS cash,
              COALESCE(pay.total_received, 0) AS total_received
       FROM wh_tenants t
       LEFT JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
       LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
       LEFT JOIN (
         SELECT tenant_id, SUM(bank) AS bank, SUM(cash) AS cash, SUM(total_received) AS total_received
         FROM wh_tenant_payments WHERE deleted_at IS NULL AND total_received > 0
         GROUP BY tenant_id
       ) pay ON pay.tenant_id = t.id
       WHERE t.deleted_at IS NULL AND t.id = ?`,
      [tenantId]
    );
    const [paymentRows] = await readDb.query(
      `SELECT tenant_id, total_received, received_at FROM wh_tenant_payments
       WHERE deleted_at IS NULL AND total_received > 0 AND tenant_id = ?`,
      [tenantId]
    );
    return enrichTenantBillingRow(rows[0] || null, paymentRows);
  },

  async findAllPayments({ limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.bank, p.cash, p.total_received, p.received_at, p.tenant_id,
              t.company_name,
              ts.total_amount, ts.amount_due, ts.billing_cycle,
              ts.start_date, ts.renewal_date AS end_date,
              sp.plan_name, sp.plan_price
       FROM wh_tenant_payments p
       INNER JOIN wh_tenants t ON t.id = p.tenant_id AND t.deleted_at IS NULL
       LEFT JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
       LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
       WHERE p.deleted_at IS NULL AND p.total_received > 0
       ORDER BY COALESCE(p.received_at, p.id) DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM wh_tenant_payments WHERE deleted_at IS NULL AND total_received > 0`
    );
    return { rows: rows.map(enrichPaymentRow), total };
  },

  async findPaymentById(id) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.bank, p.cash, p.total_received, p.received_at, p.tenant_id,
              t.company_name,
              ts.id AS subscription_id, ts.total_amount, ts.amount_due, ts.billing_cycle,
              ts.start_date, ts.renewal_date AS end_date,
              sp.plan_name, sp.plan_price
       FROM wh_tenant_payments p
       INNER JOIN wh_tenants t ON t.id = p.tenant_id AND t.deleted_at IS NULL
       LEFT JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
       LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id]
    );
    return enrichPaymentRow(rows[0] || null);
  },

  async findPaymentsByTenant(tenantId) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.bank, p.cash, p.total_received, p.received_at, p.tenant_id,
              t.company_name,
              ts.id AS subscription_id, ts.total_amount, ts.amount_due, ts.billing_cycle,
              ts.start_date, ts.renewal_date AS end_date,
              sp.plan_name, sp.plan_price
       FROM wh_tenant_payments p
       INNER JOIN wh_tenants t ON t.id = p.tenant_id AND t.deleted_at IS NULL
       LEFT JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
       LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
       WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND p.total_received > 0
       ORDER BY COALESCE(p.received_at, p.id) DESC`,
      [tenantId]
    );
    return rows.map(enrichPaymentRow);
  },

  async syncSubscriptionDues(tenantId, connection = null) {
    const db = connection || readDb;
    const query = connection ? connection.execute.bind(connection) : db.query.bind(db);

    const [payments] = await query(
      `SELECT COALESCE(SUM(total_received), 0) AS total
       FROM wh_tenant_payments WHERE tenant_id = ? AND deleted_at IS NULL AND total_received > 0`,
      [tenantId]
    );
    const paid = Number(payments[0]?.total || 0);

    const [subs] = await query(
      `SELECT ts.id, ts.billing_cycle, ts.start_date, ts.renewal_date AS end_date,
              COALESCE(ts.billing_anchor_date, ts.start_date) AS billing_anchor_date,
              sp.plan_price
       FROM wh_tenant_subscriptions ts
       LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
       WHERE ts.tenant_id = ? AND ts.deleted_at IS NULL
       LIMIT 1`,
      [tenantId]
    );
    const sub = subs[0];
    if (!sub) return;

    const periodTotal = calcTotalBillingAmount(
      sub.plan_price,
      sub.billing_cycle,
      sub.billing_anchor_date,
      formatToday()
    );
    const amountDue = Math.max(0, Number((periodTotal - paid).toFixed(2)));

    await query(
      `UPDATE wh_tenant_subscriptions
       SET total_amount = ?, amount_due = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [periodTotal, amountDue, sub.id]
    );
  },

  async sumTenantPayments(tenantId, excludePaymentId = null) {
    let sql = `SELECT COALESCE(SUM(total_received), 0) AS total
               FROM wh_tenant_payments
               WHERE tenant_id = ? AND deleted_at IS NULL AND total_received > 0`;
    const params = [tenantId];
    if (excludePaymentId) {
      sql += ` AND id != ?`;
      params.push(excludePaymentId);
    }
    const [[row]] = await readDb.query(sql, params);
    return Number(row.total || 0);
  },

  async findTenantBillingContext(tenantId) {
    await this.processAutoRenewalForTenant(tenantId);
    const [rows] = await readDb.query(
      `SELECT t.id AS tenant_id, t.company_name,
              ts.id AS subscription_id, ts.billing_cycle, ts.start_date, ts.renewal_date AS end_date,
              COALESCE(ts.billing_anchor_date, ts.start_date) AS billing_anchor_date,
              sp.plan_name, sp.plan_price
       FROM wh_tenants t
       LEFT JOIN wh_tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.deleted_at IS NULL
       LEFT JOIN wh_subscription_plans sp ON sp.id = ts.subscription_plan_id AND sp.deleted_at IS NULL
       WHERE t.id = ? AND t.deleted_at IS NULL`,
      [tenantId]
    );
    return enrichPaymentRow(rows[0] || null);
  },

  async createPayment(tenantId, { bank, cash }) {
    const ctx = await this.findTenantBillingContext(tenantId);
    if (!ctx) {
      const err = new Error("Tenant not found");
      err.status = 404;
      throw err;
    }

    const bankAmt = Number(bank) || 0;
    const cashAmt = Number(cash) || 0;
    if (bankAmt < 0 || cashAmt < 0) {
      const err = new Error("Bank and cash amounts cannot be negative");
      err.status = 400;
      throw err;
    }
    if (bankAmt === 0 && cashAmt === 0) {
      const err = new Error("Enter an amount to add");
      err.status = 400;
      throw err;
    }

    const totalReceived = addPaymentReceived(bankAmt, cashAmt);
    const periodTotal = ctx.period_total ?? 0;
    const alreadyPaid = await this.sumTenantPayments(tenantId);
    if (alreadyPaid + totalReceived > periodTotal + 0.001) {
      const err = new Error(`Payment cannot exceed the period total of ${periodTotal}`);
      err.status = 400;
      throw err;
    }

    const pool = (await import("../database/db.js")).getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO wh_tenant_payments (bank, cash, total_received, received_at, tenant_id)
         VALUES (?, ?, ?, NOW(), ?)`,
        [bankAmt, cashAmt, totalReceived, tenantId]
      );
      await this.syncSubscriptionDues(tenantId, connection);
      await connection.commit();
      return this.findPaymentById(result.insertId);
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  async updatePayment(id, { bank, cash }) {
    const payment = await this.findPaymentById(id);
    if (!payment) {
      const err = new Error("Payment not found");
      err.status = 404;
      throw err;
    }

    const bankAmt = Number(bank) || 0;
    const cashAmt = Number(cash) || 0;
    if (bankAmt < 0 || cashAmt < 0) {
      const err = new Error("Bank and cash amounts cannot be negative");
      err.status = 400;
      throw err;
    }

    const totalReceived = addPaymentReceived(bankAmt, cashAmt);
    const periodTotal = payment.period_total ?? 0;
    const otherPaid = await this.sumTenantPayments(payment.tenant_id, id);
    if (totalReceived + otherPaid > periodTotal + 0.001) {
      const err = new Error(`Payment cannot exceed the period total of ${periodTotal}`);
      err.status = 400;
      throw err;
    }

    const pool = (await import("../database/db.js")).getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE wh_tenant_payments
         SET bank = ?, cash = ?, total_received = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [bankAmt, cashAmt, totalReceived, id]
      );

      const allPaid = otherPaid + totalReceived;
      const amountDue = Math.max(0, Number((periodTotal - allPaid).toFixed(2)));

      if (payment.subscription_id) {
        await connection.execute(
          `UPDATE wh_tenant_subscriptions
           SET total_amount = ?, amount_due = ?
           WHERE id = ? AND deleted_at IS NULL`,
          [periodTotal, amountDue, payment.subscription_id]
        );
      }

      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }

    return this.findPaymentById(id);
  },

  async deletePayment(id) {
    const payment = await this.findPaymentById(id);
    if (!payment) {
      const err = new Error("Payment not found");
      err.status = 404;
      throw err;
    }

    const pool = (await import("../database/db.js")).getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE wh_tenant_payments SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
        [id]
      );
      await this.syncSubscriptionDues(payment.tenant_id, connection);
      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },
};
