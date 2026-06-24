import { transactionService } from "../services/transactionService.js";

export const transactionController = {
  async summary(req, res) {
    try {
      res.json(await transactionService.getSummary());
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listPayments(req, res) {
    try {
      res.json(await transactionService.listPayments(req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async updatePayment(req, res) {
    try {
      const data = await transactionService.updatePayment(req.params.id, req.body);
      res.json({ data });
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message });
    }
  },
};
