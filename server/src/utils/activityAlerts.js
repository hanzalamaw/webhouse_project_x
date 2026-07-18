import { writeDb, readDb } from "../database/db.js";
import { getAuditContext } from "./auditContext.js";

const IMPORTANT_TYPES = new Set([
  "failed_login",
  "role_change",
  "permission_change",
  "user_deactivated",
  "record_deleted",
  "large_export",
  "ecom_duplicate",
]);

export async function createActivityAlert({
  tenantId,
  userId = null,
  alertType,
  title,
  message,
  priority = "medium",
  ipAddress = null,
  deviceInfo = null,
  meta = null,
  dedupeKey = null,
}) {
  if (!IMPORTANT_TYPES.has(alertType)) return null;
  const ctx = getAuditContext();
  // Impersonation actions belong in WH logs only — never alert the tenant.
  if (ctx?.impersonatedBy) return null;
  const resolvedIp = ipAddress ?? ctx?.ipAddress ?? ctx?.ip ?? null;
  const resolvedDevice = deviceInfo ?? ctx?.deviceInfo ?? null;
  const metaJson = meta != null ? JSON.stringify(meta) : null;

  if (dedupeKey) {
    const [existing] = await readDb.query(
      `SELECT id FROM activity_alerts
       WHERE tenant_id = ? AND alert_type = ? AND dedupe_key = ?
         AND is_read = 0 AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [tenantId, alertType, String(dedupeKey).slice(0, 191)],
    );
    if (existing[0]?.id) {
      await writeDb.query(
        `UPDATE activity_alerts
         SET title = ?, message = ?, meta_json = ?, priority = ?
         WHERE id = ? AND tenant_id = ?`,
        [title, message, metaJson, priority, existing[0].id, tenantId],
      );
      return existing[0].id;
    }
  }

  let actorId = userId;
  if (actorId == null) {
    const [users] = await readDb.query(
      `SELECT id FROM users WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
      [tenantId],
    );
    actorId = users[0]?.id ?? null;
  }
  if (actorId == null) return null;

  const [result] = await writeDb.query(
    `INSERT INTO activity_alerts
       (alert_type, title, message, ip_address, device_info, meta_json, dedupe_key, priority, is_read, user_id, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      alertType,
      title,
      message,
      resolvedIp,
      resolvedDevice,
      metaJson,
      dedupeKey ? String(dedupeKey).slice(0, 191) : null,
      priority,
      actorId,
      tenantId,
    ],
  );
  return result.insertId || null;
}

/**
 * When continuous sync finds a duplicate ERP match, queue an Admin Activity Alert
 * so the tenant can choose Keep ERP vs Keep Shopify/Daraz.
 */
export async function createEcomDuplicateAlert({
  tenantId,
  userId = null,
  platform,
  storeId,
  entityType,
  externalId,
  existingId = null,
  name = null,
  sku = null,
  reason = null,
}) {
  const platformLabel = platform === "daraz" ? "Daraz" : platform === "shopify" ? "Shopify" : String(platform || "store");
  const entityLabel = entityType === "customer"
    ? "customer"
    : entityType === "order"
      ? "order"
      : "product";
  const label = name || sku || externalId || entityLabel;
  const dedupeKey = `${platform}:${storeId}:${entityType}:${externalId}`;
  return createActivityAlert({
    tenantId,
    userId,
    alertType: "ecom_duplicate",
    title: `Duplicate ${entityLabel}: choose ERP or ${platformLabel}`,
    message:
      `${platformLabel} synced “${label}” but it already exists in ERP. `
      + `Open this alert and keep either ERP or ${platformLabel} data.`
      + (reason ? ` ${reason}` : ""),
    priority: "high",
    meta: {
      kind: "ecom_duplicate",
      platform,
      storeId,
      entityType,
      externalId: String(externalId),
      existingId: existingId != null ? Number(existingId) : null,
      name: name || null,
      sku: sku || null,
    },
    dedupeKey,
  });
}
