import { readDb } from "../database/db.js";
import { logTenantAudit } from "./tenantAudit.js";

let cachedCrmModuleId = null;

export async function getCrmModuleId() {
  if (cachedCrmModuleId) return cachedCrmModuleId;
  const [rows] = await readDb.query(
    `SELECT id FROM modules WHERE module_name = 'CRM' AND deleted_at IS NULL LIMIT 1`
  );
  cachedCrmModuleId = rows[0]?.id ?? null;
  return cachedCrmModuleId;
}

export async function logCrmActivity(tenantId, userId, action, summary, extra = {}) {
  const moduleId = await getCrmModuleId();
  const ctx = getAuditContext();
  await logTenantAudit({
    tenantId,
    userId,
    moduleId,
    action: `crm_${action}`,
    newValue: { summary, ...extra },
    skipIfImpersonated: false,
    impersonatedBy: ctx?.impersonatedBy ?? null,
    ipAddress: ctx?.ip ?? null,
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
