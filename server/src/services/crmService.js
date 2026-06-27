import { crmRepository } from "../repositories/crmRepository.js";
import {
  ACTIVE_CUSTOMER_DAYS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  CUSTOMER_TYPES,
  CUSTOMER_STATUSES,
  NOTE_TYPES,
  COMPLAINT_STATUSES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_ISSUE_TYPES,
} from "../utils/crmConstants.js";
import {
  cascadeSoftDeleteCrmCustomer,
  cascadeSoftDeleteCrmLead,
  cascadeSoftDeleteCrmComplaint,
} from "../utils/crmSoftDelete.js";
import {
  normalizeLeadSource,
  normalizeLeadStatus,
  normalizeCustomerType,
  normalizeCustomerStatus,
  normalizeAddressType,
} from "../utils/crmNormalize.js";

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${label}. Use: ${allowed.join(", ")}`);
  }
}

function requireString(value, label) {
  const s = String(value || "").trim();
  if (!s) throw new Error(`${label} is required`);
  return s;
}

async function assertCrmAssignee(tenantId, userId) {
  if (!userId) return null;
  const users = await crmRepository.listCrmUsers(tenantId);
  if (!users.some((u) => u.id === Number(userId))) {
    throw new Error("Assigned user must have CRM access");
  }
  return Number(userId);
}

async function assertCustomerExists(tenantId, customerId) {
  const customer = await crmRepository.getCustomer(tenantId, customerId);
  if (!customer) throw new Error("Customer not found");
  return customer;
}

export const crmService = {
  async dashboard(tenantId) {
    const stats = await crmRepository.dashboardStats(tenantId, ACTIVE_CUSTOMER_DAYS);
    const totalLeads = Number(stats.total_leads) || 0;
    const converted = Number(stats.converted_leads) || 0;
    return {
      stats: {
        ...stats,
        active_customer_days: ACTIVE_CUSTOMER_DAYS,
        lead_conversion_rate: totalLeads ? Math.round((converted / totalLeads) * 1000) / 10 : 0,
      },
      customer_growth: await crmRepository.dashboardCustomerGrowth(tenantId),
      leads_by_source: await crmRepository.dashboardLeadsBySource(tenantId),
      leads_by_status: await crmRepository.dashboardLeadsByStatus(tenantId),
      recent_activities: await crmRepository.dashboardRecentActivities(tenantId),
      top_customers: await crmRepository.dashboardTopCustomers(tenantId),
    };
  },

  async referenceData(tenantId) {
    return {
      crm_users: await crmRepository.listCrmUsers(tenantId),
      tags: await crmRepository.listTags(tenantId),
      active_customer_days: ACTIVE_CUSTOMER_DAYS,
    };
  },

  // Leads
  listLeads(tenantId) {
    return crmRepository.listLeads(tenantId);
  },

  getLead(tenantId, id) {
    return crmRepository.getLead(tenantId, id);
  },

  async createLead(tenantId, userId, body) {
    const lead_name = requireString(body.lead_name, "Lead name");
    const status = normalizeLeadStatus(body.status, "new");
    const source = normalizeLeadSource(body.source, "manual");
    const assigned_to = await assertCrmAssignee(tenantId, body.assigned_to);
    return crmRepository.createLead(tenantId, userId, { ...body, lead_name, status, source, assigned_to });
  },

  async updateLead(tenantId, userId, id, body) {
    const existing = await crmRepository.getLead(tenantId, id);
    if (!existing) return null;
    if (existing.status === "converted") throw new Error("Converted leads cannot be edited");
    const lead_name = requireString(body.lead_name ?? existing.lead_name, "Lead name");
    const status = normalizeLeadStatus(body.status ?? existing.status, existing.status);
    const source = normalizeLeadSource(body.source ?? existing.source ?? "manual", existing.source || "manual");
    const assigned_to = await assertCrmAssignee(tenantId, body.assigned_to ?? existing.assigned_to);
    return crmRepository.updateLead(tenantId, userId, id, { ...existing, ...body, lead_name, status, source, assigned_to });
  },

  async deleteLead(tenantId, id) {
    return cascadeSoftDeleteCrmLead(id, tenantId);
  },

  async convertLead(tenantId, userId, id, body = {}) {
    const lead = await crmRepository.getLead(tenantId, id);
    if (!lead) return null;
    const customer_type = normalizeCustomerType(body.customer_type, "retailer");
    const status = normalizeCustomerStatus(body.status, "active");
    return crmRepository.convertLead(tenantId, userId, id, { ...body, customer_type, status });
  },

  async importLeads(tenantId, userId, rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("No rows to import");
    const results = { created: 0, skipped: 0, errors: [], warnings: [] };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!String(row.lead_name || "").trim()) {
        const any = Object.values(row).some((v) => String(v || "").trim());
        if (!any) {
          results.skipped += 1;
          continue;
        }
        results.errors.push({ row: i + 2, message: "Lead name is required" });
        continue;
      }
      try {
        let assigned_to = null;
        const assigneeName = String(row.assigned_to_name || "").trim();
        if (assigneeName) {
          assigned_to = await crmRepository.findUserIdByName(tenantId, assigneeName);
          if (!assigned_to) {
            results.warnings.push({
              row: i + 2,
              message: `Assigned user "${assigneeName}" not found — lead imported without assignee`,
            });
          }
        }
        await this.createLead(tenantId, userId, {
          lead_name: row.lead_name.trim(),
          phone: row.phone || null,
          email: row.email || null,
          company_name: row.company_name || null,
          notes: row.notes || null,
          source: normalizeLeadSource(row.source, "csv_import"),
          status: normalizeLeadStatus(row.status, "new", { forImport: true }),
          assigned_to,
        });
        results.created += 1;
      } catch (e) {
        results.errors.push({ row: i + 2, message: e.message });
      }
    }
    if (results.created > 0) {
      await crmRepository.logBulkActivity(tenantId, userId, "lead", "imported", `Imported ${results.created} lead(s) from CSV`);
    }
    return results;
  },

  async exportLeads(tenantId) {
    const leads = await crmRepository.listLeads(tenantId);
    return leads.map((l) => ({
      lead_name: l.lead_name,
      phone: l.phone || "",
      email: l.email || "",
      company_name: l.company_name || "",
      source: l.source || "manual",
      status: l.status,
      notes: l.notes || "",
      assigned_to_name: l.assigned_to_name || "",
    }));
  },

  // Customers
  listCustomers(tenantId) {
    return crmRepository.listCustomers(tenantId);
  },

  getCustomer(tenantId, id) {
    return crmRepository.getCustomerProfile(tenantId, id);
  },

  async lookupCustomerByPhone(tenantId, phone) {
    const p = String(phone || "").trim();
    if (!p) throw new Error("Phone number is required");
    const customers = await crmRepository.findCustomersByPhone(tenantId, p);
    if (!customers.length) return { found: false, customer: null, customers: [] };
    return { found: true, customer: customers[0], customers };
  },

  async createCustomer(tenantId, userId, body) {
    const customer_name = requireString(body.customer_name, "Customer name");
    const customer_type = normalizeCustomerType(body.customer_type, "retailer");
    const status = normalizeCustomerStatus(body.status, "active");
    return crmRepository.createCustomer(tenantId, userId, { ...body, customer_name, customer_type, status });
  },

  async updateCustomer(tenantId, userId, id, body) {
    const existing = await crmRepository.getCustomer(tenantId, id);
    if (!existing) return null;
    const customer_name = requireString(body.customer_name ?? existing.customer_name, "Customer name");
    const customer_type = normalizeCustomerType(body.customer_type ?? existing.customer_type, existing.customer_type);
    const status = normalizeCustomerStatus(body.status ?? existing.status, existing.status);
    return crmRepository.updateCustomer(tenantId, userId, id, {
      ...existing,
      ...body,
      customer_name,
      customer_type,
      status,
      tags: body.tags ?? existing.tags?.map((t) => t.tag_name) ?? [],
    });
  },

  async deleteCustomer(tenantId, id) {
    return cascadeSoftDeleteCrmCustomer(id, tenantId);
  },

  exportCustomers(tenantId) {
    return crmRepository.exportCustomers(tenantId);
  },

  async importCustomers(tenantId, userId, rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("No rows to import");
    const results = { created: 0, updated: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!String(row.customer_name || "").trim()) {
        const any = Object.values(row).some((v) => String(v || "").trim());
        if (!any) {
          results.skipped += 1;
          continue;
        }
        results.errors.push({ row: i + 2, message: "Customer name is required" });
        continue;
      }
      try {
        const tags = row.tags ? String(row.tags).split("|").map((t) => t.trim()).filter(Boolean) : [];
        const payload = {
          customer_name: row.customer_name.trim(),
          company_name: row.company_name || null,
          customer_type: normalizeCustomerType(row.customer_type, "retailer"),
          phone: row.phone || null,
          email: row.email || null,
          status: normalizeCustomerStatus(row.status, "active"),
          note: row.note || null,
          tags,
        };
        const existing = await crmRepository.findCustomerByPhoneOrEmail(tenantId, row.phone, row.email);
        let customerId;
        if (existing) {
          await this.updateCustomer(tenantId, userId, existing.id, payload);
          customerId = existing.id;
          results.updated += 1;
        } else {
          const created = await this.createCustomer(tenantId, userId, payload);
          customerId = created.id;
          results.created += 1;
        }
        if (String(row.billing_address || "").trim()) {
          const customer = await crmRepository.getCustomer(tenantId, customerId);
          const hasDefault = (customer.addresses || []).some((a) => a.is_default);
          if (!hasDefault) {
            await crmRepository.createAddress(tenantId, customerId, {
              address_type: "default",
              address: row.billing_address.trim(),
              city: row.billing_city || null,
              state: row.billing_state || null,
              postal_code: row.billing_postal_code || null,
              is_default: true,
            });
          }
        }
      } catch (e) {
        results.errors.push({ row: i + 2, message: e.message });
      }
    }
    const total = results.created + results.updated;
    if (total > 0) {
      await crmRepository.logBulkActivity(tenantId, userId, "customer", "imported", `Imported ${results.created} and updated ${results.updated} customer(s) from CSV`);
    }
    return results;
  },

  // Addresses
  async createAddress(tenantId, customerId, body) {
    await assertCustomerExists(tenantId, customerId);
    const address_type = normalizeAddressType(body.address_type, "default");
    requireString(body.address, "Address");
    return crmRepository.createAddress(tenantId, customerId, {
      ...body,
      address_type,
      is_default: Boolean(body.is_default) || address_type === "default",
    });
  },

  async updateAddress(tenantId, addressId, body) {
    const address_type = normalizeAddressType(body.address_type, "default");
    requireString(body.address, "Address");
    return crmRepository.updateAddress(tenantId, addressId, {
      ...body,
      address_type,
      is_default: Boolean(body.is_default) || address_type === "default",
    });
  },

  deleteAddress(tenantId, addressId) {
    return crmRepository.deleteAddress(tenantId, addressId);
  },

  // Notes
  async createNote(tenantId, userId, customerId, body) {
    await assertCustomerExists(tenantId, customerId);
    const note_type = body.note_type || "note";
    assertOneOf(note_type, NOTE_TYPES, "note type");
    const bodyText = requireString(body.body, "Note body");
    return crmRepository.createNote(tenantId, userId, customerId, { note_type, body: bodyText });
  },

  // Complaints
  listComplaints(tenantId) {
    return crmRepository.listComplaints(tenantId);
  },

  getComplaint(tenantId, id) {
    return crmRepository.getComplaint(tenantId, id);
  },

  async createComplaint(tenantId, userId, body) {
    const subject = requireString(body.subject, "Subject");
    await assertCustomerExists(tenantId, body.customer_id);
    const status = body.status || "open";
    assertOneOf(status, COMPLAINT_STATUSES, "complaint status");
    const priority = body.priority || "medium";
    assertOneOf(priority, COMPLAINT_PRIORITIES, "priority");
    const issue_type = body.issue_type || "complaint";
    assertOneOf(issue_type, COMPLAINT_ISSUE_TYPES, "issue type");
    const assigned_to = await assertCrmAssignee(tenantId, body.assigned_to);
    return crmRepository.createComplaint(tenantId, userId, {
      ...body,
      subject,
      status,
      priority,
      issue_type,
      assigned_to,
    });
  },

  async updateComplaint(tenantId, userId, id, body) {
    const existing = await crmRepository.getComplaint(tenantId, id);
    if (!existing) return null;
    const subject = requireString(body.subject ?? existing.subject, "Subject");
    assertOneOf(body.status ?? existing.status, COMPLAINT_STATUSES, "complaint status");
    assertOneOf(body.priority ?? existing.priority, COMPLAINT_PRIORITIES, "priority");
    assertOneOf(body.issue_type ?? existing.issue_type, COMPLAINT_ISSUE_TYPES, "issue type");
    const assigned_to = await assertCrmAssignee(tenantId, body.assigned_to ?? existing.assigned_to);
    return crmRepository.updateComplaint(tenantId, userId, id, { ...existing, ...body, subject, assigned_to });
  },

  async deleteComplaint(tenantId, id) {
    return cascadeSoftDeleteCrmComplaint(id, tenantId);
  },
};
