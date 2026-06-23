import { getPool } from "../database/db.js";
import { parseEntityId } from "./ids.js";

/** Tables with tenant_id — only these are touched when deleting one tenant. */
const TENANT_CHILD_TABLES = [
  "wh_tenant_modules",
  "wh_tenant_limits",
  "wh_tenant_subscriptions",
  "wh_tenant_payments",
  "wh_support_tickets",
  "organization_settings",
  "activity_alerts",
  "sessions",
  "audit_logs",
  "users",
  "roles",
];

async function scopedUpdate(connection, sql, params) {
  const [result] = await connection.execute(sql, params);
  return result.affectedRows ?? 0;
}

/** Soft-delete one tenant and its child rows only (deleted_at on matching tenant_id). */
export async function cascadeSoftDeleteTenant(rawTenantId) {
  const tenantId = parseEntityId(rawTenantId, "tenant id");
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [exists] = await connection.execute(
      `SELECT id FROM wh_tenants WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [tenantId]
    );
    if (!exists.length) {
      await connection.rollback();
      return false;
    }

    for (const table of TENANT_CHILD_TABLES) {
      await scopedUpdate(
        connection,
        `UPDATE \`${table}\` SET deleted_at = NOW()
         WHERE tenant_id = ? AND deleted_at IS NULL`,
        [tenantId]
      );
    }

    await scopedUpdate(
      connection,
      `UPDATE permissions
       SET deleted_at = NOW()
       WHERE deleted_at IS NULL
         AND role_id IN (
           SELECT id FROM roles WHERE tenant_id = ? AND deleted_at IS NULL
         )`,
      [tenantId]
    );

    const tenantRows = await scopedUpdate(
      connection,
      `UPDATE wh_tenants SET deleted_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [tenantId]
    );

    if (tenantRows !== 1) {
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

/** Soft-delete one subscription plan and its module links only. */
export async function cascadeSoftDeleteSubscriptionPlan(rawPlanId) {
  const planId = parseEntityId(rawPlanId, "plan id");
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [exists] = await connection.execute(
      `SELECT id FROM wh_subscription_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [planId]
    );
    if (!exists.length) {
      await connection.rollback();
      return false;
    }

    await scopedUpdate(
      connection,
      `UPDATE wh_subscription_module SET deleted_at = NOW()
       WHERE subscription_plan_id = ? AND deleted_at IS NULL`,
      [planId]
    );

    const planRows = await scopedUpdate(
      connection,
      `UPDATE wh_subscription_plans SET deleted_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [planId]
    );

    if (planRows !== 1) {
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

/** Soft-delete one module and junction rows that reference it only. */
export async function cascadeSoftDeleteModule(rawModuleId) {
  const moduleId = parseEntityId(rawModuleId, "module id");
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [exists] = await connection.execute(
      `SELECT id FROM modules WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [moduleId]
    );
    if (!exists.length) {
      await connection.rollback();
      return false;
    }

    await scopedUpdate(
      connection,
      `UPDATE wh_subscription_module SET deleted_at = NOW()
       WHERE module_id = ? AND deleted_at IS NULL`,
      [moduleId]
    );

    await scopedUpdate(
      connection,
      `UPDATE wh_tenant_modules SET deleted_at = NOW()
       WHERE module_id = ? AND deleted_at IS NULL`,
      [moduleId]
    );

    const moduleRows = await scopedUpdate(
      connection,
      `UPDATE modules SET deleted_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [moduleId]
    );

    if (moduleRows !== 1) {
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
