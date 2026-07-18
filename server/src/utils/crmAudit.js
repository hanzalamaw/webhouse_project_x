import { readDb } from "../database/db.js";
import { logTenantAudit } from "./tenantAudit.js";
import { getAuditContext } from "./auditContext.js";
import { sanitizeAuditRow } from "./auditRowSnapshot.js";

let cachedCrmModuleId = null;

export async function getCrmModuleId() {
  if (cachedCrmModuleId) return cachedCrmModuleId;
  const [rows] = await readDb.query(
    `SELECT id FROM modules WHERE module_name = 'CRM' AND deleted_at IS NULL LIMIT 1`
  );
  cachedCrmModuleId = rows[0]?.id ?? null;
  return cachedCrmModuleId;
}

/**
 * CRM activity → tenant audit (redirects to WH when impersonating).
 * Pass full entity snapshots via oldValue/newValue for useful DiffViewer output.
 */
export async function logCrmActivity(tenantId, userId, action, summary, extra = {}) {
  if (userId == null || userId === "") return;
  const moduleId = await getCrmModuleId();
  const ctx = getAuditContext();
  const { oldValue, newValue, entity_type, entity_id, ...rest } = extra;

  const meta = {
    summary,
    ...(entity_type != null ? { entity_type } : {}),
    ...(entity_id != null ? { entity_id } : {}),
    ...rest,
  };

  const cleanOld = oldValue ? sanitizeAuditRow(oldValue) : null;
  let resolvedNew;
  if (newValue === null) {
    // Explicit delete: keep summary only so DiffViewer shows "Values deleted"
    resolvedNew = { summary, entity_type, entity_id };
  } else if (newValue && typeof newValue === "object") {
    resolvedNew = { ...meta, ...sanitizeAuditRow(newValue) };
  } else {
    resolvedNew = meta;
  }

  await logTenantAudit({
    tenantId,
    userId,
    moduleId,
    action: `crm_${action}`,
    oldValue: cleanOld,
    newValue: resolvedNew,
    skipIfImpersonated: true,
    impersonatedBy: ctx?.impersonatedBy ?? null,
    ipAddress: ctx?.ipAddress ?? ctx?.ip ?? null,
    deviceInfo: ctx?.deviceInfo ?? null,
  });
}

export function mapAuditRow(row) {
  let payload = row.new_value;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  return {
    id: row.id,
    action: row.action,
    summary: payload?.summary || row.action,
    entity_type: payload?.entity_type || null,
    entity_id: payload?.entity_id ?? null,
    created_at: row.created_at,
    user_name: row.user_name || null,
  };
}
