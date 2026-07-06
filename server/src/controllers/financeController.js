import { financeService } from "../services/financeService.js";

function tryParseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const financeController = {
  async dashboard(req, res) {
    try {
      res.json(await financeService.dashboard(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listCustomerPayments(req, res) {
    try {
      res.json({ data: await financeService.listCustomerPayments(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getCustomerPayment(req, res) {
    try {
      const id = decodeURIComponent(String(req.params.id || "").trim());
      if (!id) return res.status(400).json({ message: "Invalid payment id" });
      const row = await financeService.getCustomerPayment(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Payment not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listVendorBills(req, res) {
    try {
      res.json({ data: await financeService.listVendorBills(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getVendorBill(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid bill id" });
      const row = await financeService.getVendorBill(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Bill not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createVendorBill(req, res) {
    try {
      res.status(201).json(await financeService.createVendorBill(req.tenantId, req.body));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async updateVendorBill(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid bill id" });
      const row = await financeService.updateVendorBill(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Bill not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async deleteVendorBill(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid bill id" });
      const ok = await financeService.deleteVendorBill(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Bill not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listVendorPayments(req, res) {
    try {
      const billId = tryParseId(req.params.billId);
      if (!billId) return res.status(400).json({ message: "Invalid bill id" });
      res.json({ data: await financeService.listVendorPayments(req.tenantId, billId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async addVendorPayment(req, res) {
    try {
      const billId = tryParseId(req.params.billId);
      if (!billId) return res.status(400).json({ message: "Invalid bill id" });
      const result = await financeService.addVendorPayment(req.tenantId, billId, req.body);
      if (!result) return res.status(404).json({ message: "Bill not found" });
      res.status(201).json(result);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listExpenses(req, res) {
    try {
      res.json({ data: await financeService.listExpenses(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getExpense(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid expense id" });
      const row = await financeService.getExpense(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Expense not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async expenseReference(req, res) {
    try {
      res.json(await financeService.expenseReference(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createExpenseCategory(req, res) {
    try {
      res.status(201).json(await financeService.createExpenseCategory(req.tenantId, req.body));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createExpenseSubCategory(req, res) {
    try {
      const categoryId = tryParseId(req.params.categoryId);
      if (!categoryId) return res.status(400).json({ message: "Invalid category id" });
      res.status(201).json(await financeService.createExpenseSubCategory(req.tenantId, categoryId, req.body));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createExpense(req, res) {
    try {
      res.status(201).json(await financeService.createExpense(req.tenantId, req.body));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async updateExpense(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid expense id" });
      const row = await financeService.updateExpense(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Expense not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async deleteExpense(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid expense id" });
      const ok = await financeService.deleteExpense(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Expense not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listRecurringExpenses(req, res) {
    try {
      res.json({ data: await financeService.listRecurringExpenses(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getRecurringExpense(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid recurring expense id" });
      const row = await financeService.getRecurringExpense(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Recurring expense not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createRecurringExpense(req, res) {
    try {
      res.status(201).json(await financeService.createRecurringExpense(req.tenantId, req.body));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async updateRecurringExpense(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid recurring expense id" });
      const row = await financeService.updateRecurringExpense(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Recurring expense not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async deleteRecurringExpense(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid recurring expense id" });
      const ok = await financeService.deleteRecurringExpense(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Recurring expense not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listBankAccounts(req, res) {
    try {
      res.json({ data: await financeService.listBankAccounts(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getBankAccount(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid bank account id" });
      const row = await financeService.getBankAccount(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Bank account not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createBankAccount(req, res) {
    try {
      res.status(201).json(await financeService.createBankAccount(req.tenantId, req.body));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async updateBankAccount(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid bank account id" });
      const row = await financeService.updateBankAccount(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Bank account not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async deleteBankAccount(req, res) {
    try {
      const id = tryParseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid bank account id" });
      const ok = await financeService.deleteBankAccount(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Bank account not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listTransactions(req, res) {
    try {
      res.json({ data: await financeService.listTransactions(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getTransaction(req, res) {
    try {
      const id = decodeURIComponent(String(req.params.id || "").trim());
      if (!id) return res.status(400).json({ message: "Invalid transaction id" });
      const row = await financeService.getTransaction(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Transaction not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};
