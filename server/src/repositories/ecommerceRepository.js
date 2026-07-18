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
  await writeDb.query(
    `UPDATE ecom_location_links SET deleted_at = NOW(), active = 0
     WHERE store_id = ? AND deleted_at IS NULL`,
    [storeId],
  );
  try {
    await writeDb.query(
      `UPDATE ecom_pending_shopify_deletes
       SET status = 'cancelled', deleted_at = NOW()
       WHERE store_id = ? AND deleted_at IS NULL AND status IN ('pending', 'processing')`,
      [storeId],
    );
  } catch {
    // Table may not exist until migration 031.
  }
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
  platform = "shopify",
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
       (tenant_id, store_id, platform, entity_type, external_id, internal_id, delete_after, status, phase1_action, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      tenantId,
      storeId,
      platform || "shopify",
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
    `SELECT id, tenant_id, store_id, platform, entity_type, external_id, internal_id,
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

export async function getLinkedInternalIds(storeId, entityType, { includeSoftDeleted = false } = {}) {
  const deletedClause = includeSoftDeleted ? "" : " AND deleted_at IS NULL";
  const [rows] = await readDb.query(
    `SELECT internal_id FROM ecom_entity_links
     WHERE store_id = ? AND entity_type = ?${deletedClause}`,
    [storeId, entityType],
  );
  return [...new Set(rows.map((r) => Number(r.internal_id)).filter(Boolean))];
}

/**
 * Resolve ERP ids owned by this marketplace store for disconnect delete_all.
 * Only returns Shopify/Daraz-sourced records (never pure manual ERP data).
 */
export async function resolveStoreErpIdsForDisconnect(storeId, tenantId, platform = "shopify") {
  const prefix = String(platform || "shopify").toUpperCase();
  const productIds = new Set();
  const customerIds = new Set();
  const orderIds = new Set();
  const warehouseIds = new Set();
  const outletIds = new Set();

  // Products linked to this store AND sourced from this platform
  const [linkedProducts] = await readDb.query(
    `SELECT p.id
     FROM ecom_entity_links el
     INNER JOIN inventory_products p
       ON p.id = el.internal_id AND p.tenant_id = ?
     WHERE el.store_id = ? AND el.entity_type = 'product'
       AND p.source = ? AND p.deleted_at IS NULL`,
    [tenantId, storeId, platform],
  );
  for (const row of linkedProducts) productIds.add(Number(row.id));

  // Products from synced SKUs that are still marked as this platform
  const [prodSynced] = await readDb.query(
    `SELECT normalized_json FROM ecom_synced_records
     WHERE store_id = ? AND tenant_id = ? AND entity_type = 'product'`,
    [storeId, tenantId],
  );
  for (const row of prodSynced) {
    let n;
    try {
      n = JSON.parse(row.normalized_json);
    } catch {
      continue;
    }
    const sku = String(n?.sku || n?.variants?.[0]?.sku || "").trim();
    if (!sku) continue;
    const [hits] = await readDb.query(
      `SELECT p.id
       FROM inventory_product_variants v
       INNER JOIN inventory_products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id
       WHERE v.tenant_id = ? AND v.sku = ? AND v.deleted_at IS NULL AND p.deleted_at IS NULL
         AND p.source = ?
       LIMIT 5`,
      [tenantId, sku, platform],
    );
    for (const h of hits) productIds.add(Number(h.id));
  }

  // Customers: platform-sourced only (never delete pure manual CRM customers, even if email-matched).
  const [linkedCustomers] = await readDb.query(
    `SELECT c.id, c.source
     FROM ecom_entity_links el
     INNER JOIN crm_customers c ON c.id = el.internal_id AND c.tenant_id = ?
     WHERE el.store_id = ? AND el.entity_type = 'customer' AND c.deleted_at IS NULL`,
    [tenantId, storeId],
  );
  for (const row of linkedCustomers) {
    const source = String(row.source || "").toLowerCase().trim();
    // Store-linked customers: platform-sourced or blank source (legacy imports)
    if (source === platform || source === "" || source === "null") {
      customerIds.add(Number(row.id));
    }
  }

  // Customers with explicit platform source matching synced emails/phones from this store
  const [custSynced] = await readDb.query(
    `SELECT normalized_json FROM ecom_synced_records
     WHERE store_id = ? AND tenant_id = ? AND entity_type = 'customer'`,
    [storeId, tenantId],
  );
  for (const row of custSynced) {
    let n;
    try {
      n = JSON.parse(row.normalized_json);
    } catch {
      continue;
    }
    const phone = String(n?.phone || "").trim();
    const email = String(n?.email || "").trim().toLowerCase();
    if (phone) {
      const [hits] = await readDb.query(
        `SELECT id FROM crm_customers
         WHERE tenant_id = ? AND phone = ? AND deleted_at IS NULL AND source = ?
         LIMIT 5`,
        [tenantId, phone, platform],
      );
      for (const h of hits) customerIds.add(Number(h.id));
    }
    if (email) {
      const [hits] = await readDb.query(
        `SELECT id FROM crm_customers
         WHERE tenant_id = ? AND LOWER(email) = ? AND deleted_at IS NULL AND source = ?
         LIMIT 5`,
        [tenantId, email, platform],
      );
      for (const h of hits) customerIds.add(Number(h.id));
    }
  }

  // Orders: platform order_source only
  const [linkedOrders] = await readDb.query(
    `SELECT o.id
     FROM ecom_entity_links el
     INNER JOIN orders o ON o.id = el.internal_id AND o.tenant_id = ?
     WHERE el.store_id = ? AND el.entity_type = 'order'
       AND o.order_source = ? AND o.deleted_at IS NULL`,
    [tenantId, storeId, platform],
  );
  for (const row of linkedOrders) orderIds.add(Number(row.id));

  const [orderRows] = await readDb.query(
    `SELECT o.id
     FROM ecom_synced_records sr
     INNER JOIN orders o
       ON o.tenant_id = sr.tenant_id
      AND o.order_no = CONCAT(?, '-', sr.external_id)
      AND o.order_source = ?
     WHERE sr.store_id = ? AND sr.tenant_id = ? AND sr.entity_type = 'order'
       AND o.deleted_at IS NULL`,
    [prefix, platform, storeId, tenantId],
  );
  for (const row of orderRows) orderIds.add(Number(row.id));

  // Customers on this store's platform orders (covers guest/unnamed buyers with no entity link)
  const allOrderIds = [...orderIds].filter(Boolean);
  if (allOrderIds.length) {
    const ph = allOrderIds.map(() => "?").join(",");
    const [orderCustomers] = await readDb.query(
      `SELECT DISTINCT customer_id AS id
       FROM orders
       WHERE tenant_id = ? AND id IN (${ph}) AND deleted_at IS NULL
         AND order_source = ? AND customer_id IS NOT NULL`,
      [tenantId, ...allOrderIds, platform],
    );
    for (const row of orderCustomers) customerIds.add(Number(row.id));
  }

  // Also catch platform-sourced guests tied to this store's order_no pattern
  const [prefixCustomers] = await readDb.query(
    `SELECT DISTINCT o.customer_id AS id
     FROM orders o
     INNER JOIN crm_customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
     WHERE o.tenant_id = ? AND o.deleted_at IS NULL AND o.order_source = ?
       AND o.customer_id IS NOT NULL AND c.deleted_at IS NULL
       AND (c.source = ? OR c.source IS NULL OR c.source = '')
       AND o.order_no LIKE CONCAT(?, '-%')`,
    [tenantId, platform, platform, prefix],
  );
  for (const row of prefixCustomers) customerIds.add(Number(row.id));

  // Warehouses / outlets mapped for this store — only when they hold no live non-marketplace products
  // and are not mapped to another connected store.
  const [locLinks] = await readDb.query(
    `SELECT warehouse_id, outlet_id
     FROM ecom_location_links
     WHERE store_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [storeId, tenantId],
  );
  for (const link of locLinks) {
    const wid = Number(link.warehouse_id) || 0;
    const oid = Number(link.outlet_id) || 0;
    if (wid) {
      const [[otherStore]] = await readDb.query(
        `SELECT COUNT(*) AS c
         FROM ecom_location_links ll
         INNER JOIN ecom_store_connections sc
           ON sc.id = ll.store_id AND sc.deleted_at IS NULL AND sc.status = 'connected'
         WHERE ll.warehouse_id = ? AND ll.tenant_id = ? AND ll.store_id != ?
           AND ll.deleted_at IS NULL`,
        [wid, tenantId, storeId],
      );
      if (Number(otherStore?.c || 0) > 0) {
        // Shared across stores — leave warehouse in place.
      } else {
        const [[manualStock]] = await readDb.query(
          `SELECT COUNT(*) AS c
           FROM inventory_stock_levels sl
           INNER JOIN inventory_product_variants v
             ON v.id = sl.variant_id AND v.tenant_id = sl.tenant_id AND v.deleted_at IS NULL
           INNER JOIN inventory_products p
             ON p.id = v.product_id AND p.tenant_id = v.tenant_id AND p.deleted_at IS NULL
           WHERE sl.warehouse_id = ? AND sl.tenant_id = ? AND sl.deleted_at IS NULL
             AND LOWER(TRIM(COALESCE(NULLIF(p.source, ''), 'manual'))) NOT IN ('shopify', 'daraz')`,
          [wid, tenantId],
        );
        if (Number(manualStock?.c || 0) === 0) warehouseIds.add(wid);
      }
    }
    if (oid) {
      const [[otherOutlet]] = await readDb.query(
        `SELECT COUNT(*) AS c
         FROM ecom_location_links ll
         INNER JOIN ecom_store_connections sc
           ON sc.id = ll.store_id AND sc.deleted_at IS NULL AND sc.status = 'connected'
         WHERE ll.outlet_id = ? AND ll.tenant_id = ? AND ll.store_id != ?
           AND ll.deleted_at IS NULL`,
        [oid, tenantId, storeId],
      );
      if (Number(otherOutlet?.c || 0) === 0) outletIds.add(oid);
    }
  }

  return {
    productIds: [...productIds].filter(Boolean),
    customerIds: [...customerIds].filter(Boolean),
    orderIds: [...orderIds].filter(Boolean),
    warehouseIds: [...warehouseIds].filter(Boolean),
    outletIds: [...outletIds].filter(Boolean),
  };
}

export async function markSyncedRecordImported(storeId, tenantId, entityType, externalId) {
  await writeDb.query(
    `UPDATE ecom_synced_records
     SET import_status = 'imported'
     WHERE store_id = ? AND tenant_id = ? AND entity_type = ? AND external_id = ? AND deleted_at IS NULL`,
    [storeId, tenantId, entityType, String(externalId)],
  );
}

export async function getDisconnectPreview(storeId, tenantId, platform = "shopify") {
  const counts = await getEntityCounts(storeId, tenantId);
  const links = await getEntityLinksForStore(storeId);
  const linked = {
    product: links.filter((l) => l.entity_type === "product").length,
    customer: links.filter((l) => l.entity_type === "customer").length,
    order: links.filter((l) => l.entity_type === "order").length,
  };
  const resolved = await resolveStoreErpIdsForDisconnect(storeId, tenantId, platform);
  const [logRows] = await readDb.query(
    `SELECT COUNT(*) AS count FROM ecom_sync_logs
     WHERE store_id = ? AND deleted_at IS NULL`,
    [storeId],
  );
  return {
    stagedRecords: counts,
    importedToErp: linked,
    willDeleteFromErp: {
      product: resolved.productIds.length,
      customer: resolved.customerIds.length,
      order: resolved.orderIds.length,
      warehouse: resolved.warehouseIds.length,
      outlet: resolved.outletIds.length,
    },
    syncLogEntries: logRows[0]?.count || 0,
  };
}

export async function disconnectStoreWithPolicy(storeId, tenantId, dataPolicy = "keep", platform = "shopify") {
  let deletedStaged = 0;
  const deletedErp = { products: 0, customers: 0, orders: 0, warehouses: 0, outlets: 0 };

  if (dataPolicy === "delete_all") {
    const { productIds, customerIds, orderIds, warehouseIds, outletIds } =
      await resolveStoreErpIdsForDisconnect(storeId, tenantId, platform);

    if (productIds.length) {
      const ph = productIds.map(() => "?").join(",");
      const [r] = await writeDb.query(
        `UPDATE inventory_products SET deleted_at = NOW()
         WHERE tenant_id = ? AND id IN (${ph}) AND deleted_at IS NULL
           AND source = ?`,
        [tenantId, ...productIds, platform],
      );
      deletedErp.products = r.affectedRows || 0;
      // Soft-delete variants AND release SKUs so reconnect can re-import the same store SKUs.
      await writeDb.query(
        `UPDATE inventory_product_variants
         SET deleted_at = COALESCE(deleted_at, NOW()),
             sku = CONCAT('__deleted_', id)
         WHERE tenant_id = ? AND product_id IN (${ph})
           AND (deleted_at IS NULL OR sku NOT LIKE '__deleted_%')`,
        [tenantId, ...productIds],
      );
      // Soft-delete stock rows so warehouse/dashboard counts match Manage Products.
      await writeDb.query(
        `UPDATE inventory_stock_levels sl
         INNER JOIN inventory_product_variants v
           ON v.id = sl.variant_id AND v.tenant_id = sl.tenant_id
         SET sl.deleted_at = NOW()
         WHERE sl.tenant_id = ? AND v.product_id IN (${ph}) AND sl.deleted_at IS NULL`,
        [tenantId, ...productIds],
      );
    }
    if (customerIds.length) {
      const ph = customerIds.map(() => "?").join(",");
      // IDs are already store-scoped (links / synced / order guests). Do not re-filter by source
      // or unnamed guest buyers with odd/blank source can survive disconnect delete_all.
      const [r] = await writeDb.query(
        `UPDATE crm_customers SET deleted_at = NOW()
         WHERE tenant_id = ? AND id IN (${ph}) AND deleted_at IS NULL`,
        [tenantId, ...customerIds],
      );
      deletedErp.customers = r.affectedRows || 0;
      try {
        await writeDb.query(
          `UPDATE crm_customer_addresses SET deleted_at = NOW()
           WHERE tenant_id = ? AND customer_id IN (${ph}) AND deleted_at IS NULL`,
          [tenantId, ...customerIds],
        );
      } catch {
        // ignore
      }
    }
    if (orderIds.length) {
      const ph = orderIds.map(() => "?").join(",");
      const [r] = await writeDb.query(
        `UPDATE orders SET deleted_at = NOW()
         WHERE tenant_id = ? AND id IN (${ph}) AND deleted_at IS NULL
           AND order_source = ?`,
        [tenantId, ...orderIds, platform],
      );
      deletedErp.orders = r.affectedRows || 0;
      for (const table of [
        "order_items",
        "order_payments",
        "order_assignments",
        "order_cancellations",
        "order_returns",
        "order_exchanges",
        "order_refunds",
      ]) {
        try {
          await writeDb.query(
            `UPDATE \`${table}\` SET deleted_at = NOW()
             WHERE tenant_id = ? AND order_id IN (${ph}) AND deleted_at IS NULL`,
            [tenantId, ...orderIds],
          );
        } catch {
          // Table may not have deleted_at
        }
      }
    }
    if (warehouseIds.length) {
      const ph = warehouseIds.map(() => "?").join(",");
      await writeDb.query(
        `UPDATE inventory_stock_levels SET deleted_at = NOW()
         WHERE tenant_id = ? AND warehouse_id IN (${ph}) AND deleted_at IS NULL`,
        [tenantId, ...warehouseIds],
      );
      const [r] = await writeDb.query(
        `UPDATE inventory_warehouses SET deleted_at = NOW()
         WHERE tenant_id = ? AND id IN (${ph}) AND deleted_at IS NULL`,
        [tenantId, ...warehouseIds],
      );
      deletedErp.warehouses = r.affectedRows || 0;
    }
    if (outletIds.length) {
      const ph = outletIds.map(() => "?").join(",");
      const [r] = await writeDb.query(
        `UPDATE pos_outlets SET deleted_at = NOW()
         WHERE tenant_id = ? AND id IN (${ph}) AND deleted_at IS NULL`,
        [tenantId, ...outletIds],
      );
      deletedErp.outlets = r.affectedRows || 0;
    }

    // Clean orphan stock left behind by earlier product soft-deletes (warehouse vs Manage Products mismatch).
    await writeDb.query(
      `UPDATE inventory_stock_levels sl
       INNER JOIN inventory_product_variants v
         ON v.id = sl.variant_id AND v.tenant_id = sl.tenant_id
       INNER JOIN inventory_products p
         ON p.id = v.product_id AND p.tenant_id = v.tenant_id
       SET sl.deleted_at = NOW()
       WHERE sl.tenant_id = ? AND sl.deleted_at IS NULL
         AND (p.deleted_at IS NOT NULL OR v.deleted_at IS NOT NULL)
         AND LOWER(TRIM(COALESCE(p.source, ''))) = ?`,
      [tenantId, platform],
    );
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
       -- Soft-deleted rows (e.g. after disconnect) must re-enter the import queue.
       import_status = IF(deleted_at IS NOT NULL, 'staged', import_status),
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

/**
 * Staged rows, plus "imported" rows whose ERP copy is missing/soft-deleted
 * (so reconnect / partial deletes can catch up to fetched counts).
 */
export async function getSyncedRecordsNeedingImport(storeId, tenantId, entityType, limit = 5000) {
  const liveExistsSql = {
    order: `(
         EXISTS (
           SELECT 1 FROM ecom_entity_links el
           INNER JOIN orders o
             ON o.id = el.internal_id AND o.tenant_id = sr.tenant_id AND o.deleted_at IS NULL
           WHERE el.store_id = sr.store_id AND el.entity_type = 'order'
             AND el.external_id = sr.external_id AND el.deleted_at IS NULL
         )
         OR EXISTS (
           SELECT 1 FROM orders o
           WHERE o.tenant_id = sr.tenant_id AND o.deleted_at IS NULL
             AND o.order_no = CONCAT(UPPER(COALESCE(NULLIF(sr.platform, ''), 'shopify')), '-', sr.external_id)
         )
       )`,
    product: `(
         EXISTS (
           SELECT 1 FROM ecom_entity_links el
           INNER JOIN inventory_products p
             ON p.id = el.internal_id AND p.tenant_id = sr.tenant_id AND p.deleted_at IS NULL
           WHERE el.store_id = sr.store_id AND el.entity_type = 'product'
             AND el.external_id = sr.external_id AND el.deleted_at IS NULL
         )
       )`,
    customer: `(
         EXISTS (
           SELECT 1 FROM ecom_entity_links el
           INNER JOIN crm_customers c
             ON c.id = el.internal_id AND c.tenant_id = sr.tenant_id AND c.deleted_at IS NULL
           WHERE el.store_id = sr.store_id AND el.entity_type = 'customer'
             AND el.external_id = sr.external_id AND el.deleted_at IS NULL
         )
       )`,
  }[entityType];

  if (!liveExistsSql) {
    return getSyncedRecords(storeId, tenantId, entityType, limit, { importStatus: "staged" });
  }

  const [rows] = await readDb.query(
    `SELECT external_id, raw_json, normalized_json, source, platform, import_status, updated_at
     FROM ecom_synced_records sr
     WHERE sr.store_id = ? AND sr.tenant_id = ? AND sr.entity_type = ? AND sr.deleted_at IS NULL
       AND (
         sr.import_status = 'staged'
         OR (sr.import_status = 'imported' AND NOT ${liveExistsSql})
       )
     ORDER BY sr.updated_at DESC
     LIMIT ?`,
    [storeId, tenantId, entityType, limit],
  );

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

export async function getSyncLogs(storeId, limit = 100, { onlyFailed = false, syncTypePrefix = null } = {}) {
  const params = [storeId];
  let sql = `SELECT sync_type, external_id, status, message, synced_at
             FROM ecom_sync_logs
             WHERE store_id = ? AND deleted_at IS NULL`;
  if (onlyFailed) sql += ` AND status IN ('failed', 'skipped', 'partial')`;
  if (syncTypePrefix) {
    sql += ` AND sync_type LIKE ?`;
    params.push(`${syncTypePrefix}%`);
  }
  sql += ` ORDER BY synced_at DESC LIMIT ?`;
  params.push(limit);
  const [rows] = await readDb.query(sql, params);
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
