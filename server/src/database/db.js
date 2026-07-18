import { getTenantContext } from "../utils/tenantContext.js";
import {
  assertTenantScopedQuery,
  detectSqlOperation,
  extractTableNames,
  AUDITED_WRITE_TABLES,
} from "../utils/tenantScope.js";
import { logModuleWriteAudit } from "../utils/moduleWriteAudit.js";
import {
  fetchAuditRow,
  isSoftDeleteSql,
  resolveWriteRecordId,
} from "../utils/auditRowSnapshot.js";

/** @type {import("mysql2/promise").Pool | null} */
let pool = null;

/**
 * @typedef {{ skipTenantGuard?: boolean, skipWriteAudit?: boolean }} QueryOptions
 */

async function executeQuery(sql, params = [], options = {}) {
  if (!pool) throw new Error("Database pool not initialized");

  const ctx = getTenantContext();
  const enforced = Boolean(ctx && !ctx.crossTenant && ctx.tenantId);

  if (!options.skipTenantGuard) {
    assertTenantScopedQuery(sql, { enforced, operation: detectSqlOperation(sql) });
  }

  const shouldAudit = !options.skipWriteAudit && enforced && ctx?.tenantId;
  let preByTable = null;
  if (shouldAudit) {
    preByTable = await capturePreWriteSnapshots(sql, params, ctx).catch(() => null);
  }

  const [result, fields] = await pool.execute(sql, params);

  if (shouldAudit) {
    scheduleWriteAudit(sql, params, result, ctx, preByTable).catch(() => {});
  }

  return [result, fields];
}

/**
 * Snapshot rows before UPDATE/DELETE so audits can show previous values.
 * @param {string} sql
 * @param {unknown[]} params
 * @param {{ tenantId: number }} ctx
 */
async function capturePreWriteSnapshots(sql, params, ctx) {
  const op = detectSqlOperation(sql);
  if (op !== "UPDATE" && op !== "DELETE") return null;

  const tables = [...extractTableNames(sql)].filter((t) => AUDITED_WRITE_TABLES.has(t));
  if (!tables.length) return null;

  const recordId = resolveWriteRecordId(sql, params, null);
  if (!recordId) return null;

  const preByTable = {};
  for (const table of tables) {
    const row = await fetchAuditRow(pool, table, ctx.tenantId, recordId);
    if (row) preByTable[table] = row;
  }
  return preByTable;
}

/**
 * @param {string} sql
 * @param {unknown[]} params
 * @param {import("mysql2/promise").ResultSetHeader} result
 * @param {{ tenantId: number, userId: number | null }} ctx
 * @param {Record<string, object> | null} preByTable
 */
async function scheduleWriteAudit(sql, params, result, ctx, preByTable) {
  const op = detectSqlOperation(sql);
  if (!op || op === "SELECT") return;

  const tables = [...extractTableNames(sql)].filter((t) => AUDITED_WRITE_TABLES.has(t));
  if (!tables.length) return;

  const softDelete = isSoftDeleteSql(sql);
  let action = op.toLowerCase();
  if (softDelete) action = "delete";

  const recordId = resolveWriteRecordId(sql, params, result);

  for (const table of tables) {
    const oldRow = preByTable?.[table] || null;
    let newRow = null;
    if (action === "insert" || action === "update") {
      if (recordId) {
        newRow = await fetchAuditRow(pool, table, ctx.tenantId, recordId);
      }
    }

    await logModuleWriteAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action,
      table,
      recordId,
      oldRow,
      newRow,
    });
  }
}

export async function initDb(mysqlPool) {
  pool = mysqlPool;
}

export const readDb = {
  /**
   * @param {string} sql
   * @param {unknown[]} [params]
   * @param {QueryOptions} [options]
   */
  async query(sql, params = [], options = {}) {
    return executeQuery(sql, params, options);
  },
};

export const writeDb = {
  /**
   * @param {string} sql
   * @param {unknown[]} [params]
   * @param {QueryOptions} [options]
   */
  async query(sql, params = [], options = {}) {
    return executeQuery(sql, params, options);
  },
};

export function getPool() {
  return pool;
}

/**
 * Run callback with tenant guard disabled (migrations, purge jobs, WH cross-tenant ops).
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withoutTenantGuard(fn) {
  const { tenantContext } = await import("../utils/tenantContext.js");
  const parent = tenantContext.getStore();
  return tenantContext.run({ ...(parent || {}), crossTenant: true }, fn);
}
