import { financeRepository } from "../repositories/financeRepository.js";
import { TRANSACTION_TYPES } from "../utils/financeConstants.js";

function mapFinanceTransaction(row) {
  return {
    ...row,
    id: `ft-${row.id}`,
    _finance_id: row.id,
    _source: "finance",
  };
}

function mapOrderPaymentRow(row) {
  return {
    id: `op-${row.id}`,
    source: "order",
    amount: row.amount,
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    paid_at: row.paid_at,
    order_id: row.order_id,
    order_no: row.order_no,
    reference_no: row.order_no,
    payable_amount: row.payable_amount,
    order_payment_status: row.order_payment_status,
    customer_name: row.customer_name,
  };
}

function mapPosPaymentRow(row) {
  return {
    id: `pos-${row.id}`,
    source: "pos",
    pos_sale_id: row.id,
    amount: row.payable_amount,
    payment_method: row.payment_status,
    payment_status: "paid",
    paid_at: row.created_at,
    order_id: null,
    order_no: row.sale_no,
    reference_no: row.sale_no,
    payable_amount: row.payable_amount,
    order_payment_status: null,
    customer_name: row.customer_name,
    outlet_name: row.outlet_name,
  };
}

function mapCustomerPaymentToTransaction(row) {
  const isPos = row.source === "pos";
  return {
    id: row.id,
    transaction_type: TRANSACTION_TYPES.CUSTOMER_PAYMENT,
    amount: row.amount,
    payment_method: row.payment_method,
    reference: isPos
      ? (row.reference_no ? `POS ${row.reference_no}` : `POS sale #${row.pos_sale_id}`)
      : (row.reference_no ? `Order ${row.reference_no}` : `Order #${row.order_id}`),
    notes: [
      row.customer_name ? `Customer: ${row.customer_name}` : null,
      isPos && row.outlet_name ? `Outlet: ${row.outlet_name}` : null,
    ].filter(Boolean).join(" · ") || null,
    transaction_at: row.paid_at,
    order_id: row.order_id,
    pos_sale_id: row.pos_sale_id,
    order_no: row.reference_no,
    customer_name: row.customer_name,
    payment_status: row.payment_status,
    source: row.source,
    outlet_name: row.outlet_name,
    _source: isPos ? "pos_sale" : "order_payment",
  };
}

function sortCustomerPayments(rows) {
  return [...rows].sort((a, b) => {
    const ta = a.paid_at ? new Date(a.paid_at).getTime() : 0;
    const tb = b.paid_at ? new Date(b.paid_at).getTime() : 0;
    return tb - ta || String(b.id).localeCompare(String(a.id));
  });
}

function sortTransactions(rows) {
  return [...rows].sort((a, b) => {
    const ta = a.transaction_at ? new Date(a.transaction_at).getTime() : 0;
    const tb = b.transaction_at ? new Date(b.transaction_at).getTime() : 0;
    return tb - ta || String(b.id).localeCompare(String(a.id));
  });
}

function advanceDueDate(dateStr, frequency) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export const financeService = {
  async dashboard(tenantId) {
    await financeRepository.ensureDefaultSubCategories(tenantId);
    await this.processDueRecurring(tenantId);
    const stats = await financeRepository.dashboardStats(tenantId);
    const recent_transactions = (await this.listTransactions(tenantId)).slice(0, 8);
    return { stats, recent_transactions };
  },

  async processDueRecurring(tenantId) {
    const due = await financeRepository.listDueRecurring(tenantId);
    for (const row of due) {
      const expenseId = await financeRepository.createExpense(tenantId, {
        expense_title: row.title,
        amount: row.amount,
        payment_method: row.bank_account_id ? "bank_transfer" : "other",
        expense_date: row.next_due_date,
        notes: `Auto-deducted recurring expense #${row.id}`,
        category_id: row.category_id,
        sub_category_id: row.sub_category_id,
      });

      if (row.bank_account_id) {
        await financeRepository.adjustBankBalance(tenantId, row.bank_account_id, -Number(row.amount));
      }

      await financeRepository.createTransaction(tenantId, {
        transaction_type: TRANSACTION_TYPES.RECURRING_EXPENSE,
        amount: row.amount,
        payment_method: row.bank_account_id ? "bank_transfer" : "other",
        reference: `recurring:${row.id}`,
        notes: `Recurring: ${row.title} (expense #${expenseId})`,
        transaction_at: new Date(),
      });

      const nextDue = advanceDueDate(row.next_due_date, row.frequency);
      await financeRepository.markRecurringProcessed(tenantId, row.id, nextDue);
    }
    return due.length;
  },

  async listCustomerPayments(tenantId) {
    const [orderRows, posRows] = await Promise.all([
      financeRepository.listOrderCustomerPayments(tenantId),
      financeRepository.listPosCustomerPayments(tenantId),
    ]);
    return sortCustomerPayments([
      ...orderRows.map(mapOrderPaymentRow),
      ...posRows.map(mapPosPaymentRow),
    ]);
  },

  async getCustomerPayment(tenantId, id) {
    const raw = String(id);
    if (raw.startsWith("pos-")) {
      const saleId = Number(raw.slice(4));
      if (!Number.isInteger(saleId) || saleId <= 0) return null;
      const row = await financeRepository.getPosCustomerPayment(tenantId, saleId);
      return row ? mapPosPaymentRow(row) : null;
    }
    const paymentId = raw.startsWith("op-") ? Number(raw.slice(3)) : Number(raw);
    if (!Number.isInteger(paymentId) || paymentId <= 0) return null;
    const row = await financeRepository.getOrderCustomerPayment(tenantId, paymentId);
    return row ? mapOrderPaymentRow(row) : null;
  },

  listVendorBills(tenantId) {
    return financeRepository.listVendorBills(tenantId);
  },

  async createVendorBill(tenantId, body) {
    const id = await financeRepository.createVendorBill(tenantId, body);
    return financeRepository.getVendorBill(tenantId, id);
  },

  async updateVendorBill(tenantId, id, body) {
    const ok = await financeRepository.updateVendorBill(tenantId, id, body);
    if (!ok) return null;
    await financeRepository.updateVendorBillDue(tenantId, id);
    return financeRepository.getVendorBill(tenantId, id);
  },

  deleteVendorBill(tenantId, id) {
    return financeRepository.softDeleteVendorBill(tenantId, id);
  },

  listVendorPayments(tenantId, billId) {
    return financeRepository.listVendorPayments(tenantId, billId);
  },

  async addVendorPayment(tenantId, billId, body) {
    const bill = await financeRepository.getVendorBill(tenantId, billId);
    if (!bill) return null;
    const amount = Number(body.amount_paid) || 0;
    const paymentId = await financeRepository.createVendorPayment(tenantId, {
      ...body,
      amount_paid: amount,
      vendor_bill_id: billId,
    });
    const summary = await financeRepository.updateVendorBillDue(tenantId, billId);
    await financeRepository.createTransaction(tenantId, {
      transaction_type: TRANSACTION_TYPES.VENDOR_PAYMENT,
      amount,
      payment_method: body.payment_method,
      reference: `vendor_bill:${billId}`,
      notes: `Payment to ${bill.vendor_name} — bill ${bill.bill_no}`,
    });
    return { payment_id: paymentId, bill: await financeRepository.getVendorBill(tenantId, billId), ...summary };
  },

  async listExpenses(tenantId) {
    await financeRepository.ensureDefaultSubCategories(tenantId);
    return financeRepository.listExpenses(tenantId);
  },

  expenseReference(tenantId) {
    return Promise.all([
      financeRepository.ensureDefaultSubCategories(tenantId),
      financeRepository.listExpenseCategories(tenantId),
      financeRepository.listExpenseSubCategories(tenantId),
    ]).then(([, categories, subCategories]) => ({ categories, sub_categories: subCategories }));
  },

  async createExpense(tenantId, body) {
    const id = await financeRepository.createExpense(tenantId, body);
    await financeRepository.createTransaction(tenantId, {
      transaction_type: TRANSACTION_TYPES.EXPENSE,
      amount: body.amount,
      payment_method: body.payment_method,
      reference: `expense:${id}`,
      notes: body.expense_title,
      transaction_at: body.expense_date,
    });
    return financeRepository.getExpense(tenantId, id);
  },

  async updateExpense(tenantId, id, body) {
    const ok = await financeRepository.updateExpense(tenantId, id, body);
    return ok ? financeRepository.getExpense(tenantId, id) : null;
  },

  deleteExpense(tenantId, id) {
    return financeRepository.softDeleteExpense(tenantId, id);
  },

  async listRecurringExpenses(tenantId) {
    await this.processDueRecurring(tenantId);
    await financeRepository.ensureDefaultSubCategories(tenantId);
    return financeRepository.listRecurringExpenses(tenantId);
  },

  async createRecurringExpense(tenantId, body) {
    await financeRepository.ensureDefaultSubCategories(tenantId);
    const id = await financeRepository.createRecurringExpense(tenantId, body);
    return financeRepository.getRecurringExpense(tenantId, id);
  },

  async updateRecurringExpense(tenantId, id, body) {
    const ok = await financeRepository.updateRecurringExpense(tenantId, id, body);
    return ok ? financeRepository.getRecurringExpense(tenantId, id) : null;
  },

  deleteRecurringExpense(tenantId, id) {
    return financeRepository.softDeleteRecurringExpense(tenantId, id);
  },

  listBankAccounts(tenantId) {
    return financeRepository.listBankAccounts(tenantId);
  },

  async createBankAccount(tenantId, body) {
    const id = await financeRepository.createBankAccount(tenantId, body);
    return financeRepository.getBankAccount(tenantId, id);
  },

  async updateBankAccount(tenantId, id, body) {
    const ok = await financeRepository.updateBankAccount(tenantId, id, body);
    return ok ? financeRepository.getBankAccount(tenantId, id) : null;
  },

  deleteBankAccount(tenantId, id) {
    return financeRepository.softDeleteBankAccount(tenantId, id);
  },

  async listTransactions(tenantId) {
    const [financeRows, paymentRows] = await Promise.all([
      financeRepository.listTransactions(tenantId),
      this.listCustomerPayments(tenantId),
    ]);
    return sortTransactions([
      ...financeRows.map(mapFinanceTransaction),
      ...paymentRows.map(mapCustomerPaymentToTransaction),
    ]);
  },

  async getTransaction(tenantId, id) {
    const raw = String(id);
    if (raw.startsWith("op-") || raw.startsWith("pos-")) {
      const row = await this.getCustomerPayment(tenantId, raw);
      return row ? mapCustomerPaymentToTransaction(row) : null;
    }
    const financeId = raw.startsWith("ft-") ? Number(raw.slice(3)) : Number(raw);
    if (!Number.isInteger(financeId) || financeId <= 0) return null;
    const row = await financeRepository.getTransaction(tenantId, financeId);
    return row ? mapFinanceTransaction(row) : null;
  },
};
