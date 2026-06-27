import { posService } from "../services/posService.js";
import { crmService } from "../services/crmService.js";
import { crmRepository } from "../repositories/crmRepository.js";
import { tryParseEntityId } from "../utils/ids.js";

export const posController = {
  async dashboard(req, res) {
    try {
      res.json(await posService.dashboard(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async reference(req, res) {
    try {
      res.json(await posService.reference(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listOutlets(req, res) {
    try {
      const [data, limits] = await Promise.all([
        posService.listOutlets(req.tenantId),
        posService.getStoreLimits(req.tenantId),
      ]);
      res.json({ data, limits });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createOutlet(req, res) {
    try {
      const row = await posService.createOutlet(req.tenantId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateOutlet(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid outlet id" });
      const row = await posService.updateOutlet(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Outlet not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async deleteOutlet(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid outlet id" });
      const ok = await posService.deleteOutlet(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Outlet not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async outletDashboard(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid store id" });
      const data = await posService.outletDashboard(req.tenantId, id);
      if (!data) return res.status(404).json({ message: "Store not found" });
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listTerminals(req, res) {
    try {
      res.json({ data: await posService.listTerminals(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createTerminal(req, res) {
    try {
      const row = await posService.createTerminal(req.tenantId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateTerminal(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid terminal id" });
      const row = await posService.updateTerminal(req.tenantId, id, req.body);
      if (!row) return res.status(404).json({ message: "Terminal not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async deleteTerminal(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid terminal id" });
      const ok = await posService.deleteTerminal(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Terminal not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listSales(req, res) {
    try {
      res.json({ data: await posService.listSales(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getSale(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid sale id" });
      const row = await posService.getSale(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Sale not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listRegisters(req, res) {
    try {
      res.json({ data: await posService.listRegisters(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listTerminalBalances(req, res) {
    try {
      res.json({ data: await posService.listTerminalBalances(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getTerminalLogs(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid terminal id" });
      const data = await posService.getTerminalLogs(req.tenantId, id);
      if (!data) return res.status(404).json({ message: "Terminal not found" });
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async lookupTerminal(req, res) {
    try {
      const deviceCode = req.query.device_code || req.query.code || "";
      res.json(await posService.lookupTerminalByCode(req.tenantId, deviceCode));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async connectTerminal(req, res) {
    try {
      const result = await posService.connectTerminal(
        req.tenantId,
        req.userId,
        req.body
      );
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async getTerminalSession(req, res) {
    try {
      const terminalId = tryParseEntityId(req.params.terminalId);
      if (!terminalId) return res.status(400).json({ message: "Invalid terminal id" });
      const session = await posService.getTerminalSession(req.tenantId, req.userId, terminalId);
      if (!session?.register) {
        return res.status(404).json({ message: "No active session on this terminal." });
      }
      res.json(session);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getTerminalProducts(req, res) {
    try {
      const terminalId = tryParseEntityId(req.params.terminalId);
      if (!terminalId) return res.status(400).json({ message: "Invalid terminal id" });
      const result = await posService.getTerminalProducts(req.tenantId, terminalId);
      if (!result) return res.status(404).json({ message: "Terminal not found" });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async closeShift(req, res) {
    try {
      const terminalId = tryParseEntityId(req.params.terminalId);
      if (!terminalId) return res.status(400).json({ message: "Invalid terminal id" });
      const result = await posService.closeShift(req.tenantId, req.userId, terminalId);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async createTerminalSale(req, res) {
    try {
      const sale = await posService.createTerminalSale(req.tenantId, req.userId, req.body);
      res.status(201).json(sale);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async lookupCustomer(req, res) {
    try {
      res.json(await crmService.lookupCustomerByPhone(req.tenantId, req.query.phone));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async createTerminalCustomer(req, res) {
    try {
      const customer = await crmService.createCustomer(req.tenantId, req.userId, req.body);
      if (req.body.city && customer?.id) {
        await crmRepository.createAddress(req.tenantId, customer.id, {
          address_type: "default",
          address: "",
          city: req.body.city,
          state: null,
          postal_code: null,
          is_default: true,
        });
      }
      const profile = await crmService.getCustomer(req.tenantId, customer.id);
      res.status(201).json(profile || customer);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },
};
