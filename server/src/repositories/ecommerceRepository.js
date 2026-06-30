import { readDb, writeDb } from "../database/db.js";
import { encrypt, decrypt } from "../utils/cipher.js";

function mapStoreRow(row) {
  if (!row) return null;
  let accessToken = "";
  try {
    accessToken = row.access_token ? decrypt(row.access_token) : "";
  } catch {
    accessToken = row.access_token || "";
  }
  return {
    ...row,
    access_token: accessToken,
    initial_sync_status: row.initial_sync_status || "pending",
    erp_import_status: row.erp_import_status || "pending",
    webhooks_registered: Boolean(row.webhooks_registered),
  };
}

export async function upsertStoreConnection({
  tenantId,
  shop,
  accessToken,
  storeName,
  grantedScopes,
  platform = "shopify",
}) {
  const [existing] = await readDb.query(
    `SELECT id FROM ecom_store_connections
     WHERE store_url = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [shop, tenantId],
  );

  const encryptedToken = encrypt(accessToken);

  if (existing.length) {
    const storeId = existing[0].id;
    await writeDb.query(
      `UPDATE ecom_store_connections
       SET access_token = ?, store_name = ?, platform = ?, status = 'connected',
           initial_sync_status = 'pending', erp_import_status = 'pending',
           webhooks_registered = 0,
           granted_scopes = ?, deleted_at = NULL
       WHERE id = ?`,
      [encryptedToken, storeName || shop, platform, grantedScopes || null, storeId],
    );
    return storeId;
  }

  const [result] = await writeDb.query(
    `INSERT INTO ecom_store_connections
       (tenant_id, store_name, platform, store_url, access_token, status, initial_sync_status, granted_scopes)
     VALUES (?, ?, ?, ?, ?, 'connected', 'pending', ?)`,
    [tenantId, storeName || shop, platform, shop, encryptedToken, grantedScopes || null],
  );
  return result.insertId;
}

export async function getStoreByPlatform(tenantId, platform) {
  const [rows] = await readDb.query(
    `SELECT * FROM ecom_store_connections
     WHERE tenant_id = ? AND platform = ? AND deleted_at IS NULL AND status = 'connected'
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, platform],
  );
  return mapStoreRow(rows[0]);
}

export async function getStoreByShop(shop, tenantId = null) {
  const params = [shop];
  let sql = `SELECT * FROM ecom_store_connections WHERE store_url = ? AND deleted_at IS NULL`;
  if (tenantId != null) {
    sql += ` AND tenant_id = ?`;
    params.push(tenantId);
  }
  sql += ` ORDER BY created_at DESC LIMIT 1`;
  const [rows] = await readDb.query(sql, params);
  return mapStoreRow(rows[0]);
}

export async function getStoreById(id) {
  const [rows] = await readDb.query(
    `SELECT * FROM ecom_store_connections WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  return mapStoreRow(rows[0]);
}

export async function disconnectStore(storeId, { dataPolicy = "keep" } = {}) {
  await writeDb.query(
    `UPDATE ecom_store_connections
     SET status = 'disconnected', access_token = '', deleted_at = NOW(),
         disconnect_data_policy = ?
     WHERE id = ?`,
    [dataPolicy, storeId],
  );
}

export async function updateErpImportStatus(storeId, status) {
  await writeDb.query(
    `UPDATE ecom_store_connections SET erp_import_status = ? WHERE id = ?`,
    [status, storeId],
  );
}

export async function softDeleteStoreSyncedData(storeId) {
  const [synced] = await writeDb.query(
    `UPDATE ecom_synced_records SET deleted_at = NOW()
     WHERE store_id = ? AND deleted_at IS NULL`,
    [storeId],
  );
  await writeDb.query(
    `UPDATE ecom_sync_logs SET deleted_at = NOW()
     WHERE store_id = ? AND deleted_at IS NULL`,
    [storeId],
  );
  await writeDb.query(
    `UPDATE ecom_external_orders SET deleted_at = NOW()
     WHERE store_id = ? AND deleted_at IS NULL`,
    [storeId],
  );
  return synced.affectedRows || 0;
}

export async function getEntityLinksForStore(storeId, entityType = null) {
  const params = [storeId];
  let sql = `SELECT entity_type, external_id, internal_id, platform
             FROM ecom_entity_links
             WHERE store_id = ? AND deleted_at IS NULL`;
  if (entityType) {
    sql += ` AND entity_type = ?`;
    params.push(entityType);
  }
  const [rows] = await readDb.query(sql, params);
  return rows;
}

export async function getEntityLink(storeId, entityType, externalId) {
  const [rows] = await readDb.query(
    `SELECT id, internal_id, platform FROM ecom_entity_links
     WHERE store_id = ? AND entity_type = ? AND external_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [storeId, entityType, String(externalId)],
  );
  return rows[0] || null;
}

export async function upsertEntityLink({
  tenantId,
  storeId,
  platform,
  entityType,
  externalId,
  internalId,
}) {
  await writeDb.query(
    `INSERT INTO ecom_entity_links
       (tenant_id, store_id, platform, entity_type, external_id, internal_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       internal_id = VALUES(internal_id),
       platform = VALUES(platform),
       deleted_at = NULL`,
    [tenantId, storeId, platform, entityType, String(externalId), internalId],
  );
}

export async function softDeleteEntityLinksForStore(storeId) {
  const [result] = await writeDb.query(
    `UPDATE ecom_entity_links SET deleted_at = NOW()
     WHERE store_id = ? AND deleted_at IS NULL`,
    [storeId],
  );
  return result.affectedRows || 0;
}

export async function getLinkedInternalIds(storeId, entityType) {
  const [rows] = await readDb.query(
    `SELECT internal_id FROM ecom_entity_links
     WHERE store_id = ? AND entity_type = ? AND deleted_at IS NULL`,
    [storeId, entityType],
  );
  return rows.map((r) => r.internal_id);
}

export async function markSyncedRecordImported(storeId, entityType, externalId) {
  await writeDb.query(
    `UPDATE ecom_synced_records
     SET import_status = 'imported'
     WHERE store_id = ? AND entity_type = ? AND external_id = ? AND deleted_at IS NULL`,
    [storeId, entityType, String(externalId)],
  );
}

export async function getDisconnectPreview(storeId, tenantId) {
  const counts = await getEntityCounts(storeId);
  const links = await getEntityLinksForStore(storeId);
  const linked = {
    product: links.filter((l) => l.entity_type === "product").length,
    customer: links.filter((l) => l.entity_type === "customer").length,
    order: links.filter((l) => l.entity_type === "order").length,
  };
  const [logRows] = await readDb.query(
    `SELECT COUNT(*) AS count FROM ecom_sync_logs
     WHERE store_id = ? AND deleted_at IS NULL`,
    [storeId],
  );
  return {
    stagedRecords: counts,
    importedToErp: linked,
    syncLogEntries: logRows[0]?.count || 0,
  };
}

export async function disconnectStoreWithPolicy(storeId, tenantId, dataPolicy = "keep") {
  let deletedStaged = 0;
  const deletedErp = { products: 0, customers: 0, orders: 0 };

  if (dataPolicy === "delete_all") {
    const productIds = await getLinkedInternalIds(storeId, "product");
    const customerIds = await getLinkedInternalIds(storeId, "customer");
    const orderIds = await getLinkedInternalIds(storeId, "order");

    if (productIds.length) {
      const ph = productIds.map(() => "?").join(",");
      const [r] = await writeDb.query(
        `UPDATE inventory_products SET deleted_at = NOW()
         WHERE tenant_id = ? AND id IN (${ph}) AND source IN ('shopify', 'daraz') AND deleted_at IS NULL`,
        [tenantId, ...productIds],
      );
      deletedErp.products = r.affectedRows || 0;
    }
    if (customerIds.length) {
      const ph = customerIds.map(() => "?").join(",");
      const [r] = await writeDb.query(
        `UPDATE crm_customers SET deleted_at = NOW()
         WHERE tenant_id = ? AND id IN (${ph}) AND source IN ('shopify', 'daraz') AND deleted_at IS NULL`,
        [tenantId, ...customerIds],
      );
      deletedErp.customers = r.affectedRows || 0;
    }
    if (orderIds.length) {
      const ph = orderIds.map(() => "?").join(",");
      const [r] = await writeDb.query(
        `UPDATE orders SET deleted_at = NOW()
         WHERE tenant_id = ? AND id IN (${ph}) AND order_source IN ('shopify', 'daraz') AND deleted_at IS NULL`,
        [tenantId, ...orderIds],
      );
      deletedErp.orders = r.affectedRows || 0;
    }
  }

  if (dataPolicy === "delete_staged" || dataPolicy === "delete_all") {
    deletedStaged = await softDeleteStoreSyncedData(storeId);
    await softDeleteEntityLinksForStore(storeId);
  }

  await disconnectStore(storeId, { dataPolicy });
  return { dataPolicy, deletedStaged, deletedErp };
}

export async function updateInitialSyncStatus(storeId, status) {
  await writeDb.query(
    `UPDATE ecom_store_connections SET initial_sync_status = ? WHERE id = ?`,
    [status, storeId],
  );
}

export async function markWebhooksRegistered(storeId) {
  await writeDb.query(
    `UPDATE ecom_store_connections SET webhooks_registered = 1 WHERE id = ?`,
    [storeId],
  );
}

export async function touchLastSynced(storeId) {
  await writeDb.query(
    `UPDATE ecom_store_connections SET last_synced_at = NOW() WHERE id = ?`,
    [storeId],
  );
}

export async function addSyncLog(storeId, tenantId, { syncType, externalId, status, message }) {
  await writeDb.query(
    `INSERT INTO ecom_sync_logs (store_id, tenant_id, sync_type, external_id, status, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [storeId, tenantId, syncType, externalId || null, status, message || null],
  );
}

export async function upsertSyncedRecord(
  storeId,
  tenantId,
  entityType,
  externalId,
  raw,
  normalized,
  source,
  platform = "shopify",
) {
  const extId = String(externalId);
  const rawJson = JSON.stringify(raw);
  const normalizedJson = JSON.stringify(normalized);

  if (entityType === "order") {
    const [existing] = await readDb.query(
      `SELECT id, normalized_json FROM ecom_synced_records
       WHERE store_id = ? AND entity_type = ? AND external_id = ? AND deleted_at IS NULL`,
      [storeId, entityType, extId],
    );

    if (existing.length && existing[0].normalized_json !== normalizedJson) {
      await writeDb.query(
        `UPDATE ecom_synced_records
         SET conflict_status = 'pending',
             pending_raw_json = ?,
             pending_normalized_json = ?,
             source = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [rawJson, normalizedJson, source, existing[0].id],
      );
      await addSyncLog(storeId, tenantId, {
        syncType: "order_conflict",
        externalId: extId,
        status: "pending",
        message: "Order updated on marketplace — review keep or update",
      });
      return { conflict: true };
    }
  }

  const recordPlatform = platform || normalized?.platform || "shopify";

  await writeDb.query(
    `INSERT INTO ecom_synced_records
       (store_id, tenant_id, entity_type, external_id, raw_json, normalized_json, source,
        platform, import_status, conflict_status, pending_raw_json, pending_normalized_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'staged', 'none', NULL, NULL)
     ON DUPLICATE KEY UPDATE
       raw_json = VALUES(raw_json),
       normalized_json = VALUES(normalized_json),
       source = VALUES(source),
       platform = VALUES(platform),
       conflict_status = 'none',
       pending_raw_json = NULL,
       pending_normalized_json = NULL,
       updated_at = NOW(),
       deleted_at = NULL`,
    [storeId, tenantId, entityType, extId, rawJson, normalizedJson, source, recordPlatform],
  );

  if (entityType === "order") {
    const [storeRows] = await readDb.query(
      `SELECT store_name FROM ecom_store_connections WHERE id = ?`,
      [storeId],
    );
    const storeName = storeRows[0]?.store_name || null;
    await writeDb.query(
      `INSERT INTO ecom_external_orders
         (store_id, tenant_id, platform, external_order_id, store_name, sync_status)
       VALUES (?, ?, ?, ?, ?, 'synced')
       ON DUPLICATE KEY UPDATE sync_status = 'synced', deleted_at = NULL`,
      [storeId, tenantId, platform, extId, storeName],
    );
  }

  return { conflict: false };
}

export async function getPendingOrderConflicts(storeId) {
  const [rows] = await readDb.query(
    `SELECT external_id, normalized_json, pending_normalized_json, updated_at
     FROM ecom_synced_records
     WHERE store_id = ? AND entity_type = 'order' AND conflict_status = 'pending' AND deleted_at IS NULL
     ORDER BY updated_at DESC`,
    [storeId],
  );
  return rows.map((r) => {
    let current = null;
    let incoming = null;
    try {
      current = JSON.parse(r.normalized_json);
      incoming = JSON.parse(r.pending_normalized_json);
    } catch {
      /* ignore */
    }
    return {
      externalId: r.external_id,
      current,
      incoming,
      updatedAt: r.updated_at,
    };
  });
}

export async function countPendingOrderConflicts(storeId) {
  const [rows] = await readDb.query(
    `SELECT COUNT(*) AS count FROM ecom_synced_records
     WHERE store_id = ? AND entity_type = 'order' AND conflict_status = 'pending' AND deleted_at IS NULL`,
    [storeId],
  );
  return rows[0]?.count || 0;
}

export async function resolveOrderConflict(storeId, externalId, action) {
  const [rows] = await readDb.query(
    `SELECT id, pending_raw_json, pending_normalized_json FROM ecom_synced_records
     WHERE store_id = ? AND entity_type = 'order' AND external_id = ? AND conflict_status = 'pending' AND deleted_at IS NULL`,
    [storeId, String(externalId)],
  );
  if (!rows[0]) return false;

  if (action === "update") {
    await writeDb.query(
      `UPDATE ecom_synced_records
       SET raw_json = pending_raw_json,
           normalized_json = pending_normalized_json,
           conflict_status = 'none',
           pending_raw_json = NULL,
           pending_normalized_json = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [rows[0].id],
    );
  } else {
    await writeDb.query(
      `UPDATE ecom_synced_records
       SET conflict_status = 'none',
           pending_raw_json = NULL,
           pending_normalized_json = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [rows[0].id],
    );
  }
  return true;
}

export async function deleteSyncedRecord(storeId, entityType, externalId) {
  await writeDb.query(
    `UPDATE ecom_synced_records
     SET deleted_at = NOW()
     WHERE store_id = ? AND entity_type = ? AND external_id = ? AND deleted_at IS NULL`,
    [storeId, entityType, String(externalId)],
  );
}

export async function getSyncedRecords(storeId, entityType, limit = 50, { importStatus = null } = {}) {
  const params = [storeId, entityType];
  let sql = `SELECT external_id, raw_json, normalized_json, source, platform, import_status, updated_at
             FROM ecom_synced_records
             WHERE store_id = ? AND entity_type = ? AND deleted_at IS NULL`;
  if (importStatus) {
    sql += ` AND import_status = ?`;
    params.push(importStatus);
  }
  sql += ` ORDER BY updated_at DESC LIMIT ?`;
  params.push(limit);

  const [rows] = await readDb.query(sql, params);

  return rows.map((r) => ({
    externalId: r.external_id,
    raw: JSON.parse(r.raw_json),
    normalized: JSON.parse(r.normalized_json),
    syncEvent: r.source,
    platform: r.platform,
    importStatus: r.import_status,
    updatedAt: r.updated_at,
  }));
}

export async function updateExternalOrderInternalId(storeId, externalOrderId, internalOrderId) {
  await writeDb.query(
    `UPDATE ecom_external_orders
     SET internal_order_id = ?, sync_status = 'imported'
     WHERE store_id = ? AND external_order_id = ? AND deleted_at IS NULL`,
    [internalOrderId, storeId, String(externalOrderId)],
  );
}

export async function getEntityCounts(storeId) {
  const [rows] = await readDb.query(
    `SELECT entity_type, COUNT(*) AS count
     FROM ecom_synced_records
     WHERE store_id = ? AND deleted_at IS NULL
     GROUP BY entity_type`,
    [storeId],
  );
  return Object.fromEntries(rows.map((r) => [r.entity_type, r.count]));
}

export async function getSyncLogs(storeId, limit = 100) {
  const [rows] = await readDb.query(
    `SELECT sync_type, external_id, status, message, synced_at
     FROM ecom_sync_logs
     WHERE store_id = ? AND deleted_at IS NULL
     ORDER BY synced_at DESC
     LIMIT ?`,
    [storeId, limit],
  );
  return rows;
}

export async function dashboardStats(tenantId) {
  const [[stats]] = await readDb.query(
    `SELECT
       (SELECT COUNT(*) FROM ecom_store_connections
         WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'connected') AS connected_stores,
       (SELECT COUNT(*) FROM ecom_store_connections
         WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'connected' AND platform = 'shopify') AS shopify_stores,
       (SELECT COUNT(*) FROM ecom_store_connections
         WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'connected' AND platform = 'daraz') AS daraz_stores,
       (SELECT COUNT(*) FROM ecom_synced_records
         WHERE tenant_id = ? AND deleted_at IS NULL AND entity_type = 'order') AS synced_orders,
       (SELECT COUNT(*) FROM ecom_synced_records
         WHERE tenant_id = ? AND deleted_at IS NULL AND entity_type = 'product') AS synced_products,
       (SELECT COUNT(*) FROM ecom_synced_records
         WHERE tenant_id = ? AND deleted_at IS NULL AND entity_type = 'customer') AS synced_customers,
       (SELECT COUNT(*) FROM ecom_external_orders
         WHERE tenant_id = ? AND deleted_at IS NULL) AS external_orders,
       (SELECT COUNT(*) FROM ecom_sync_logs
         WHERE tenant_id = ? AND deleted_at IS NULL) AS total_sync_logs,
       (SELECT COUNT(*) FROM ecom_sync_logs
         WHERE tenant_id = ? AND deleted_at IS NULL
           AND synced_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS sync_logs_24h,
       (SELECT COUNT(*) FROM ecom_sync_logs
         WHERE tenant_id = ? AND deleted_at IS NULL AND status IN ('failed', 'partial')
           AND synced_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS failed_syncs_7d,
       (SELECT MAX(last_synced_at) FROM ecom_store_connections
         WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'connected') AS last_synced_at,
       (SELECT COUNT(*) FROM ecom_store_connections
         WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'connected' AND webhooks_registered = 1) AS webhooks_active`,
    Array(13).fill(tenantId),
  );
  return stats;
}

export async function dashboardStores(tenantId) {
  const [rows] = await readDb.query(
    `SELECT c.id, c.store_name, c.platform, c.store_url, c.status, c.initial_sync_status,
            c.webhooks_registered, c.last_synced_at, c.created_at,
            (SELECT COUNT(*) FROM ecom_synced_records r
              WHERE r.store_id = c.id AND r.entity_type = 'order' AND r.deleted_at IS NULL) AS order_count,
            (SELECT COUNT(*) FROM ecom_synced_records r
              WHERE r.store_id = c.id AND r.entity_type = 'product' AND r.deleted_at IS NULL) AS product_count,
            (SELECT COUNT(*) FROM ecom_synced_records r
              WHERE r.store_id = c.id AND r.entity_type = 'customer' AND r.deleted_at IS NULL) AS customer_count
     FROM ecom_store_connections c
     WHERE c.tenant_id = ? AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
    [tenantId],
  );
  return rows;
}

export async function dashboardRecentSyncLogs(tenantId, limit = 12) {
  const [rows] = await readDb.query(
    `SELECT l.sync_type, l.external_id, l.status, l.message, l.synced_at,
            c.store_name, c.platform
     FROM ecom_sync_logs l
     JOIN ecom_store_connections c ON c.id = l.store_id
     WHERE l.tenant_id = ? AND l.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY l.synced_at DESC
     LIMIT ?`,
    [tenantId, limit],
  );
  return rows;
}

export async function dashboardSyncByStatus(tenantId) {
  const [rows] = await readDb.query(
    `SELECT status, COUNT(*) AS count
     FROM ecom_sync_logs
     WHERE tenant_id = ? AND deleted_at IS NULL
       AND synced_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY status`,
    [tenantId],
  );
  return rows;
}

export async function dashboardEntityByPlatform(tenantId) {
  const [rows] = await readDb.query(
    `SELECT c.platform,
            SUM(CASE WHEN r.entity_type = 'order' THEN 1 ELSE 0 END) AS orders,
            SUM(CASE WHEN r.entity_type = 'product' THEN 1 ELSE 0 END) AS products,
            SUM(CASE WHEN r.entity_type = 'customer' THEN 1 ELSE 0 END) AS customers
     FROM ecom_synced_records r
     JOIN ecom_store_connections c ON c.id = r.store_id
     WHERE r.tenant_id = ? AND r.deleted_at IS NULL AND c.deleted_at IS NULL
     GROUP BY c.platform`,
    [tenantId],
  );
  return rows;
}

export async function dashboardSyncTrend(tenantId, days = 7) {
  const [rows] = await readDb.query(
    `SELECT DATE(synced_at) AS day_key,
            COUNT(*) AS total,
            SUM(CASE WHEN status IN ('success', 'completed') THEN 1 ELSE 0 END) AS success_count,
            SUM(CASE WHEN status IN ('failed', 'partial') THEN 1 ELSE 0 END) AS failed_count
     FROM ecom_sync_logs
     WHERE tenant_id = ? AND deleted_at IS NULL
       AND synced_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(synced_at)
     ORDER BY day_key ASC`,
    [tenantId, days - 1],
  );
  return rows;
}
