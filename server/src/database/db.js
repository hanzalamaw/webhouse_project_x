import { getTenantContext } from "../utils/tenantContext.js";
import {
  assertTenantScopedQuery,
  detectSqlOperation,
  extractTableNames,
  AUDITED_WRITE_TABLES,
} from "../utils/tenantScope.js";
import { logModuleWriteAudit } from "../utils/moduleWriteAudit.js";

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

  const [result, fields] = await pool.execute(sql, params);

  if (!options.skipWriteAudit && enforced && ctx?.tenantId) {
    scheduleWriteAudit(sql, result, ctx).catch(() => {});
  }

  return [result, fields];
}

/**
 * @param {string} sql
 * @param {import("mysql2/promise").ResultSetHeader} result
 * @param {{ tenantId: number, userId: number | null }} ctx
 */
async function scheduleWriteAudit(sql, result, ctx) {
  const op = detectSqlOperation(sql);
  if (!op || op === "SELECT") return;

  const tables = extractTableNames(sql);
  const audited = [...tables].filter((t) => AUDITED_WRITE_TABLES.has(t));
  if (!audited.length) return;

  let recordId = null;
  if (op === "INSERT" && result.insertId) {
    recordId = result.insertId;
  }

  for (const table of audited) {
    await logModuleWriteAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: op.toLowerCase(),
      table,
      recordId,
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
