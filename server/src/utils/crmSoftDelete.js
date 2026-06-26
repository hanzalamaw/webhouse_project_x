import { getPool } from "../database/db.js";
import { parseEntityId } from "./ids.js";

const CRM_CHILD_TABLES = [
  "crm_customer_addresses",
  "crm_customer_complaints",
];

async function scopedUpdate(connection, sql, params) {
  const [result] = await connection.execute(sql, params);
  return result.affectedRows ?? 0;
}

/** Soft-delete one CRM customer and related child rows (deleted_at; hard purge after 7 days). */
export async function cascadeSoftDeleteCrmCustomer(rawCustomerId, tenantId) {
  const customerId = parseEntityId(rawCustomerId, "customer id");
  const tid = parseEntityId(tenantId, "tenant id");
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [exists] = await connection.execute(
      `SELECT id FROM crm_customers
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [customerId, tid]
    );
    if (!exists.length) {
      await connection.rollback();
      return false;
    }

    for (const table of CRM_CHILD_TABLES) {
      await scopedUpdate(
        connection,
        `UPDATE \`${table}\` SET deleted_at = NOW()
         WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [customerId, tid]
      );
    }

    const customerRows = await scopedUpdate(
      connection,
      `UPDATE crm_customers SET deleted_at = NOW()
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [customerId, tid]
    );

    if (customerRows !== 1) {
      await connection.rollback();
      return false;
    }

    await connection.commit();
    return true;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}

/** Soft-delete one lead. */
export async function cascadeSoftDeleteCrmLead(rawLeadId, tenantId) {
  const leadId = parseEntityId(rawLeadId, "lead id");
  const tid = parseEntityId(tenantId, "tenant id");
  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE crm_leads SET deleted_at = NOW()
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [leadId, tid]
  );
  return (result.affectedRows ?? 0) === 1;
}

/** Soft-delete one complaint. */
export async function cascadeSoftDeleteCrmComplaint(rawComplaintId, tenantId) {
  const complaintId = parseEntityId(rawComplaintId, "complaint id");
  const tid = parseEntityId(tenantId, "tenant id");
  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE crm_customer_complaints SET deleted_at = NOW()
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [complaintId, tid]
  );
  return (result.affectedRows ?? 0) === 1;
}
