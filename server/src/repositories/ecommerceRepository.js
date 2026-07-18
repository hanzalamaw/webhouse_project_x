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
    auto_sync_enabled: row.auto_sync_enabled !== 0 && row.auto_sync_enabled !== false,
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
       WHERE id = ? AND tenant_id = ?`,
      [encryptedToken, storeName || shop, platform, grantedScopes || null, storeId, tenantId],
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

export async function getStoreById(id, tenantId) {
  if (tenantId == null) {
    throw new Error("tenantId required for store lookup");
  }
  const [rows] = await readDb.query(
    `SELECT * FROM ecom_store_connections WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [id, tenantId],
  );
  return mapStoreRow(rows[0]);
}

export async function disconnectStore(storeId, tenantId, { dataPolicy = "keep" } = {}) {
  await writeDb.query(
    `UPDATE ecom_store_connections
     SET status = 'disconnected', access_token = '', deleted_at = NOW(),
         disconnect_data_policy = ?
     WHERE id = ? AND tenant_id = ?`,
    [dataPolicy, storeId, tenantId],
  );
}

export async function updateErpImportStatus(storeId, tenantId, status) {
  await writeDb.query(
    `UPDATE ecom_store_connections SET erp_import_status = ? WHERE id = ? AND tenant_id = ?`,
    [status, storeId, tenantId],
  );
}

export async function updateAutoSyncEnabled(storeId, tenantId, enabled) {
  await writeDb.query(
    `UPDATE ecom_store_connections SET auto_sync_enabled = ? WHERE id = ? AND tenant_id = ?`,
    [enabled ? 1 : 0, storeId, tenantId],
  );
}

/** Connected Shopify stores with auto-sync enabled (for background polling). */
export async function listConnectedShopifyStoresForAutoSync() {
  const [rows] = await readDb.query(
    `SELECT * FROM ecom_store_connections
     WHERE platform = 'shopify' AND status = 'connected' AND deleted_at IS NULL
       AND auto_sync_enabled = 1
       AND access_token IS NOT NULL AND access_token != ''
     ORDER BY id ASC`,
  );
  return rows.map(mapStoreRow);
}

export async function softDeleteStoreSyncedData(storeId, tenantId) {
  const [synced] = await writeDb.query(
    `UPDATE ecom_synced_records SET deleted_at = NOW()
     WHERE store_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [storeId, tenantId],
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

export async function getEntityLinkByInternalId(tenantId, entityType, internalId, platform = "shopify") {
  const [rows] = await readDb.query(
    `SELECT el.store_id, el.external_id, el.platform, el.internal_id, el.entity_type,
            sc.store_name, sc.store_url
     FROM ecom_entity_links el
     INNER JOIN ecom_store_connections sc
       ON sc.id = el.store_id AND sc.status = 'connected' AND sc.deleted_at IS NULL
     WHERE el.tenant_id = ? AND el.entity_type = ? AND el.internal_id = ?
       AND el.platform = ? AND el.deleted_at IS NULL
     LIMIT 1`,
    [tenantId, entityType, internalId, platform],
  );
  return rows[0] || null;
}

export async function getLocationLink(storeId, shopifyLocationId) {
  const [rows] = await readDb.query(
    `SELECT * FROM ecom_location_links
     WHERE store_id = ? AND shopify_location_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [storeId, String(shopifyLocationId)],
  );
  return rows[0] || null;
}

export async function upsertLocationLink({
  tenantId,
  storeId,
  shopifyLocationId,
  locationName,
  warehouseId = null,
  outletId = null,
  active = true,
}) {
  await writeDb.query(
    `INSERT INTO ecom_location_links
       (tenant_id, store_id, shopify_location_id, location_name, warehouse_id, outlet_id, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       location_name = VALUES(location_name),
       warehouse_id = COALESCE(VALUES(warehouse_id), warehouse_id),
       outlet_id = COALESCE(VALUES(outlet_id), outlet_id),
       active = VALUES(active),
       deleted_at = NULL,
       updated_at = NOW()`,
    [
      tenantId,
      storeId,
      String(shopifyLocationId),
      locationName,
      warehouseId,
      outletId,
      active ? 1 : 0,
    ],
  );
}

export async function listLocationLinks(storeId) {
  const [rows] = await readDb.query(
    `SELECT shopify_location_id, location_name, warehouse_id, outlet_id, active
     FROM ecom_location_links
     WHERE store_id = ? AND deleted_at IS NULL
     ORDER BY location_name`,
    [storeId],
  );
  return rows;
}

export async function getWarehouseLocationLink(tenantId, warehouseId) {
  const [rows] = await readDb.query(
    `SELECT ll.*, sc.store_url, sc.id AS store_id
     FROM ecom_location_links ll
     INNER JOIN ecom_store_connections sc ON sc.id = ll.store_id AND sc.status = 'connected'
     WHERE ll.tenant_id = ? AND ll.warehouse_id = ? AND ll.deleted_at IS NULL
     LIMIT 1`,
    [tenantId, warehouseId],
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

export async function softDeleteEntityLinkByInternalId(tenantId, entityType, internalId, platform = "shopify") {
  const [result] = await writeDb.query(
    `UPDATE ecom_entity_links SET deleted_at = NOW()
     WHERE tenant_id = ? AND entity_type = ? AND internal_id = ? AND platform = ? AND deleted_at IS NULL`,
    [tenantId, entityType, internalId, platform],
  );
  return result.affectedRows || 0;
}

export async function schedulePendingShopifyDelete({
  tenantId,
  storeId,
  entityType,
  externalId,
  internalId,
  deleteAfter,
  phase1Action = null,
  note = null,
}) {
  await writeDb.query(
    `UPDATE ecom_pending_shopify_deletes
     SET deleted_at = NOW(), status = 'cancelled'
     WHERE store_id = ? AND entity_type = ? AND external_id = ?
       AND status IN ('pending', 'processing') AND deleted_at IS NULL`,
    [storeId, entityType, String(externalId)],
  );
  const [result] = await writeDb.query(
    `INSERT INTO ecom_pending_shopify_deletes
       (tenant_id, store_id, entity_type, external_id, internal_id, delete_after, status, phase1_action, note)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      tenantId,
      storeId,
      entityType,
      String(externalId),
      internalId,
      deleteAfter,
      phase1Action,
      note,
    ],
  );
  return result.insertId;
}

export async function listDuePendingShopifyDeletes(limit = 50) {
  const [rows] = await readDb.query(
    `SELECT id, tenant_id, store_id, entity_type, external_id, internal_id,
            delete_after, status, phase1_action, note
     FROM ecom_pending_shopify_deletes
     WHERE status = 'pending'
       AND delete_after <= NOW()
       AND deleted_at IS NULL
     ORDER BY delete_after ASC
     LIMIT ?`,
    [limit],
  );
  return rows;
}

export async function markPendingShopifyDeleteStatus(id, status, { lastError = null, completed = false } = {}) {
  if (completed) {
    await writeDb.query(
      `UPDATE ecom_pending_shopify_deletes
       SET status = ?, last_error = ?, completed_at = NOW()
       WHERE id = ?`,
      [status, lastError, id],
    );
    return;
  }
  if (status === "cancelled") {
    await writeDb.query(
      `UPDATE ecom_pending_shopify_deletes
       SET status = ?, last_error = ?, deleted_at = NOW()
       WHERE id = ?`,
      [status, lastError, id],
    );
    return;
  }
  await writeDb.query(
    `UPDATE ecom_pending_shopify_deletes
     SET status = ?, last_error = ?
     WHERE id = ?`,
    [status, lastError, id],
  );
}

export async function softDeleteLocationLinkByWarehouse(tenantId, warehouseId) {
  const [result] = await writeDb.query(
    `UPDATE ecom_location_links SET deleted_at = NOW(), active = 0
     WHERE tenant_id = ? AND warehouse_id = ? AND deleted_at IS NULL`,
    [tenantId, warehouseId],
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

export async function markSyncedRecordImported(storeId, tenantId, entityType, externalId) {
  await writeDb.query(
    `UPDATE ecom_synced_records
     SET import_status = 'imported'
     WHERE store_id = ? AND tenant_id = ? AND entity_type = ? AND external_id = ? AND deleted_at IS NULL`,
    [storeId, tenantId, entityType, String(externalId)],
  );
}

export async function getDisconnectPreview(storeId, tenantId) {
  const counts = await getEntityCounts(storeId, tenantId);
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
    deletedStaged = await softDeleteStoreSyncedData(storeId, tenantId);
    await softDeleteEntityLinksForStore(storeId);
  }

  await disconnectStore(storeId, tenantId, { dataPolicy });
  return { dataPolicy, deletedStaged, deletedErp };
}

export async function updateInitialSyncStatus(storeId, tenantId, status) {
  await writeDb.query(
    `UPDATE ecom_store_connections SET initial_sync_status = ? WHERE id = ? AND tenant_id = ?`,
    [status, storeId, tenantId],
  );
}

export async function markWebhooksRegistered(storeId, tenantId) {
  await writeDb.query(
    `UPDATE ecom_store_connections SET webhooks_registered = 1 WHERE id = ? AND tenant_id = ?`,
    [storeId, tenantId],
  );
}

export async function touchLastSynced(storeId, tenantId) {
  await writeDb.query(
    `UPDATE ecom_store_connections SET last_synced_at = NOW() WHERE id = ? AND tenant_id = ?`,
    [storeId, tenantId],
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
    const linked = await getEntityLink(storeId, "order", extId);
    if (!linked) {
      const [existing] = await readDb.query(
        `SELECT id, normalized_json FROM ecom_synced_records
         WHERE store_id = ? AND tenant_id = ? AND entity_type = ? AND external_id = ? AND deleted_at IS NULL`,
        [storeId, tenantId, entityType, extId],
      );

      if (existing.length && existing[0].normalized_json !== normalizedJson) {
        await writeDb.query(
          `UPDATE ecom_synced_records
           SET conflict_status = 'pending',
               pending_raw_json = ?,
               pending_normalized_json = ?,
               source = ?,
               updated_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [rawJson, normalizedJson, source, existing[0].id, tenantId],
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
    // Linked orders: always accept inbound updates so auto-sync can refresh the ERP copy.
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

export async function getPendingOrderConflicts(storeId, tenantId) {
  const [rows] = await readDb.query(
    `SELECT external_id, normalized_json, pending_normalized_json, updated_at
     FROM ecom_synced_records
     WHERE store_id = ? AND tenant_id = ? AND entity_type = 'order' AND conflict_status = 'pending' AND deleted_at IS NULL
     ORDER BY updated_at DESC`,
    [storeId, tenantId],
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

export async function countPendingOrderConflicts(storeId, tenantId) {
  const [rows] = await readDb.query(
    `SELECT COUNT(*) AS count FROM ecom_synced_records
     WHERE store_id = ? AND tenant_id = ? AND entity_type = 'order' AND conflict_status = 'pending' AND deleted_at IS NULL`,
    [storeId, tenantId],
  );
  return rows[0]?.count || 0;
}

export async function resolveOrderConflict(storeId, tenantId, externalId, action) {
  const [rows] = await readDb.query(
    `SELECT id, pending_raw_json, pending_normalized_json FROM ecom_synced_records
     WHERE store_id = ? AND tenant_id = ? AND entity_type = 'order' AND external_id = ? AND conflict_status = 'pending' AND deleted_at IS NULL`,
    [storeId, tenantId, String(externalId)],
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
       WHERE id = ? AND tenant_id = ?`,
      [rows[0].id, tenantId],
    );
  } else {
    await writeDb.query(
      `UPDATE ecom_synced_records
       SET conflict_status = 'none',
           pending_raw_json = NULL,
           pending_normalized_json = NULL,
           updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [rows[0].id, tenantId],
    );
  }
  return true;
}

export async function deleteSyncedRecord(storeId, tenantId, entityType, externalId) {
  await writeDb.query(
    `UPDATE ecom_synced_records
     SET deleted_at = NOW()
     WHERE store_id = ? AND tenant_id = ? AND entity_type = ? AND external_id = ? AND deleted_at IS NULL`,
    [storeId, tenantId, entityType, String(externalId)],
  );
}

export async function getSyncedRecords(storeId, tenantId, entityType, limit = 50, { importStatus = null } = {}) {
  const params = [storeId, tenantId, entityType];
  let sql = `SELECT external_id, raw_json, normalized_json, source, platform, import_status, updated_at
             FROM ecom_synced_records
             WHERE store_id = ? AND tenant_id = ? AND entity_type = ? AND deleted_at IS NULL`;
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

export async function getSyncedRecordByExternalId(storeId, tenantId, entityType, externalId) {
  const [rows] = await readDb.query(
    `SELECT external_id, raw_json, normalized_json, source, platform, import_status, updated_at
     FROM ecom_synced_records
     WHERE store_id = ? AND tenant_id = ? AND entity_type = ? AND external_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [storeId, tenantId, entityType, String(externalId)],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    externalId: r.external_id,
    raw: JSON.parse(r.raw_json),
    normalized: JSON.parse(r.normalized_json),
    syncEvent: r.source,
    platform: r.platform,
    importStatus: r.import_status,
    updatedAt: r.updated_at,
  };
}

export async function updateExternalOrderInternalId(storeId, externalOrderId, internalOrderId) {
  await writeDb.query(
    `UPDATE ecom_external_orders
     SET internal_order_id = ?, sync_status = 'imported'
     WHERE store_id = ? AND external_order_id = ? AND deleted_at IS NULL`,
    [internalOrderId, storeId, String(externalOrderId)],
  );
}

export async function getEntityCounts(storeId, tenantId) {
  const [rows] = await readDb.query(
    `SELECT entity_type, COUNT(*) AS count
     FROM ecom_synced_records
     WHERE store_id = ? AND tenant_id = ? AND deleted_at IS NULL
     GROUP BY entity_type`,
    [storeId, tenantId],
  );
  const counts = {
    order: 0,
    product: 0,
    customer: 0,
    location: 0,
    inventory: 0,
  };
  for (const row of rows) {
    const key = String(row.entity_type || "").trim();
    if (!key) continue;
    counts[key] = Number(row.count) || 0;
  }
  return counts;
}

/** Staged locations that are not yet mapped to an ERP warehouse. */
export async function countUnmappedLocationLinks(storeId) {
  const [[row]] = await readDb.query(
    `SELECT COUNT(*) AS count
     FROM ecom_location_links
     WHERE store_id = ? AND deleted_at IS NULL
       AND (warehouse_id IS NULL OR warehouse_id = 0)
       AND (active = 1 OR active IS NULL)`,
    [storeId],
  );
  return Number(row?.count) || 0;
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

/** Push-back log entries (ERP → store). `onlyFailed` limits to failed pushes. */
export async function getPushLogs(storeId, { limit = 150, onlyFailed = false } = {}) {
  const params = [storeId];
  let sql = `SELECT id, sync_type, external_id, status, message, synced_at
             FROM ecom_sync_logs
             WHERE store_id = ? AND deleted_at IS NULL AND sync_type LIKE 'erp_push:%'`;
  if (onlyFailed) sql += ` AND status = 'failed'`;
  sql += ` ORDER BY synced_at DESC LIMIT ?`;
  params.push(limit);
  const [rows] = await readDb.query(sql, params);
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
       (SELECT COUNT(*) FROM ecom_synced_records
         WHERE tenant_id = ? AND deleted_at IS NULL AND entity_type = 'location') AS synced_locations,
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
            c.erp_import_status, c.webhooks_registered, c.last_synced_at, c.created_at,
            (SELECT COUNT(*) FROM ecom_synced_records r
              WHERE r.store_id = c.id AND r.tenant_id = c.tenant_id AND r.entity_type = 'order' AND r.deleted_at IS NULL) AS order_count,
            (SELECT COUNT(*) FROM ecom_synced_records r
              WHERE r.store_id = c.id AND r.tenant_id = c.tenant_id AND r.entity_type = 'product' AND r.deleted_at IS NULL) AS product_count,
            (SELECT COUNT(*) FROM ecom_synced_records r
              WHERE r.store_id = c.id AND r.tenant_id = c.tenant_id AND r.entity_type = 'customer' AND r.deleted_at IS NULL) AS customer_count,
            (SELECT COUNT(*) FROM ecom_synced_records r
              WHERE r.store_id = c.id AND r.tenant_id = c.tenant_id AND r.entity_type = 'location' AND r.deleted_at IS NULL) AS location_count
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
            SUM(CASE WHEN r.entity_type = 'customer' THEN 1 ELSE 0 END) AS customers,
            SUM(CASE WHEN r.entity_type = 'location' THEN 1 ELSE 0 END) AS locations
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
