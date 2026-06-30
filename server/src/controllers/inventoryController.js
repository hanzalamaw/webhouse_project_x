import { inventoryService } from "../services/inventoryService.js";
import { tryParseEntityId } from "../utils/ids.js";

export const inventoryController = {
  async dashboard(req, res) {
    try {
      res.json(await inventoryService.dashboard(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async reference(req, res) {
    try {
      res.json(await inventoryService.referenceData(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listCategories(req, res) {
    try {
      res.json(await inventoryService.listCategories(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getCategory(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid category id" });
      const row = await inventoryService.getCategory(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Category not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createCategory(req, res) {
    try {
      const row = await inventoryService.createCategory(req.tenantId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateCategory(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid category id" });
      const row = await inventoryService.updateCategory(req.tenantId, id, req.body);
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
      const ok = await inventoryService.removeCategory(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Category not found" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listProducts(req, res) {
    try {
      res.json(await inventoryService.listProducts(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getProduct(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid product id" });
      const row = await inventoryService.getProduct(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Product not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createProduct(req, res) {
    try {
      const row = await inventoryService.createProduct(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateProduct(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid product id" });
      const row = await inventoryService.updateProduct(req.tenantId, req.userId, id, req.body);
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
      const ok = await inventoryService.removeProduct(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Product not found" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async exportProducts(req, res) {
    try {
      const rows = await inventoryService.exportProducts(req.tenantId);
      res.json({ data: rows });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async importProducts(req, res) {
    try {
      const result = await inventoryService.importProducts(req.tenantId, req.userId, req.body.rows);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listWarehouses(req, res) {
    try {
      res.json(await inventoryService.listWarehouses(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getWarehouse(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid warehouse id" });
      const row = await inventoryService.getWarehouse(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Warehouse not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createWarehouse(req, res) {
    try {
      const row = await inventoryService.createWarehouse(req.tenantId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateWarehouse(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid warehouse id" });
      const row = await inventoryService.updateWarehouse(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Warehouse not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async removeWarehouse(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid warehouse id" });
      const ok = await inventoryService.removeWarehouse(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Warehouse not found" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listMovements(req, res) {
    try {
      res.json(await inventoryService.listMovements(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async stockIn(req, res) {
    try {
      const row = await inventoryService.stockIn(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async stockOut(req, res) {
    try {
      const row = await inventoryService.stockOut(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listTransfers(req, res) {
    try {
      res.json(await inventoryService.listTransfers(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createTransfer(req, res) {
    try {
      const row = await inventoryService.createTransfer(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async bulkStockIn(req, res) {
    try {
      const row = await inventoryService.bulkStockIn(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async bulkStockOut(req, res) {
    try {
      const row = await inventoryService.bulkStockOut(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async bulkCreateTransfer(req, res) {
    try {
      const row = await inventoryService.bulkCreateTransfer(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async completeTransfer(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid transfer id" });
      const row = await inventoryService.completeTransfer(req.tenantId, req.userId, id);
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
      const row = await inventoryService.cancelTransfer(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Transfer not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },
};
