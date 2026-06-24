import { readDb, writeDb } from "../database/db.js";

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
    const [[discounts]] = await readDb.query(
      `SELECT COALESCE(SUM(GREATEST(0, ts.total_amount - COALESCE(p.total_received, 0))), 0) AS discounts_applied
       FROM wh_tenant_subscriptions ts
       LEFT JOIN (
         SELECT tenant_id, SUM(total_received) AS total_received
         FROM wh_tenant_payments WHERE deleted_at IS NULL
         GROUP BY tenant_id
       ) p ON p.tenant_id = ts.tenant_id
       WHERE ts.deleted_at IS NULL AND ts.status = 'active'
         AND ts.total_amount > COALESCE(p.total_received, 0)`
    );
    return {
      outstanding_dues: Number(dues.outstanding_dues || 0),
      received_this_month: Number(revenue.received_this_month || 0),
      discounts_applied: Number(discounts.discounts_applied || 0),
    };
  },

  async findAllPayments({ limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT p.id, p.bank, p.cash, p.total_received, p.received_at, p.tenant_id,
              t.company_name,
              ts.total_amount, ts.amount_due, ts.billing_cycle, sp.plan_name
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
    return { rows, total };
  },
};
