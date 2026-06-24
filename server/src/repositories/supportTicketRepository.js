import { readDb, writeDb } from "../database/db.js";

export const supportTicketRepository = {
  async findAll({ limit, offset, status, tenantId }) {
    const clauses = ["st.deleted_at IS NULL"];
    const params = [];
    if (status) {
      clauses.push("st.status = ?");
      params.push(status);
    }
    if (tenantId) {
      clauses.push("st.tenant_id = ?");
      params.push(tenantId);
    }
    const where = clauses.join(" AND ");
    const [rows] = await readDb.query(
      `SELECT st.id, st.subject, st.description, st.status, st.created_at, st.resolved_at, st.tenant_id,
              t.company_name
       FROM wh_support_tickets st
       INNER JOIN wh_tenants t ON t.id = st.tenant_id AND t.deleted_at IS NULL
       WHERE ${where}
       ORDER BY st.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM wh_support_tickets st WHERE ${where}`,
      params
    );
    return { rows, total };
  },

  async findById(id) {
    const [rows] = await readDb.query(
      `SELECT st.*, t.company_name
       FROM wh_support_tickets st
       INNER JOIN wh_tenants t ON t.id = st.tenant_id AND t.deleted_at IS NULL
       WHERE st.id = ? AND st.deleted_at IS NULL LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async create({ subject, description, status, tenantId }) {
    const [result] = await writeDb.query(
      `INSERT INTO wh_support_tickets (subject, description, status, tenant_id)
       VALUES (?, ?, ?, ?)`,
      [subject, description, status || "open", tenantId]
    );
    return result.insertId;
  },

  async update(id, { subject, description, status }) {
    const resolvedAt = status === "resolved" ? new Date() : null;
    await writeDb.query(
      `UPDATE wh_support_tickets
       SET subject = ?, description = ?, status = ?,
           resolved_at = CASE WHEN ? = 'resolved' THEN COALESCE(resolved_at, NOW()) ELSE NULL END
       WHERE id = ? AND deleted_at IS NULL`,
      [subject, description, status, status, id]
    );
  },

  async softDelete(id) {
    const [result] = await writeDb.query(
      `UPDATE wh_support_tickets SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return result.affectedRows > 0;
  },
};
