/** Fields never stored in audit payloads. */
const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "encrypted_password",
  "access_token",
  "refresh_token",
  "api_secret",
  "api_key",
  "token",
  "reset_token",
  "secret",
]);

/**
 * Index of the `?` bound to `id = ?` / `alias.id = ?` in SQL, or null.
 * @param {string} sql
 * @returns {number | null}
 */
export function paramIndexForIdEquals(sql) {
  const normalized = String(sql || "").replace(/`/g, "");
  const match = normalized.match(/\b(?:\w+\.)?id\s*=\s*\?/i);
  if (!match) return null;
  const qPos = match.index + match[0].indexOf("?");
  const before = normalized.slice(0, qPos);
  return (before.match(/\?/g) || []).length;
}

export function isSoftDeleteSql(sql) {
  const s = String(sql || "");
  return /^\s*UPDATE\b/i.test(s) && /\bdeleted_at\s*=\s*(NOW\(\)|CURRENT_TIMESTAMP|\?)/i.test(s);
}

export function sanitizeAuditRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (Buffer.isBuffer(value)) {
      continue;
    } else if (typeof value === "bigint") {
      out[key] = Number(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Best-effort record id from write result / SQL params.
 * @param {string} sql
 * @param {unknown[]} params
 * @param {{ insertId?: number } | null} result
 */
export function resolveWriteRecordId(sql, params, result) {
  if (result?.insertId) return Number(result.insertId);
  const idx = paramIndexForIdEquals(sql);
  if (idx == null || !Array.isArray(params) || params[idx] == null) return null;
  const n = Number(params[idx]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Load one row by id for audit (includes soft-deleted rows).
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} table
 * @param {number} tenantId
 * @param {number} recordId
 */
export async function fetchAuditRow(pool, table, tenantId, recordId) {
  if (!pool || !table || !tenantId || !recordId) return null;
  // Table names come from our AUDITED_WRITE_TABLES whitelist only.
  const [rows] = await pool.execute(
    `SELECT * FROM \`${table}\` WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [recordId, tenantId],
  );
  return rows?.[0] ? sanitizeAuditRow(rows[0]) : null;
}

export function tableLabel(table) {
  return String(table || "")
    .replace(/^(inventory_|finance_|pos_|crm_|order_)/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildWriteAuditSummary(action, table, row) {
  const label = tableLabel(table);
  const name =
    row?.warehouse_name
    || row?.product_name
    || row?.outlet_name
    || row?.customer_name
    || row?.lead_name
    || row?.order_no
    || row?.category_name
    || row?.account_name
    || row?.subject
    || null;
  const suffix = name ? ` "${name}"` : row?.id != null ? ` #${row.id}` : "";
  if (action === "insert") return `${label}${suffix} created`;
  if (action === "delete") return `${label}${suffix} deleted`;
  return `${label}${suffix} updated`;
}
