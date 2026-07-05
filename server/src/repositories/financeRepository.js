import { readDb, writeDb } from "../database/db.js";
import { joinOnTenant } from "../utils/tenantScope.js";

function tw(alias, tenantId) {
  return `${alias}.tenant_id = ? AND ${alias}.deleted_at IS NULL`;
}

export const financeRepository = {
  async dashboardStats(tenantId) {
    const [[customerReceived]] = await readDb.query(
      `SELECT
         COALESCE((
           SELECT SUM(op.amount) FROM order_payments op
           WHERE op.tenant_id = ? AND op.deleted_at IS NULL
             AND op.payment_status IN ('paid', 'partial')
         ), 0)
         + COALESCE((
           SELECT SUM(ps.payable_amount) FROM pos_sales ps
           WHERE ps.tenant_id = ? AND ps.deleted_at IS NULL
         ), 0) AS total`,
      [tenantId, tenantId]
    );
    const [[customerReceivedMonth]] = await readDb.query(
      `SELECT
         COALESCE((
           SELECT SUM(op.amount) FROM order_payments op
           WHERE op.tenant_id = ? AND op.deleted_at IS NULL
             AND op.payment_status IN ('paid', 'partial')
             AND op.paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
         ), 0)
         + COALESCE((
           SELECT SUM(ps.payable_amount) FROM pos_sales ps
           WHERE ps.tenant_id = ? AND ps.deleted_at IS NULL
             AND ps.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
         ), 0) AS total`,
      [tenantId, tenantId]
    );
    const [[receivables]] = await readDb.query(
      `SELECT COALESCE(SUM(GREATEST(0, o.payable_amount - COALESCE(pay.total_paid, 0))), 0) AS total
       FROM orders o
       LEFT JOIN (
         SELECT order_id, SUM(amount) AS total_paid
         FROM order_payments
         WHERE tenant_id = ? AND deleted_at IS NULL AND payment_status IN ('paid', 'partial')
         GROUP BY order_id
       ) pay ON pay.order_id = o.id
       WHERE o.tenant_id = ? AND o.deleted_at IS NULL AND o.order_status NOT IN ('cancelled')`,
      [tenantId, tenantId]
    );
    const [[expensesTotal]] = await readDb.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM finance_expenses WHERE tenant_id = ? AND deleted_at IS NULL`,
      [tenantId]
    );
    const [[expensesMonth]] = await readDb.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM finance_expenses
       WHERE tenant_id = ? AND deleted_at IS NULL
         AND expense_date >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
      [tenantId]
    );
    const [[payables]] = await readDb.query(
      `SELECT COALESCE(SUM(amount_due), 0) AS total
       FROM finance_vendor_bills
       WHERE tenant_id = ? AND deleted_at IS NULL AND status IN ('unpaid', 'partial')`,
      [tenantId]
    );
    const [[cashBalance]] = await readDb.query(
      `SELECT COALESCE(SUM(current_balance), 0) AS total
       FROM finance_bank_accounts
       WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'active'`,
      [tenantId]
    );
    const [[overdueBills]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM finance_vendor_bills
       WHERE tenant_id = ? AND deleted_at IS NULL
         AND status IN ('unpaid', 'partial') AND due_date < CURDATE()`,
      [tenantId]
    );
    const [[dueRecurring]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM finance_recurring_expenses
       WHERE tenant_id = ? AND deleted_at IS NULL
         AND status = 'active' AND next_due_date <= CURDATE()`,
      [tenantId]
    );

    const revenue = Number(customerReceivedMonth?.total || 0);
    const expenses = Number(expensesMonth?.total || 0);

    return {
      revenue,
      expenses,
      profit: revenue - expenses,
      receivables: Number(receivables?.total || 0),
      payables: Number(payables?.total || 0),
      cash_balance: Number(cashBalance?.total || 0),
      customer_received_total: Number(customerReceived?.total || 0),
      expenses_total: Number(expensesTotal?.total || 0),
      overdue_bills: Number(overdueBills?.total || 0),
      due_recurring: Number(dueRecurring?.total || 0),
    };
  },

  async listRecentTransactions(tenantId, limit = 8) {
    const [rows] = await readDb.query(
      `SELECT id, transaction_type, amount, payment_method, reference, transaction_at
       FROM finance_transactions
       WHERE tenant_id = ? AND deleted_at IS NULL
       ORDER BY transaction_at DESC LIMIT ?`,
      [tenantId, limit]
    );
    return rows;
  },

  async listOrderCustomerPayments(tenantId) {
    const [rows] = await readDb.query(
      `SELECT op.id, op.amount, op.payment_method, op.payment_status, op.paid_at, op.order_id,
              o.order_no, o.payable_amount, o.payment_status AS order_payment_status,
              c.customer_name
       FROM order_payments op
       INNER JOIN orders o ON o.id = op.order_id AND ${joinOnTenant("op", "o")}
       LEFT JOIN crm_customers c ON c.id = o.customer_id AND ${joinOnTenant("o", "c")}
       WHERE ${tw("op", tenantId)}
       ORDER BY COALESCE(op.paid_at, op.id) DESC`,
      [tenantId]
    );
    return rows;
  },

  async listPosCustomerPayments(tenantId) {
    const [rows] = await readDb.query(
      `SELECT ps.id, ps.sale_no, ps.payable_amount, ps.payment_status, ps.created_at,
              ps.crm_customers_id, c.customer_name, po.outlet_name
       FROM pos_sales ps
       LEFT JOIN crm_customers c ON c.id = ps.crm_customers_id AND ${joinOnTenant("ps", "c")}
       LEFT JOIN pos_outlets po ON po.id = ps.outlet_id AND ${joinOnTenant("ps", "po")}
       WHERE ${tw("ps", tenantId)}
       ORDER BY ps.created_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async listCustomerPayments(tenantId) {
    return this.listOrderCustomerPayments(tenantId);
  },

  async getOrderCustomerPayment(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT op.*, o.order_no, o.payable_amount, o.order_status, o.payment_status AS order_payment_status,
              c.customer_name, c.phone AS customer_phone
       FROM order_payments op
       INNER JOIN orders o ON o.id = op.order_id AND ${joinOnTenant("op", "o")}
       LEFT JOIN crm_customers c ON c.id = o.customer_id AND ${joinOnTenant("o", "c")}
       WHERE op.id = ? AND ${tw("op", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async getPosCustomerPayment(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT ps.id, ps.sale_no, ps.payable_amount, ps.total_amount, ps.discount_amount,
              ps.payment_status, ps.created_at, ps.crm_customers_id,
              c.customer_name, c.phone AS customer_phone, po.outlet_name
       FROM pos_sales ps
       LEFT JOIN crm_customers c ON c.id = ps.crm_customers_id AND ${joinOnTenant("ps", "c")}
       LEFT JOIN pos_outlets po ON po.id = ps.outlet_id AND ${joinOnTenant("ps", "po")}
       WHERE ps.id = ? AND ${tw("ps", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async getCustomerPayment(tenantId, id) {
    return this.getOrderCustomerPayment(tenantId, id);
  },

  async listVendorBills(tenantId) {
    const [rows] = await readDb.query(
      `SELECT vb.*,
              COALESCE(pay.total_paid, 0) AS total_paid
       FROM finance_vendor_bills vb
       LEFT JOIN (
         SELECT vendor_bill_id, SUM(amount_paid) AS total_paid
         FROM finance_vendor_payments
         WHERE tenant_id = ? AND deleted_at IS NULL
         GROUP BY vendor_bill_id
       ) pay ON pay.vendor_bill_id = vb.id
       WHERE ${tw("vb", tenantId)}
       ORDER BY vb.due_date ASC, vb.id DESC`,
      [tenantId, tenantId]
    );
    return rows;
  },

  async getVendorBill(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT * FROM finance_vendor_bills WHERE id = ? AND ${tw("finance_vendor_bills", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createVendorBill(tenantId, data) {
    const amount = Number(data.bill_amount) || 0;
    const [result] = await writeDb.query(
      `INSERT INTO finance_vendor_bills
       (vendor_name, bill_no, bill_amount, amount_due, due_date, status, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.vendor_name,
        data.bill_no,
        amount,
        amount,
        data.due_date,
        data.status || "unpaid",
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateVendorBill(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE finance_vendor_bills
       SET vendor_name = ?, bill_no = ?, bill_amount = ?, due_date = ?, status = ?
       WHERE id = ? AND ${tw("finance_vendor_bills", tenantId)}`,
      [data.vendor_name, data.bill_no, data.bill_amount, data.due_date, data.status, id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async softDeleteVendorBill(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE finance_vendor_bills SET deleted_at = NOW()
       WHERE id = ? AND ${tw("finance_vendor_bills", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async listVendorPayments(tenantId, billId) {
    const [rows] = await readDb.query(
      `SELECT * FROM finance_vendor_payments
       WHERE vendor_bill_id = ? AND ${tw("finance_vendor_payments", tenantId)}
       ORDER BY paid_at DESC`,
      [billId, tenantId]
    );
    return rows;
  },

  async createVendorPayment(tenantId, data) {
    const amount = Number(data.amount_paid) || 0;
    const [result] = await writeDb.query(
      `INSERT INTO finance_vendor_payments (amount_paid, payment_method, paid_at, vendor_bill_id, tenant_id)
       VALUES (?, ?, ?, ?, ?)`,
      [amount, data.payment_method, data.paid_at || new Date(), data.vendor_bill_id, tenantId]
    );
    return result.insertId;
  },

  async updateVendorBillDue(tenantId, billId) {
    const bill = await this.getVendorBill(tenantId, billId);
    if (!bill) return;
    const [paidRows] = await readDb.query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total
       FROM finance_vendor_payments
       WHERE vendor_bill_id = ? AND ${tw("finance_vendor_payments", tenantId)}`,
      [billId, tenantId]
    );
    const paid = Number(paidRows[0]?.total || 0);
    const billAmount = Number(bill.bill_amount) || 0;
    const due = Math.max(0, billAmount - paid);
    let status = "unpaid";
    if (paid >= billAmount) status = "paid";
    else if (paid > 0) status = "partial";
    await writeDb.query(
      `UPDATE finance_vendor_bills SET amount_due = ?, status = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [due, status, billId, tenantId]
    );
    return { amount_due: due, status, total_paid: paid };
  },

  async listExpenseCategories(tenantId) {
    const [rows] = await readDb.query(
      `SELECT * FROM finance_expense_categories WHERE ${tw("finance_expense_categories", tenantId)}
       ORDER BY category_name`,
      [tenantId]
    );
    return rows;
  },

  async listExpenseSubCategories(tenantId, categoryId = null) {
    const params = [tenantId];
    let sql = `SELECT * FROM finance_expense_sub_categories WHERE ${tw("finance_expense_sub_categories", tenantId)}`;
    if (categoryId) {
      sql += " AND category_id = ?";
      params.push(categoryId);
    }
    sql += " ORDER BY sub_category_name";
    const [rows] = await readDb.query(sql, params);
    return rows;
  },

  async ensureDefaultCategories(tenantId) {
    const existing = await this.listExpenseCategories(tenantId);
    if (existing.length) return existing;
    const defaults = ["Salaries", "Rent", "Utilities", "Logistics", "Marketing", "Miscellaneous"];
    for (const name of defaults) {
      await writeDb.query(
        `INSERT INTO finance_expense_categories (category_name, tenant_id) VALUES (?, ?)`,
        [name, tenantId]
      );
    }
    return this.listExpenseCategories(tenantId);
  },

  async ensureDefaultSubCategories(tenantId) {
    const categories = await this.ensureDefaultCategories(tenantId);
    const existing = await this.listExpenseSubCategories(tenantId);
    if (existing.length) return existing;

    const defaultsByCategory = {
      Salaries: ["Staff wages", "Contractors", "Benefits"],
      Rent: ["Office rent", "Warehouse rent"],
      Utilities: ["Electricity", "Internet", "Water"],
      Logistics: ["Shipping", "Fuel", "Courier"],
      Marketing: ["Ads", "Promotions", "Events"],
      Miscellaneous: ["Supplies", "Subscriptions", "Other"],
    };

    for (const category of categories) {
      const subNames = defaultsByCategory[category.category_name] || ["General"];
      for (const subName of subNames) {
        await writeDb.query(
          `INSERT INTO finance_expense_sub_categories (sub_category_name, category_id, tenant_id)
           VALUES (?, ?, ?)`,
          [subName, category.id, tenantId]
        );
      }
    }
    return this.listExpenseSubCategories(tenantId);
  },

  async listExpenses(tenantId) {
    const [rows] = await readDb.query(
      `SELECT e.*, c.category_name, sc.sub_category_name
       FROM finance_expenses e
       INNER JOIN finance_expense_categories c ON c.id = e.category_id AND ${joinOnTenant("e", "c")}
       LEFT JOIN finance_expense_sub_categories sc ON sc.id = e.sub_category_id AND ${joinOnTenant("e", "sc")}
       WHERE ${tw("e", tenantId)}
       ORDER BY e.expense_date DESC, e.id DESC`,
      [tenantId]
    );
    return rows;
  },

  async getExpense(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT e.*, c.category_name, sc.sub_category_name
       FROM finance_expenses e
       INNER JOIN finance_expense_categories c ON c.id = e.category_id AND ${joinOnTenant("e", "c")}
       LEFT JOIN finance_expense_sub_categories sc ON sc.id = e.sub_category_id AND ${joinOnTenant("e", "sc")}
       WHERE e.id = ? AND ${tw("e", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createExpense(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO finance_expenses
       (expense_title, amount, payment_method, expense_date, notes, category_id, sub_category_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.expense_title,
        Number(data.amount) || 0,
        data.payment_method,
        data.expense_date,
        data.notes || null,
        data.category_id,
        data.sub_category_id || null,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateExpense(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE finance_expenses
       SET expense_title = ?, amount = ?, payment_method = ?, expense_date = ?, notes = ?,
           category_id = ?, sub_category_id = ?
       WHERE id = ? AND ${tw("finance_expenses", tenantId)}`,
      [
        data.expense_title,
        Number(data.amount) || 0,
        data.payment_method,
        data.expense_date,
        data.notes || null,
        data.category_id,
        data.sub_category_id || null,
        id,
        tenantId,
      ]
    );
    return result.affectedRows > 0;
  },

  async softDeleteExpense(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE finance_expenses SET deleted_at = NOW()
       WHERE id = ? AND ${tw("finance_expenses", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async listRecurringExpenses(tenantId) {
    const [rows] = await readDb.query(
      `SELECT r.*, c.category_name, sc.sub_category_name,
              ba.bank_name, ba.account_title, ba.account_number
       FROM finance_recurring_expenses r
       INNER JOIN finance_expense_categories c ON c.id = r.category_id AND ${joinOnTenant("r", "c")}
       LEFT JOIN finance_expense_sub_categories sc ON sc.id = r.sub_category_id AND ${joinOnTenant("r", "sc")}
       LEFT JOIN finance_bank_accounts ba ON ba.id = r.bank_account_id AND ${joinOnTenant("r", "ba")}
       WHERE ${tw("r", tenantId)}
       ORDER BY r.next_due_date ASC`,
      [tenantId]
    );
    return rows;
  },

  async getRecurringExpense(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT r.*, c.category_name, sc.sub_category_name,
              ba.bank_name, ba.account_title, ba.account_number
       FROM finance_recurring_expenses r
       INNER JOIN finance_expense_categories c ON c.id = r.category_id AND ${joinOnTenant("r", "c")}
       LEFT JOIN finance_expense_sub_categories sc ON sc.id = r.sub_category_id AND ${joinOnTenant("r", "sc")}
       LEFT JOIN finance_bank_accounts ba ON ba.id = r.bank_account_id AND ${joinOnTenant("r", "ba")}
       WHERE r.id = ? AND ${tw("r", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async listDueRecurring(tenantId) {
    const [rows] = await readDb.query(
      `SELECT * FROM finance_recurring_expenses
       WHERE tenant_id = ? AND deleted_at IS NULL
         AND status = 'active' AND next_due_date <= CURDATE()`,
      [tenantId]
    );
    return rows;
  },

  async createRecurringExpense(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO finance_recurring_expenses
       (title, amount, frequency, next_due_date, status, category_id, sub_category_id, bank_account_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        Number(data.amount) || 0,
        data.frequency,
        data.next_due_date,
        data.status || "active",
        data.category_id,
        data.sub_category_id || null,
        data.bank_account_id || null,
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateRecurringExpense(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE finance_recurring_expenses
       SET title = ?, amount = ?, frequency = ?, next_due_date = ?, status = ?,
           category_id = ?, sub_category_id = ?, bank_account_id = ?
       WHERE id = ? AND ${tw("finance_recurring_expenses", tenantId)}`,
      [
        data.title,
        Number(data.amount) || 0,
        data.frequency,
        data.next_due_date,
        data.status,
        data.category_id,
        data.sub_category_id || null,
        data.bank_account_id || null,
        id,
        tenantId,
      ]
    );
    return result.affectedRows > 0;
  },

  async markRecurringProcessed(tenantId, id, nextDueDate) {
    await writeDb.query(
      `UPDATE finance_recurring_expenses
       SET next_due_date = ?, last_deducted_at = NOW()
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [nextDueDate, id, tenantId]
    );
  },

  async softDeleteRecurringExpense(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE finance_recurring_expenses SET deleted_at = NOW()
       WHERE id = ? AND ${tw("finance_recurring_expenses", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async listBankAccounts(tenantId) {
    const [rows] = await readDb.query(
      `SELECT * FROM finance_bank_accounts WHERE ${tw("finance_bank_accounts", tenantId)}
       ORDER BY bank_name, account_title`,
      [tenantId]
    );
    return rows;
  },

  async getBankAccount(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT * FROM finance_bank_accounts WHERE id = ? AND ${tw("finance_bank_accounts", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createBankAccount(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO finance_bank_accounts
       (bank_name, account_title, account_number, current_balance, status, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.bank_name,
        data.account_title,
        data.account_number,
        Number(data.current_balance) || 0,
        data.status || "active",
        tenantId,
      ]
    );
    return result.insertId;
  },

  async updateBankAccount(tenantId, id, data) {
    const [result] = await writeDb.query(
      `UPDATE finance_bank_accounts
       SET bank_name = ?, account_title = ?, account_number = ?, current_balance = ?, status = ?
       WHERE id = ? AND ${tw("finance_bank_accounts", tenantId)}`,
      [
        data.bank_name,
        data.account_title,
        data.account_number,
        Number(data.current_balance) || 0,
        data.status,
        id,
        tenantId,
      ]
    );
    return result.affectedRows > 0;
  },

  async adjustBankBalance(tenantId, id, delta) {
    await writeDb.query(
      `UPDATE finance_bank_accounts
       SET current_balance = current_balance + ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [delta, id, tenantId]
    );
  },

  async softDeleteBankAccount(tenantId, id) {
    const [result] = await writeDb.query(
      `UPDATE finance_bank_accounts SET deleted_at = NOW()
       WHERE id = ? AND ${tw("finance_bank_accounts", tenantId)}`,
      [id, tenantId]
    );
    return result.affectedRows > 0;
  },

  async listTransactions(tenantId) {
    const [rows] = await readDb.query(
      `SELECT * FROM finance_transactions WHERE ${tw("finance_transactions", tenantId)}
       ORDER BY transaction_at DESC, id DESC`,
      [tenantId]
    );
    return rows;
  },

  async getTransaction(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT * FROM finance_transactions WHERE id = ? AND ${tw("finance_transactions", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createTransaction(tenantId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO finance_transactions
       (transaction_type, amount, payment_method, reference, notes, transaction_at, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.transaction_type,
        Number(data.amount) || 0,
        data.payment_method || null,
        data.reference || null,
        data.notes || null,
        data.transaction_at || new Date(),
        tenantId,
      ]
    );
    return result.insertId;
  },
};
