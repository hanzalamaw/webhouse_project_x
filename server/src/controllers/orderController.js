import { orderService } from "../services/orderService.js";
import { tryParseEntityId } from "../utils/ids.js";

export const orderController = {
  async dashboard(req, res) {
    try {
      res.json(await orderService.dashboard(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async reference(req, res) {
    try {
      res.json(await orderService.referenceData(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async warehouseProducts(req, res) {
    try {
      const warehouseId = Number(req.query.warehouse_id);
      if (!warehouseId) return res.status(400).json({ message: "warehouse_id is required" });
      res.json({ data: await orderService.warehouseProducts(req.tenantId, warehouseId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async addFieldOption(req, res) {
    try {
      const { field_key, option_value } = req.body || {};
      res.json(await orderService.addFieldOption(req.tenantId, field_key, option_value));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listOrders(req, res) {
    try {
      res.json({ data: await orderService.listOrders(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async exportOrders(req, res) {
    try {
      res.json({ data: await orderService.exportOrders(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async importOrders(req, res) {
    try {
      res.json(await orderService.importOrders(req.tenantId, req.userId, req.body.rows));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async getOrder(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid order id" });
      const row = await orderService.getOrder(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Order not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createOrder(req, res) {
    try {
      const row = await orderService.createOrder(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateOrder(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid order id" });
      const row = await orderService.updateOrder(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Order not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async deleteOrder(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid order id" });
      const ok = await orderService.deleteOrder(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Order not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listAssignments(req, res) {
    try {
      res.json({ data: await orderService.listAssignments(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createAssignment(req, res) {
    try {
      const row = await orderService.createAssignment(req.tenantId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateAssignment(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid assignment id" });
      const row = await orderService.updateAssignment(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Assignment not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async deleteAssignment(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid assignment id" });
      const ok = await orderService.deleteAssignment(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Assignment not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async paymentSummary(req, res) {
    try {
      res.json(await orderService.paymentSummary(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listPaymentTransactions(req, res) {
    try {
      res.json({ data: await orderService.listPaymentTransactions(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listPaymentsForOrder(req, res) {
    try {
      const orderId = tryParseEntityId(req.params.orderId);
      if (!orderId) return res.status(400).json({ message: "Invalid order id" });
      res.json({ data: await orderService.listPaymentsForOrder(req.tenantId, orderId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listPayments(req, res) {
    try {
      res.json({ data: await orderService.listPayments(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createPayment(req, res) {
    try {
      const row = await orderService.createPayment(req.tenantId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updatePayment(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid payment id" });
      const row = await orderService.updatePayment(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Payment not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async deletePayment(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid payment id" });
      const ok = await orderService.deletePayment(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Payment not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listCancellations(req, res) {
    try {
      res.json({ data: await orderService.listCancellations(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createCancellation(req, res) {
    try {
      const row = await orderService.createCancellation(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listReturns(req, res) {
    try {
      res.json({ data: await orderService.listReturns(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createReturn(req, res) {
    try {
      const row = await orderService.createReturn(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateReturn(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid return id" });
      const row = await orderService.updateReturn(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Return not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listExchanges(req, res) {
    try {
      res.json({ data: await orderService.listExchanges(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createExchange(req, res) {
    try {
      const row = await orderService.createExchange(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateExchange(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid exchange id" });
      const row = await orderService.updateExchange(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Exchange not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listRefunds(req, res) {
    try {
      res.json({ data: await orderService.listRefunds(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createRefund(req, res) {
    try {
      const row = await orderService.createRefund(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateRefund(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid refund id" });
      const row = await orderService.updateRefund(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Refund not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },
};
