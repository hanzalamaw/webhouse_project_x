import { posInventoryService } from "../services/posInventoryService.js";
import { tryParseEntityId } from "../utils/ids.js";

export const posInventoryController = {
  async reference(req, res) {
    try {
      res.json(await posInventoryService.reference(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listCategories(req, res) {
    try {
      res.json(await posInventoryService.listCategories(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getCategory(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid category id" });
      const row = await posInventoryService.getCategory(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Category not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createCategory(req, res) {
    try {
      const row = await posInventoryService.createCategory(req.tenantId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateCategory(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid category id" });
      const row = await posInventoryService.updateCategory(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Category not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async removeCategory(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid category id" });
      const ok = await posInventoryService.removeCategory(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Category not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listProducts(req, res) {
    try {
      res.json(await posInventoryService.listProducts(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getProduct(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid product id" });
      const row = await posInventoryService.getProduct(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Product not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createProduct(req, res) {
    try {
      const row = await posInventoryService.createProduct(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateProduct(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid product id" });
      const row = await posInventoryService.updateProduct(req.tenantId, req.userId, id, req.body);
      if (!row) return res.status(404).json({ message: "Product not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async removeProduct(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid product id" });
      const ok = await posInventoryService.removeProduct(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Product not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async exportProducts(req, res) {
    try {
      const data = await posInventoryService.exportProducts(req.tenantId, req.query);
      res.json({ data });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async importProducts(req, res) {
    try {
      const rows = req.body?.rows;
      const result = await posInventoryService.importProducts(req.tenantId, req.userId, rows);
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listMovements(req, res) {
    try {
      res.json(await posInventoryService.listMovements(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async stockIn(req, res) {
    try {
      res.status(201).json(await posInventoryService.stockIn(req.tenantId, req.userId, req.body));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async stockOut(req, res) {
    try {
      res.status(201).json(await posInventoryService.stockOut(req.tenantId, req.userId, req.body));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async bulkStockIn(req, res) {
    try {
      res.status(201).json(await posInventoryService.bulkStockIn(req.tenantId, req.userId, req.body));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async bulkStockOut(req, res) {
    try {
      res.status(201).json(await posInventoryService.bulkStockOut(req.tenantId, req.userId, req.body));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listTransfers(req, res) {
    try {
      res.json(await posInventoryService.listTransfers(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createTransfer(req, res) {
    try {
      res.status(201).json(await posInventoryService.createTransfer(req.tenantId, req.userId, req.body));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async bulkCreateTransfer(req, res) {
    try {
      res.status(201).json(await posInventoryService.bulkCreateTransfer(req.tenantId, req.userId, req.body));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async completeTransfer(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid transfer id" });
      const row = await posInventoryService.completeTransfer(req.tenantId, req.userId, id);
      if (!row) return res.status(404).json({ message: "Transfer not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async cancelTransfer(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid transfer id" });
      const row = await posInventoryService.cancelTransfer(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Transfer not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },
};
