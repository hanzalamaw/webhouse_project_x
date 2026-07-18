import { readDb, writeDb } from "../database/db.js";
import { joinOnTenant } from "../utils/tenantScope.js";
import { ACTIVE_CUSTOMER_DAYS } from "../utils/crmConstants.js";
import { logCrmActivity, mapAuditRow } from "../utils/crmAudit.js";
import { parseTags, serializeTags, tagsToObjects } from "../utils/crmTags.js";

function tw(alias, tenantId) {
  return `${alias}.tenant_id = ? AND ${alias}.deleted_at IS NULL`;
}

export const crmRepository = {
  async logBulkActivity(tenantId, userId, entityType, action, summary) {
    await logCrmActivity(tenantId, userId, action, summary, { entity_type: entityType, entity_id: 0 });
  },
  async listCrmUsers(tenantId) {
    const [rows] = await readDb.query(
      `SELECT DISTINCT u.id, u.name, u.email
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND ${joinOnTenant("u", "r")}
       WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND u.status = 'active'
         AND (
           r.role_name = 'Super Admin'
           OR EXISTS (
             SELECT 1 FROM permissions p
             INNER JOIN modules m ON m.id = p.module_id AND m.module_name = 'CRM' AND m.deleted_at IS NULL
             WHERE p.role_id = r.id AND p.deleted_at IS NULL
               AND p.action IN ('view', 'manage')
           )
         )
       ORDER BY u.name ASC`,
      [tenantId]
    );
    return rows;
  },

  async listTags(tenantId) {
    const [rows] = await readDb.query(
      `SELECT tags FROM crm_customers
       WHERE tenant_id = ? AND deleted_at IS NULL AND tags IS NOT NULL AND tags != ''`,
      [tenantId]
    );
    const names = new Set();
    for (const row of rows) {
      for (const tag of parseTags(row.tags)) names.add(tag);
    }
    return [...names].sort().map((tag_name) => ({ tag_name }));
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  async dashboardStats(tenantId, activeDays = ACTIVE_CUSTOMER_DAYS) {
    const [[stats]] = await readDb.query(
      `SELECT
         (SELECT COUNT(*) FROM crm_customers WHERE tenant_id = ? AND deleted_at IS NULL) AS total_customers,
         (SELECT COUNT(*) FROM crm_customers c
            WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.status = 'active') AS status_active_customers,
         (SELECT COUNT(DISTINCT c.id) FROM crm_customers c
            WHERE c.tenant_id = ? AND c.deleted_at IS NULL
              AND (
                EXISTS (
                  SELECT 1 FROM orders o
                  WHERE o.customer_id = c.id AND o.tenant_id = ? AND o.deleted_at IS NULL
                    AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                )
                OR EXISTS (
                  SELECT 1 FROM pos_sales ps
                  WHERE ps.crm_customers_id = c.id AND ps.tenant_id = ? AND ps.deleted_at IS NULL
                    AND ps.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                )
              )) AS active_customers,
         (SELECT COUNT(*) FROM crm_leads WHERE tenant_id = ? AND deleted_at IS NULL
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS new_leads_30d,
         (SELECT COUNT(*) FROM crm_leads WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'converted') AS converted_leads,
         (SELECT COUNT(*) FROM crm_leads WHERE tenant_id = ? AND deleted_at IS NULL) AS total_leads,
         (SELECT COUNT(*) FROM crm_customer_complaints WHERE tenant_id = ? AND deleted_at IS NULL
            AND status IN ('open', 'in_progress')) AS open_complaints,
         (SELECT COUNT(*) FROM crm_customers WHERE tenant_id = ? AND deleted_at IS NULL
            AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) AS customers_this_month`,
      [tenantId, tenantId, tenantId, tenantId, activeDays, tenantId, activeDays, tenantId, tenantId, tenantId, tenantId, tenantId]
    );
    return stats;
  },

  async dashboardCustomerGrowth(tenantId, months = 6) {
    const [rows] = await readDb.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month_key,
              MONTHNAME(created_at) AS month_label,
              COUNT(*) AS count
       FROM crm_customers
       WHERE tenant_id = ? AND deleted_at IS NULL
         AND created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
       GROUP BY month_key, month_label
       ORDER BY month_key ASC`,
      [tenantId, months - 1]
    );
    return rows;
  },

  async dashboardLeadsBySource(tenantId) {
    const [rows] = await readDb.query(
      `SELECT COALESCE(source, 'manual') AS label, COUNT(*) AS count
       FROM crm_leads WHERE tenant_id = ? AND deleted_at IS NULL
       GROUP BY COALESCE(source, 'manual')
       ORDER BY count DESC`,
      [tenantId]
    );
    return rows;
  },

  async dashboardLeadsByStatus(tenantId) {
    const [rows] = await readDb.query(
      `SELECT status AS label, COUNT(*) AS count
       FROM crm_leads WHERE tenant_id = ? AND deleted_at IS NULL
       GROUP BY status ORDER BY count DESC`,
      [tenantId]
    );
    return rows;
  },

  async dashboardRecentActivities(tenantId, limit = 12) {
    const [rows] = await readDb.query(
      `SELECT al.id, al.action, al.new_value, al.created_at, u.name AS user_name
       FROM audit_logs al
       INNER JOIN modules m ON m.id = al.module_id AND m.module_name = 'CRM' AND m.deleted_at IS NULL
       LEFT JOIN users u ON u.id = al.user_id AND ${joinOnTenant("al", "u")}
       WHERE al.tenant_id = ? AND al.deleted_at IS NULL
       ORDER BY al.created_at DESC
       LIMIT ?`,
      [tenantId, limit]
    );
    return rows.map(mapAuditRow);
  },

  async dashboardTopCustomers(tenantId, limit = 8, activeDays = ACTIVE_CUSTOMER_DAYS) {
    const [rows] = await readDb.query(
      `SELECT c.id, c.customer_name, c.company_name, c.customer_type, c.status,
              COALESCE(o.order_count, 0) + COALESCE(ps.sale_count, 0) AS transaction_count,
              COALESCE(o.order_revenue, 0) + COALESCE(ps.sale_revenue, 0) AS total_revenue
       FROM crm_customers c
       LEFT JOIN (
         SELECT customer_id, COUNT(*) AS order_count, COALESCE(SUM(payable_amount), 0) AS order_revenue
         FROM orders WHERE tenant_id = ? AND deleted_at IS NULL
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY customer_id
       ) o ON o.customer_id = c.id
       LEFT JOIN (
         SELECT crm_customers_id, COUNT(*) AS sale_count, COALESCE(SUM(payable_amount), 0) AS sale_revenue
         FROM pos_sales WHERE tenant_id = ? AND deleted_at IS NULL
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY crm_customers_id
       ) ps ON ps.crm_customers_id = c.id
       WHERE c.tenant_id = ? AND c.deleted_at IS NULL
       HAVING total_revenue > 0 OR transaction_count > 0
       ORDER BY total_revenue DESC, transaction_count DESC
       LIMIT ?`,
      [tenantId, activeDays, tenantId, activeDays, tenantId, limit]
    );
    return rows;
  },

  // ── Leads ────────────────────────────────────────────────────────────────────
  async listLeads(tenantId) {
    const [rows] = await readDb.query(
      `SELECT l.*, u.name AS assigned_to_name,
              c.customer_name AS converted_customer_name
       FROM crm_leads l
       LEFT JOIN users u ON u.id = l.assigned_to AND ${joinOnTenant("l", "u")}
       LEFT JOIN crm_customers c ON c.id = l.converted_customer_id AND ${joinOnTenant("l", "c")}
       WHERE ${tw("l", tenantId)}
       ORDER BY l.created_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async getLead(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT l.*, u.name AS assigned_to_name
       FROM crm_leads l
       LEFT JOIN users u ON u.id = l.assigned_to AND ${joinOnTenant("l", "u")}
       WHERE l.id = ? AND ${tw("l", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createLead(tenantId, userId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO crm_leads
         (lead_name, phone, email, company_name, source, status, notes, assigned_to, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.lead_name,
        data.phone || null,
        data.email || null,
        data.company_name || null,
        data.source || "manual",
        data.status,
        data.notes || null,
        data.assigned_to || null,
        tenantId,
      ]
    );
    const id = result.insertId;
    const created = await this.getLead(tenantId, id);
    await logCrmActivity(tenantId, userId, "lead_created", `Lead "${data.lead_name}" created`, {
      entity_type: "lead",
      entity_id: id,
      newValue: created,
    });
    return created;
  },

  async updateLead(tenantId, userId, id, data) {
    const before = await this.getLead(tenantId, id);
    await writeDb.query(
      `UPDATE crm_leads SET
         lead_name = ?, phone = ?, email = ?, company_name = ?, source = ?,
         status = ?, notes = ?, assigned_to = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [
        data.lead_name,
        data.phone || null,
        data.email || null,
        data.company_name || null,
        data.source || "manual",
        data.status,
        data.notes || null,
        data.assigned_to || null,
        id,
        tenantId,
      ]
    );
    const after = await this.getLead(tenantId, id);
    await logCrmActivity(tenantId, userId, "lead_updated", `Lead "${data.lead_name}" updated`, {
      entity_type: "lead",
      entity_id: id,
      oldValue: before,
      newValue: after,
    });
    return after;
  },

  async convertLead(tenantId, userId, leadId, customerData) {
    const lead = await this.getLead(tenantId, leadId);
    if (!lead) return null;
    if (lead.status === "converted") throw new Error("Lead is already converted");

    const customer = await this.createCustomer(tenantId, userId, {
      customer_name: customerData.customer_name || lead.lead_name,
      company_name: customerData.company_name || lead.company_name,
      phone: customerData.phone || lead.phone,
      email: customerData.email || lead.email,
      customer_type: customerData.customer_type || "retailer",
      status: customerData.status || "active",
      tags: customerData.tags || [],
    });

    await writeDb.query(
      `UPDATE crm_leads SET status = 'converted', converted_customer_id = ?, converted_at = NOW()
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [customer.id, leadId, tenantId]
    );
    await logCrmActivity(tenantId, userId, "lead_converted", `Lead converted to customer "${customer.customer_name}"`, {
      entity_type: "lead",
      entity_id: leadId,
      oldValue: lead,
      newValue: { ...await this.getLead(tenantId, leadId), converted_customer: customer },
    });
    return { lead: await this.getLead(tenantId, leadId), customer };
  },

  // ── Customers ────────────────────────────────────────────────────────────────
  async listCustomers(tenantId, activeDays = ACTIVE_CUSTOMER_DAYS) {
    const [rows] = await readDb.query(
      `SELECT c.*,
              EXISTS (
                SELECT 1 FROM ecom_entity_links el
                WHERE el.tenant_id = c.tenant_id AND el.entity_type = 'customer'
                  AND el.internal_id = c.id AND el.platform = 'shopify' AND el.deleted_at IS NULL
              ) AS is_shopify_linked,
              (SELECT COUNT(*) FROM orders o
                 WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.deleted_at IS NULL) AS order_count,
              CASE WHEN (
                EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id
                          AND o.deleted_at IS NULL AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY))
                OR EXISTS (SELECT 1 FROM pos_sales ps WHERE ps.crm_customers_id = c.id AND ps.tenant_id = c.tenant_id
                          AND ps.deleted_at IS NULL AND ps.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY))
              ) THEN 1 ELSE 0 END AS recently_active
       FROM crm_customers c
       WHERE ${tw("c", tenantId)}
       ORDER BY c.created_at DESC`,
      [activeDays, activeDays, tenantId]
    );
    return rows.map((r) => ({
      ...r,
      tags: parseTags(r.tags),
      recently_active: Boolean(r.recently_active),
      order_count: Number(r.order_count) || 0,
      is_shopify_linked: Boolean(r.is_shopify_linked),
    }));
  },

  async getCustomer(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT * FROM crm_customers WHERE id = ? AND ${tw("crm_customers", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    const customer = rows[0] || null;
    if (!customer) return null;
    const [addresses] = await readDb.query(
      `SELECT * FROM crm_customer_addresses
       WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL
       ORDER BY is_default DESC, id ASC`,
      [id, tenantId]
    );
    const normalizedAddresses = addresses.map((a) => ({
      ...a,
      is_default: a.is_default === true || a.is_default === 1 || a.is_default === "1"
        || (typeof Buffer !== "undefined" && Buffer.isBuffer(a.is_default) && a.is_default[0] === 1)
        ? 1
        : 0,
    }));
    return { ...customer, tags: tagsToObjects(customer.tags), addresses: normalizedAddresses };
  },

  async getCustomerProfile(tenantId, id, activeDays = ACTIVE_CUSTOMER_DAYS) {
    const customer = await this.getCustomer(tenantId, id);
    if (!customer) return null;

    const [orders] = await readDb.query(
      `SELECT id, order_no, order_status, payment_status, fulfillment_status, payable_amount, created_at
       FROM orders
       WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id, tenantId]
    );

    const [posSales] = await readDb.query(
      `SELECT id, sale_no, payable_amount, payment_status, created_at
       FROM pos_sales
       WHERE crm_customers_id = ? AND tenant_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id, tenantId]
    );

    const [complaints] = await readDb.query(
      `SELECT cmp.id, cmp.subject, cmp.status, cmp.priority, cmp.issue_type, cmp.created_at, cmp.resolved_at
       FROM crm_customer_complaints cmp
       WHERE cmp.customer_id = ? AND cmp.tenant_id = ? AND cmp.deleted_at IS NULL
       ORDER BY cmp.created_at DESC`,
      [id, tenantId]
    );

    const [activities] = await readDb.query(
      `SELECT al.id, al.action, al.new_value, al.created_at, u.name AS user_name
       FROM audit_logs al
       INNER JOIN modules m ON m.id = al.module_id AND m.module_name = 'CRM' AND m.deleted_at IS NULL
       LEFT JOIN users u ON u.id = al.user_id AND ${joinOnTenant("al", "u")}
       WHERE al.tenant_id = ? AND al.deleted_at IS NULL
         AND JSON_UNQUOTE(JSON_EXTRACT(al.new_value, '$.entity_type')) = 'customer'
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(al.new_value, '$.entity_id')) AS UNSIGNED) = ?
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [tenantId, id]
    );

    const [leadRows] = await readDb.query(
      `SELECT id, lead_name, source, converted_at
       FROM crm_leads
       WHERE converted_customer_id = ? AND tenant_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [id, tenantId]
    );

    const [[stats]] = await readDb.query(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL) AS order_count,
         (SELECT COALESCE(SUM(payable_amount), 0) FROM orders WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL) AS order_revenue,
         (SELECT COUNT(*) FROM pos_sales WHERE crm_customers_id = ? AND tenant_id = ? AND deleted_at IS NULL) AS pos_sale_count,
         (SELECT COALESCE(SUM(payable_amount), 0) FROM pos_sales WHERE crm_customers_id = ? AND tenant_id = ? AND deleted_at IS NULL) AS pos_revenue,
         (SELECT COUNT(*) FROM crm_customer_complaints WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL) AS complaint_count,
         (SELECT MIN(created_at) FROM orders WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL) AS first_order_at,
         CASE WHEN (
           EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = ? AND o.tenant_id = ? AND o.deleted_at IS NULL
                     AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY))
           OR EXISTS (SELECT 1 FROM pos_sales ps WHERE ps.crm_customers_id = ? AND ps.tenant_id = ? AND ps.deleted_at IS NULL
                     AND ps.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY))
         ) THEN 1 ELSE 0 END AS recently_active`,
      [id, tenantId, id, tenantId, id, tenantId, id, tenantId, id, tenantId, id, tenantId, id, tenantId, activeDays, id, tenantId, activeDays]
    );

    return {
      ...customer,
      orders,
      pos_sales: posSales,
      complaints,
      activities: activities.map(mapAuditRow),
      converted_from_lead: leadRows[0] || null,
      stats: {
        order_count: Number(stats.order_count) || 0,
        order_revenue: Number(stats.order_revenue) || 0,
        pos_sale_count: Number(stats.pos_sale_count) || 0,
        pos_revenue: Number(stats.pos_revenue) || 0,
        complaint_count: Number(stats.complaint_count) || 0,
        recently_active: Boolean(stats.recently_active),
        total_revenue: (Number(stats.order_revenue) || 0) + (Number(stats.pos_revenue) || 0),
        first_order_at: stats.first_order_at || null,
      },
    };
  },

  async createCustomer(tenantId, userId, data) {
    const tags = serializeTags(data.tags);
    const [result] = await writeDb.query(
      `INSERT INTO crm_customers
         (customer_name, company_name, customer_type, tags, phone, email, status, source, note, tenant_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [
        data.customer_name,
        data.company_name || null,
        data.customer_type || "retailer",
        tags || null,
        data.phone || null,
        data.email || null,
        data.status || "active",
        data.source || "manual",
        data.note || null,
        tenantId,
        data.created_at || null,
      ]
    );
    const id = result.insertId;
    const created = await this.getCustomer(tenantId, id);
    await logCrmActivity(tenantId, userId, "customer_created", `Customer "${data.customer_name}" created`, {
      entity_type: "customer",
      entity_id: id,
      newValue: created,
    });
    return created;
  },

  async updateCustomer(tenantId, userId, id, data) {
    const before = await this.getCustomer(tenantId, id);
    const tags = data.tags != null ? serializeTags(data.tags) : null;
    const sql = data.tags != null
      ? `UPDATE crm_customers SET
           customer_name = ?, company_name = ?, customer_type = ?, tags = ?,
           phone = ?, email = ?, status = ?, source = COALESCE(?, source), note = ?
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
      : `UPDATE crm_customers SET
           customer_name = ?, company_name = ?, customer_type = ?,
           phone = ?, email = ?, status = ?, source = COALESCE(?, source), note = ?
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`;
    const params = data.tags != null
      ? [
          data.customer_name,
          data.company_name || null,
          data.customer_type || "retailer",
          tags || null,
          data.phone || null,
          data.email || null,
          data.status || "active",
          data.source ?? null,
          data.note || null,
          id,
          tenantId,
        ]
      : [
          data.customer_name,
          data.company_name || null,
          data.customer_type || "retailer",
          data.phone || null,
          data.email || null,
          data.status || "active",
          data.source ?? null,
          data.note || null,
          id,
          tenantId,
        ];
    await writeDb.query(sql, params);
    const after = await this.getCustomer(tenantId, id);
    await logCrmActivity(tenantId, userId, "customer_updated", `Customer "${data.customer_name}" updated`, {
      entity_type: "customer",
      entity_id: id,
      oldValue: before,
      newValue: after,
    });
    return after;
  },

  async exportCustomers(tenantId) {
    const [rows] = await readDb.query(
      `SELECT c.customer_name, c.company_name, c.customer_type, c.phone, c.email, c.status, c.note, c.tags,
              a.address AS billing_address, a.city AS billing_city, a.state AS billing_state, a.postal_code AS billing_postal_code
       FROM crm_customers c
       LEFT JOIN crm_customer_addresses a
         ON a.customer_id = c.id AND a.tenant_id = c.tenant_id AND a.deleted_at IS NULL
         AND a.is_default = 1
       WHERE c.tenant_id = ? AND c.deleted_at IS NULL
       ORDER BY c.customer_name ASC`,
      [tenantId]
    );
    return rows.map((c) => ({
      customer_name: c.customer_name,
      company_name: c.company_name || "",
      customer_type: c.customer_type,
      phone: c.phone || "",
      email: c.email || "",
      status: c.status,
      tags: parseTags(c.tags).join("|"),
      note: c.note || "",
      billing_address: c.billing_address || "",
      billing_city: c.billing_city || "",
      billing_state: c.billing_state || "",
      billing_postal_code: c.billing_postal_code || "",
    }));
  },

  async findCustomersByPhone(tenantId, phone) {
    const p = String(phone || "").trim();
    if (!p) return [];
    const [rows] = await readDb.query(
      `SELECT id, customer_name, company_name, customer_type, phone, email, status
       FROM crm_customers
       WHERE tenant_id = ? AND deleted_at IS NULL AND phone = ?
       ORDER BY customer_name ASC, id ASC`,
      [tenantId, p]
    );
    return rows;
  },

  async findCustomerByPhoneOrEmail(tenantId, phone, email) {
    const p = String(phone || "").trim();
    const e = String(email || "").trim().toLowerCase();
    const select = `SELECT id, source, customer_name, phone, email FROM crm_customers`;
    if (p) {
      const [rows] = await readDb.query(
        `${select}
         WHERE tenant_id = ? AND deleted_at IS NULL AND phone = ? LIMIT 1`,
        [tenantId, p]
      );
      if (rows[0]) return rows[0];
      // Match when formatting differs (+92… vs 03…) by comparing digit suffixes.
      const digits = p.replace(/\D/g, "");
      if (digits.length >= 7) {
        const suffix = digits.slice(-10);
        const [fuzzy] = await readDb.query(
          `${select}
           WHERE tenant_id = ? AND deleted_at IS NULL
             AND phone IS NOT NULL AND phone != ''
             AND RIGHT(
               REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''),
               10
             ) = ?
           LIMIT 1`,
          [tenantId, suffix]
        );
        if (fuzzy[0]) return fuzzy[0];
      }
    }
    if (e) {
      const [rows] = await readDb.query(
        `${select}
         WHERE tenant_id = ? AND deleted_at IS NULL AND LOWER(email) = ? LIMIT 1`,
        [tenantId, e]
      );
      return rows[0] || null;
    }
    return null;
  },

  async findUserIdByName(tenantId, name) {
    const n = String(name || "").trim();
    if (!n) return null;
    const users = await this.listCrmUsers(tenantId);
    const match = users.find((u) => u.name.toLowerCase() === n.toLowerCase());
    return match?.id ?? null;
  },

  // ── Addresses ──────────────────────────────────────────────────────────────
  async countAddresses(tenantId, customerId) {
    const [[row]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM crm_customer_addresses
       WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [customerId, tenantId]
    );
    return Number(row.total || 0);
  },

  async countDefaultAddresses(tenantId, customerId) {
    const [[row]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM crm_customer_addresses
       WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL AND is_default = 1`,
      [customerId, tenantId]
    );
    return Number(row.total || 0);
  },

  async clearDefaultAddresses(tenantId, customerId, exceptId = null) {
    const params = [customerId, tenantId];
    let sql = `UPDATE crm_customer_addresses SET is_default = 0
       WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL`;
    if (exceptId != null) {
      sql += ` AND id != ?`;
      params.push(exceptId);
    }
    await writeDb.query(sql, params);
  },

  async promoteDefaultAddress(tenantId, customerId) {
    const [rows] = await readDb.query(
      `SELECT id FROM crm_customer_addresses
       WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL
       ORDER BY id ASC LIMIT 1`,
      [customerId, tenantId]
    );
    if (!rows[0]) return;
    await this.clearDefaultAddresses(tenantId, customerId);
    await writeDb.query(
      `UPDATE crm_customer_addresses SET is_default = 1
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [rows[0].id, tenantId]
    );
  },

  async createAddress(tenantId, customerId, data) {
    const existingCount = await this.countAddresses(tenantId, customerId);
    // Only the first address overall may be auto-promoted to default.
    // Additional addresses must stay non-default unless explicitly marked.
    let isDefault = data.is_default === true
      || data.is_default === 1
      || data.is_default === "1"
      || data.address_type === "default";
    if (!isDefault && existingCount === 0) {
      isDefault = true;
    }
    if (isDefault) {
      await this.clearDefaultAddresses(tenantId, customerId);
    }
    const addressType = isDefault && data.address_type !== "default"
      ? "default"
      : (data.address_type || "office");
    const [result] = await writeDb.query(
      `INSERT INTO crm_customer_addresses
         (address_type, address, city, state, postal_code, country, is_default, customer_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        addressType,
        data.address,
        data.city || null,
        data.state || null,
        data.postal_code || null,
        data.country || null,
        isDefault ? 1 : 0,
        customerId,
        tenantId,
      ]
    );
    const [rows] = await readDb.query(
      `SELECT * FROM crm_customer_addresses WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [result.insertId, tenantId]
    );
    return rows[0];
  },

  async updateAddress(tenantId, addressId, data) {
    const [addr] = await readDb.query(
      `SELECT customer_id FROM crm_customer_addresses WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [addressId, tenantId]
    );
    if (!addr[0]) return null;
    const customerId = addr[0].customer_id;

    let isDefault = data.is_default === true
      || data.is_default === 1
      || data.is_default === "1"
      || data.address_type === "default";
    const storedType = isDefault
      ? "default"
      : (data.address_type === "default" ? "office" : (data.address_type || "office"));

    if (isDefault) {
      await this.clearDefaultAddresses(tenantId, customerId, addressId);
    } else {
      const [[self]] = await readDb.query(
        `SELECT is_default FROM crm_customer_addresses WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [addressId, tenantId]
      );
      const raw = self?.is_default;
      const wasDefault = raw === true || raw === 1 || raw === "1"
        || (typeof Buffer !== "undefined" && Buffer.isBuffer(raw) && raw[0] === 1);
      if (wasDefault) {
        // Demoting this default: promote another address first so we never block the save.
        const [others] = await readDb.query(
          `SELECT id FROM crm_customer_addresses
           WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL AND id != ?
           ORDER BY id ASC LIMIT 1`,
          [customerId, tenantId, addressId]
        );
        if (others[0]) {
          await writeDb.query(
            `UPDATE crm_customer_addresses SET is_default = 1
             WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
            [others[0].id, tenantId]
          );
        } else {
          // Sole address must remain the default.
          isDefault = true;
        }
      }
    }

    await writeDb.query(
      `UPDATE crm_customer_addresses SET
         address_type = ?, address = ?, city = ?, state = ?, postal_code = ?, country = ?, is_default = ?
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [
        isDefault ? "default" : storedType,
        data.address,
        data.city || null,
        data.state || null,
        data.postal_code || null,
        data.country || null,
        isDefault ? 1 : 0,
        addressId,
        tenantId,
      ]
    );
    const [rows] = await readDb.query(
      `SELECT * FROM crm_customer_addresses WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [addressId, tenantId]
    );
    return rows[0] || null;
  },

  async deleteAddress(tenantId, addressId) {
    const [addr] = await readDb.query(
      `SELECT customer_id, is_default FROM crm_customer_addresses
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [addressId, tenantId]
    );
    if (!addr[0]) return false;
    const { customer_id: customerId, is_default: wasDefault } = addr[0];

    const [result] = await writeDb.query(
      `UPDATE crm_customer_addresses SET deleted_at = NOW()
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [addressId, tenantId]
    );
    if (result.affectedRows !== 1) return false;

    if (wasDefault) {
      await this.promoteDefaultAddress(tenantId, customerId);
    }
    return true;
  },

  // ── Notes ────────────────────────────────────────────────────────────────────
  async createNote(tenantId, userId, customerId, data) {
    const [rows] = await readDb.query(
      `SELECT note, customer_name FROM crm_customers
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [customerId, tenantId]
    );
    if (!rows[0]) return null;
    const label = data.note_type || "note";
    const entry = `[${label}] ${data.body.trim()}`;
    const note = rows[0].note ? `${rows[0].note}\n\n${entry}` : entry;
    await writeDb.query(
      `UPDATE crm_customers SET note = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [note, customerId, tenantId]
    );
    await logCrmActivity(tenantId, userId, "customer_note_added", `Note added to customer "${rows[0].customer_name}"`, {
      entity_type: "customer",
      entity_id: customerId,
    });
    const [users] = await readDb.query(
      `SELECT name FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [userId, tenantId]
    );
    return {
      id: customerId,
      note_type: label,
      body: data.body,
      user_name: users[0]?.name || null,
      created_at: new Date(),
    };
  },

  // ── Complaints ─────────────────────────────────────────────────────────────
  async listComplaints(tenantId) {
    const [rows] = await readDb.query(
      `SELECT cmp.*, c.customer_name, u.name AS created_by_name, au.name AS assigned_to_name
       FROM crm_customer_complaints cmp
       INNER JOIN crm_customers c ON c.id = cmp.customer_id AND ${joinOnTenant("cmp", "c")}
       LEFT JOIN users u ON u.id = cmp.user_id AND ${joinOnTenant("cmp", "u")}
       LEFT JOIN users au ON au.id = cmp.assigned_to AND ${joinOnTenant("cmp", "au")}
       WHERE ${tw("cmp", tenantId)}
       ORDER BY cmp.created_at DESC`,
      [tenantId]
    );
    return rows;
  },

  async getComplaint(tenantId, id) {
    const [rows] = await readDb.query(
      `SELECT cmp.*, c.customer_name, u.name AS created_by_name, au.name AS assigned_to_name
       FROM crm_customer_complaints cmp
       INNER JOIN crm_customers c ON c.id = cmp.customer_id AND ${joinOnTenant("cmp", "c")}
       LEFT JOIN users u ON u.id = cmp.user_id AND ${joinOnTenant("cmp", "u")}
       LEFT JOIN users au ON au.id = cmp.assigned_to AND ${joinOnTenant("cmp", "au")}
       WHERE cmp.id = ? AND ${tw("cmp", tenantId)} LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] || null;
  },

  async createComplaint(tenantId, userId, data) {
    const [result] = await writeDb.query(
      `INSERT INTO crm_customer_complaints
         (subject, description, status, priority, issue_type, customer_id, user_id, assigned_to, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.subject,
        data.description || null,
        data.status || "open",
        data.priority || "medium",
        data.issue_type || "complaint",
        data.customer_id,
        userId,
        data.assigned_to || null,
        tenantId,
      ]
    );
    const created = await this.getComplaint(tenantId, result.insertId);
    await logCrmActivity(tenantId, userId, "complaint_created", `Complaint "${data.subject}" created`, {
      entity_type: "complaint",
      entity_id: result.insertId,
      newValue: created,
    });
    return created;
  },

  async updateComplaint(tenantId, userId, id, data) {
    const before = await this.getComplaint(tenantId, id);
    await writeDb.query(
      `UPDATE crm_customer_complaints SET
         subject = ?, description = ?, status = ?, priority = ?, issue_type = ?,
         assigned_to = ?, resolution_note = ?,
         resolved_at = CASE
           WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at, NOW())
           ELSE NULL
         END
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [
        data.subject,
        data.description || null,
        data.status,
        data.priority,
        data.issue_type,
        data.assigned_to || null,
        data.resolution_note || null,
        data.status,
        id,
        tenantId,
      ]
    );
    const after = await this.getComplaint(tenantId, id);
    await logCrmActivity(tenantId, userId, "complaint_updated", `Complaint "${data.subject}" updated`, {
      entity_type: "complaint",
      entity_id: id,
      oldValue: before,
      newValue: after,
    });
    return after;
  },
};
