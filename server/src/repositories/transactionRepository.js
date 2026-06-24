import { readDb } from "../database/db.js";
import { addPaymentReceived, calcPeriodExpectedTotal } from "../utils/billing.js";

function enrichPaymentRow(row) {
  if (!row) return row;
  const period_total = calcPeriodExpectedTotal(
    row.plan_price,
    row.billing_cycle,
    row.start_date,
    row.end_date
  );
  return { ...row, period_total };
}

export const transactionRepository = {
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
       WHERE p.deleted_at IS NULL
       ORDER BY COALESCE(p.received_at, p.id) DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM wh_tenant_payments WHERE deleted_at IS NULL`
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

  async sumTenantPayments(tenantId, excludePaymentId = null) {
    let sql = `SELECT COALESCE(SUM(total_received), 0) AS total
               FROM wh_tenant_payments
               WHERE tenant_id = ? AND deleted_at IS NULL`;
    const params = [tenantId];
    if (excludePaymentId) {
      sql += ` AND id != ?`;
      params.push(excludePaymentId);
    }
    const [[row]] = await readDb.query(sql, params);
    return Number(row.total || 0);
  },

  async updatePayment(id, { bank, cash, received_at }) {
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
    const periodTotal = payment.period_total ?? calcPeriodExpectedTotal(
      payment.plan_price,
      payment.billing_cycle,
      payment.start_date,
      payment.end_date
    );
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
         SET bank = ?, cash = ?, total_received = ?, received_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [bankAmt, cashAmt, totalReceived, received_at || null, id]
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
};
