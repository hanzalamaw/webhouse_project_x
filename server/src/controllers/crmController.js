import { crmService } from "../services/crmService.js";
import { crmRepository } from "../repositories/crmRepository.js";
import { tryParseEntityId } from "../utils/ids.js";

export const crmController = {
  async dashboard(req, res) {
    try {
      res.json(await crmService.dashboard(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async reference(req, res) {
    try {
      res.json(await crmService.referenceData(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listLeads(req, res) {
    try {
      res.json({ data: await crmService.listLeads(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getLead(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid lead id" });
      const row = await crmService.getLead(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Lead not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createLead(req, res) {
    try {
      const row = await crmService.createLead(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateLead(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid lead id" });
      const row = await crmService.updateLead(req.tenantId, req.userId, id, req.body);
      if (!row) return res.status(404).json({ message: "Lead not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async deleteLead(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid lead id" });
      const ok = await crmService.deleteLead(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Lead not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async convertLead(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid lead id" });
      const result = await crmService.convertLead(req.tenantId, req.userId, id, req.body);
      if (!result) return res.status(404).json({ message: "Lead not found" });
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async importLeads(req, res) {
    try {
      res.json(await crmService.importLeads(req.tenantId, req.userId, req.body.rows));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async exportLeads(req, res) {
    try {
      const data = await crmService.exportLeads(req.tenantId);
      await crmRepository.logBulkActivity(
        req.tenantId,
        req.userId,
        "lead",
        "exported",
        `Exported ${data.length} lead(s) to CSV`
      );
      res.json({ data });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async listCustomers(req, res) {
    try {
      res.json({ data: await crmService.listCustomers(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getCustomer(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid customer id" });
      const row = await crmService.getCustomer(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Customer not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createCustomer(req, res) {
    try {
      const row = await crmService.createCustomer(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateCustomer(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid customer id" });
      const row = await crmService.updateCustomer(req.tenantId, req.userId, id, req.body);
      if (!row) return res.status(404).json({ message: "Customer not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async deleteCustomer(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid customer id" });
      const ok = await crmService.deleteCustomer(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Customer not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async exportCustomers(req, res) {
    try {
      const data = await crmService.exportCustomers(req.tenantId);
      await crmRepository.logBulkActivity(
        req.tenantId,
        req.userId,
        "customer",
        "exported",
        `Exported ${data.length} customer(s) to CSV`
      );
      res.json({ data });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async importCustomers(req, res) {
    try {
      res.json(await crmService.importCustomers(req.tenantId, req.userId, req.body.rows));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async createAddress(req, res) {
    try {
      const customerId = tryParseEntityId(req.params.customerId);
      if (!customerId) return res.status(400).json({ message: "Invalid customer id" });
      const row = await crmService.createAddress(req.tenantId, customerId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateAddress(req, res) {
    try {
      const addressId = tryParseEntityId(req.params.addressId);
      if (!addressId) return res.status(400).json({ message: "Invalid address id" });
      const row = await crmService.updateAddress(req.tenantId, addressId, req.body);
      if (!row) return res.status(404).json({ message: "Address not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async deleteAddress(req, res) {
    try {
      const addressId = tryParseEntityId(req.params.addressId);
      if (!addressId) return res.status(400).json({ message: "Invalid address id" });
      const ok = await crmService.deleteAddress(req.tenantId, addressId);
      if (!ok) return res.status(404).json({ message: "Address not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createNote(req, res) {
    try {
      const customerId = tryParseEntityId(req.params.customerId);
      if (!customerId) return res.status(400).json({ message: "Invalid customer id" });
      const row = await crmService.createNote(req.tenantId, req.userId, customerId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async listComplaints(req, res) {
    try {
      res.json({ data: await crmService.listComplaints(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async getComplaint(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid complaint id" });
      const row = await crmService.getComplaint(req.tenantId, id);
      if (!row) return res.status(404).json({ message: "Complaint not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createComplaint(req, res) {
    try {
      const row = await crmService.createComplaint(req.tenantId, req.userId, req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async updateComplaint(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid complaint id" });
      const row = await crmService.updateComplaint(req.tenantId, req.userId, id, req.body);
      if (!row) return res.status(404).json({ message: "Complaint not found" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  },

  async deleteComplaint(req, res) {
    try {
      const id = tryParseEntityId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid complaint id" });
      const ok = await crmService.deleteComplaint(req.tenantId, id);
      if (!ok) return res.status(404).json({ message: "Complaint not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};
