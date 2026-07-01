import { getPool } from "../database/db.js";
import { parseEntityId } from "./ids.js";

const ORDER_CHILD_TABLES = [
  "order_items",
  "order_assignments",
  "order_payments",
  "order_cancellations",
  "order_returns",
  "order_exchanges",
  "order_refunds",
];

async function scopedUpdate(connection, sql, params) {
  const [result] = await connection.execute(sql, params);
  return result.affectedRows ?? 0;
}

/** Soft-delete one order and related child rows. */
export async function cascadeSoftDeleteOrder(rawOrderId, tenantId) {
  const orderId = parseEntityId(rawOrderId, "order id");
  const tid = parseEntityId(tenantId, "tenant id");
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [exists] = await connection.execute(
      `SELECT id FROM orders
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [orderId, tid]
    );
    if (!exists.length) {
      await connection.rollback();
      return false;
    }

    for (const table of ORDER_CHILD_TABLES) {
      await scopedUpdate(
        connection,
        `UPDATE \`${table}\` SET deleted_at = NOW()
         WHERE order_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [orderId, tid]
      );
    }

    const orderRows = await scopedUpdate(
      connection,
      `UPDATE orders SET deleted_at = NOW()
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [orderId, tid]
    );

    if (orderRows !== 1) {
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
