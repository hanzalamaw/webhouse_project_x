import {
  normalizeShopifyOrder,
  normalizeShopifyProduct,
  normalizeShopifyCustomer,
  normalizeShopifyLocation,
} from "../../normalizers/shopify.js";
import axios from "axios";
import { shopifyClient } from "./shopifyClient.js";
import { getShopifyConfig, WEBHOOK_TOPICS, toShopifyWebhookTopic } from "./shopifyConfig.js";
import { formatShopifyError } from "./shopifyErrors.js";
import { verifyStoreApiAccess, canRegisterWebhookTopic } from "./shopifyAccess.js";
import { topicToEntityType } from "./shopifyWebhooks.js";
import {
  addSyncLog,
  upsertSyncedRecord,
  deleteSyncedRecord,
  updateInitialSyncStatus,
  markWebhooksRegistered,
  touchLastSynced,
  getStoreById,
  getEntityLink,
  softDeleteEntityLinkByInternalId,
} from "../../repositories/ecommerceRepository.js";
import { autoSyncEntityToErp, autoImportAllStaged } from "./ecomAutoSync.js";
import { syncInventoryLevelToErp } from "./ecomImport.js";
import { importShopifyLocation, isMappableShopifyLocation } from "./locationSync.js";
import { inventoryRepository } from "../../repositories/inventoryRepository.js";

const runningSyncs = new Set();

function normalizeEntity(entityType, raw) {
  if (entityType === "order") return normalizeShopifyOrder(raw);
  if (entityType === "product") return normalizeShopifyProduct(raw);
  if (entityType === "customer") return normalizeShopifyCustomer(raw);
  if (entityType === "inventory") {
    return {
      erpInventoryId: `shopify:inv:${raw.inventory_item_id}:${raw.location_id}`,
      externalId: `${raw.inventory_item_id}-${raw.location_id}`,
      platform: "shopify",
      inventoryItemId: raw.inventory_item_id,
      locationId: raw.location_id,
      available: raw.available,
      updatedAt: raw.updated_at || null,
    };
  }
  if (entityType === "location") return normalizeShopifyLocation(raw);
  return raw;
}

export async function persistEntity(storeId, tenantId, entityType, raw, source) {
  if (!raw?.id && entityType !== "inventory") return;
  const externalId =
    entityType === "inventory"
      ? `${raw.inventory_item_id}-${raw.location_id}`
      : String(raw.id);
  const normalized = normalizeEntity(entityType, raw);
  await upsertSyncedRecord(storeId, tenantId, entityType, externalId, raw, normalized, source, "shopify");

  if (entityType === "location") {
    if (isMappableShopifyLocation(raw)) {
      await importShopifyLocation(tenantId, storeId, raw);
    }
    await touchLastSynced(storeId, tenantId);
    return normalized;
  }

  if (entityType === "inventory") {
    await syncInventoryLevelToErp(tenantId, storeId, normalized);
    await touchLastSynced(storeId, tenantId);
    return normalized;
  }

  if (["order", "customer", "product"].includes(entityType)) {
    await autoSyncEntityToErp(tenantId, storeId, entityType, normalized);
  }

  await touchLastSynced(storeId, tenantId);
  return normalized;
}

async function fetchAllPages(client, path, resourceKey, params = {}) {
  const items = [];
  const token = client.defaults.headers["X-Shopify-Access-Token"];
  let nextUrl = null;
  let isFirst = true;

  while (isFirst || nextUrl) {
    const response = nextUrl
      ? await axios.get(nextUrl, {
          headers: { "X-Shopify-Access-Token": token },
          timeout: 60000,
        })
      : await client.get(path, { params: { limit: 250, ...params } });

    const batch = response.data[resourceKey] || [];
    items.push(...batch);

    const link = response.headers.link || response.headers.Link || "";
    const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
    isFirst = false;
  }
  return items;
}

export async function registerWebhooks(store, grantedScopes = []) {
  const config = getShopifyConfig();
  if (!config.webhookAddress) {
    await addSyncLog(store.id, store.tenant_id, {
      syncType: "webhook_register",
      status: "skipped",
      message:
        "SHOPIFY_WEBHOOK_BASE_URL not set — real-time sync requires a public HTTPS URL (ngrok)",
    });
    return { registered: 0, skipped: true };
  }

  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  let registered = 0;
  let skippedNoScope = 0;

  let existingTopics = new Set();
  try {
    const { data } = await client.get("/webhooks.json");
    for (const hook of data.webhooks || []) {
      if (hook.address === config.webhookAddress) {
        existingTopics.add(hook.topic);
      }
    }
  } catch {
    /* continue */
  }

  for (const topic of WEBHOOK_TOPICS) {
    const shopifyTopic = toShopifyWebhookTopic(topic);

    if (!canRegisterWebhookTopic(topic, grantedScopes)) {
      skippedNoScope++;
      continue;
    }

    if (existingTopics.has(shopifyTopic)) {
      registered++;
      continue;
    }

    try {
      await client.post("/webhooks.json", {
        webhook: {
          topic: shopifyTopic,
          address: config.webhookAddress,
          format: "json",
        },
      });
      registered++;
      existingTopics.add(shopifyTopic);
    } catch (error) {
      const msg = formatShopifyError(error);
      if (msg.includes("already been taken")) {
        registered++;
        existingTopics.add(shopifyTopic);
      } else {
        await addSyncLog(store.id, store.tenant_id, {
          syncType: "webhook_register",
          externalId: shopifyTopic,
          status: "failed",
          message: msg,
        });
      }
    }
  }

  const dataTopicsRegistered = WEBHOOK_TOPICS.filter((topic) => {
    if (topic === "APP_UNINSTALLED") return false;
    if (!canRegisterWebhookTopic(topic, grantedScopes)) return false;
    const shopifyTopic = toShopifyWebhookTopic(topic);
    return existingTopics.has(shopifyTopic);
  }).length;

  if (dataTopicsRegistered > 0) {
    await markWebhooksRegistered(store.id, store.tenant_id);
  }

  if (registered > 0) {
    await addSyncLog(store.id, store.tenant_id, {
      syncType: "webhook_register",
      status: skippedNoScope > 0 ? "partial" : "success",
      message:
        skippedNoScope > 0
          ? `Registered ${registered} webhooks (${skippedNoScope} skipped — missing API scopes). Re-install after fixing Partners scopes.`
          : `Registered ${registered} webhooks → ${config.webhookAddress}`,
    });
  }

  return { registered, skipped: false, skippedNoScope };
}

export async function runInitialFullSync(storeId, tenantId) {
  if (runningSyncs.has(storeId)) return;
  runningSyncs.add(storeId);

  const store = await getStoreById(storeId, tenantId);
  if (!store) {
    runningSyncs.delete(storeId);
    return;
  }

  await updateInitialSyncStatus(storeId, tenantId, "running");
  await addSyncLog(storeId, store.tenant_id, {
    syncType: "initial_sync",
    status: "started",
    message: "Pulling all existing orders, products, and customers from Shopify",
  });

  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });

  const resources = [
    { path: "/orders.json", key: "orders", type: "order", params: { status: "any" } },
    { path: "/products.json", key: "products", type: "product", params: {} },
    { path: "/customers.json", key: "customers", type: "customer", params: {} },
  ];

  try {
    // Locations + inventory first, so imported products land in the warehouse mapped to
    // their Shopify location instead of an unrelated default warehouse.
    const locations = (await fetchAllPages(client, "/locations.json", "locations", {})).filter(
      isMappableShopifyLocation,
    );
    for (const loc of locations) {
      await persistEntity(storeId, store.tenant_id, "location", loc, "initial_sync");
    }
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync:location",
      status: "success",
      message: `Synced ${locations.length} location(s) to warehouses and POS outlets`,
    });

    let inventoryCount = 0;
    for (const loc of locations) {
      try {
        const levels = await fetchAllPages(client, "/inventory_levels.json", "inventory_levels", {
          location_ids: loc.id,
        });
        for (const lvl of levels) {
          await persistEntity(storeId, store.tenant_id, "inventory", lvl, "initial_sync");
          inventoryCount += 1;
        }
      } catch {
        /* read_inventory may be missing — product stock falls back to the mapped warehouse */
      }
    }
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync:inventory",
      status: "success",
      message: `Synced ${inventoryCount} inventory level(s) across locations`,
    });

    for (const resource of resources) {
      const items = await fetchAllPages(client, resource.path, resource.key, resource.params);
      for (const item of items) {
        await persistEntity(storeId, store.tenant_id, resource.type, item, "initial_sync");
      }

      let syncMessage = `Synced ${items.length} ${resource.type}(s)`;
      let syncStatus = "success";

      if (resource.type === "order") {
        try {
          const { data: countData } = await client.get("/orders/count.json", {
            params: { status: "any" },
          });
          const totalInShop = countData.count || 0;
          const hasAllOrdersScope = (store.granted_scopes || "").includes("read_all_orders");
          if (totalInShop > items.length) {
            syncStatus = "partial";
            syncMessage = hasAllOrdersScope
              ? `Synced ${items.length} of ${totalInShop} orders — API returned fewer than store total; check app permissions`
              : `Synced ${items.length} of ${totalInShop} orders (last 60 days only). Add read_all_orders in Partners → Versions, re-install app, then Retry sync`;
          }
        } catch {
          /* optional */
        }
      }

      await addSyncLog(storeId, store.tenant_id, {
        syncType: `initial_sync:${resource.type}`,
        status: syncStatus,
        message: syncMessage,
      });
    }

    await updateInitialSyncStatus(storeId, tenantId, "completed");
    await autoImportAllStaged(storeId, tenantId, "shopify");
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync",
      status: "completed",
      message: "Store data fetched — review and import into your ERP when ready",
    });
  } catch (error) {
    await updateInitialSyncStatus(storeId, tenantId, "failed");
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync",
      status: "failed",
      message: formatShopifyError(error),
    });
  } finally {
    runningSyncs.delete(storeId);
  }
}

export async function onAppInstalled(storeId, tenantId) {
  const store = await getStoreById(storeId, tenantId);
  if (!store) return;

  const access = await verifyStoreApiAccess(store);
  if (!access.ok) {
    await updateInitialSyncStatus(storeId, tenantId, "failed");
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "scope_check",
      status: "failed",
      message:
        access.setupMessage || access.errors.map((e) => `${e.scope}: ${e.message}`).join(" | "),
    });
    if (access.granted.length > 0) {
      await registerWebhooks(store, access.granted);
    }
    return;
  }

  await registerWebhooks(store, access.granted);
  await runInitialFullSync(storeId, tenantId);
}

export async function retryPostInstall(storeId, tenantId) {
  const store = await getStoreById(storeId, tenantId);
  if (!store) return { ok: false, error: "Store not found" };

  await updateInitialSyncStatus(storeId, tenantId, "pending");
  await onAppInstalled(storeId, tenantId);
  return { ok: true };
}

export async function handleWebhookPayload(store, topic, payload) {
  const entityType = topicToEntityType(topic);

  if (topic === "app/uninstalled") {
    await addSyncLog(store.id, store.tenant_id, {
      syncType: "app/uninstalled",
      status: "success",
      message: "App uninstalled by merchant",
    });
    return { action: "uninstalled" };
  }

  if (topic === "products/delete" || topic === "customers/delete") {
    const id = payload.id;
    const deletedType = topic.startsWith("products/") ? "product" : "customer";
    await deleteSyncedRecord(store.id, store.tenant_id, deletedType, id);

    // Also remove/inactivate the linked ERP record so Shopify deletes don't leave ghosts.
    try {
      const link = await getEntityLink(store.id, deletedType, id);
      if (link?.internal_id) {
        if (deletedType === "product") {
          try {
            await inventoryRepository.softDeleteProduct(store.tenant_id, link.internal_id);
          } catch {
            const current = await inventoryRepository.getProductById(store.tenant_id, link.internal_id);
            if (current) {
              await inventoryRepository.updateProduct(store.tenant_id, link.internal_id, {
                product_name: current.product_name,
                description: current.description,
                unit: current.unit,
                delivery_charges: current.delivery_charges ?? 0,
                discount: current.discount ?? 0,
                tax: current.tax ?? 0,
                status: "inactive",
                category_id: current.category_id,
                source: current.source || "shopify",
              });
            }
          }
        } else if (deletedType === "customer") {
          // Keep ERP customer history; just drop the Shopify link.
        }
        await softDeleteEntityLinkByInternalId(store.tenant_id, deletedType, link.internal_id, "shopify");
      }
    } catch (err) {
      console.error(`[shopifyWebhook] ${deletedType} ERP cleanup failed:`, err.message);
    }

    await addSyncLog(store.id, store.tenant_id, {
      syncType: `webhook:${topic}`,
      externalId: String(id),
      status: "success",
      message: `${deletedType} removed from Shopify — cleared staging and linked ERP record`,
    });
    return { action: "deleted", entityType: deletedType, externalId: id };
  }

  if (!entityType) {
    await addSyncLog(store.id, store.tenant_id, {
      syncType: `webhook:${topic}`,
      status: "ignored",
      message: "Unhandled topic",
    });
    return { action: "ignored" };
  }

  if (topic.startsWith("locations/")) {
    if (isMappableShopifyLocation(payload)) {
      await persistEntity(store.id, store.tenant_id, "location", payload, `webhook:${topic}`);
    }
    await addSyncLog(store.id, store.tenant_id, {
      syncType: `webhook:${topic}`,
      externalId: String(payload.id),
      status: "success",
      message: "Location synced to warehouse and POS outlet",
    });
    return { action: "upserted", entityType: "location", externalId: payload.id };
  }

  // Re-fetch full order so current_quantity (removed lines) is present — webhook payloads can be stale/partial.
  let entityPayload = payload;
  if (entityType === "order" && payload?.id && store.store_url && store.access_token) {
    try {
      const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
      const { data } = await client.get(`/orders/${payload.id}.json`, { params: { status: "any" } });
      if (data?.order) entityPayload = data.order;
    } catch {
      entityPayload = payload;
    }
  }

  await persistEntity(store.id, store.tenant_id, entityType, entityPayload, `webhook:${topic}`);
  await addSyncLog(store.id, store.tenant_id, {
    syncType: `webhook:${topic}`,
    externalId: String(payload.id || payload.inventory_item_id),
    status: "success",
    message: `Upserted ${entityType} to DB`,
  });

  return { action: "upserted", entityType, externalId: payload.id };
}

/**
 * Poll Shopify for records changed since the last sync and push them into the ERP.
 * Runs automatically in the background when auto-sync is enabled.
 */
export async function pollShopifyStoreChanges(store) {
  if (!store?.auto_sync_enabled) return { products: 0, orders: 0, customers: 0 };

  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const overlapMs = 3 * 60 * 1000;
  const since = store.last_synced_at
    ? new Date(new Date(store.last_synced_at).getTime() - overlapMs).toISOString()
    : new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const counts = { products: 0, orders: 0, customers: 0 };
  const resources = [
    { path: "/products.json", key: "products", type: "product", countKey: "products", params: { updated_at_min: since } },
    { path: "/customers.json", key: "customers", type: "customer", countKey: "customers", params: { updated_at_min: since } },
    { path: "/orders.json", key: "orders", type: "order", countKey: "orders", params: { updated_at_min: since, status: "any" } },
  ];

  for (const resource of resources) {
    try {
      const items = await fetchAllPages(client, resource.path, resource.key, resource.params);
      for (const item of items) {
        await persistEntity(store.id, store.tenant_id, resource.type, item, "background_poll");
      }
      counts[resource.countKey] = items.length;
    } catch (err) {
      console.error(`[shopifyPoll] ${resource.type} store ${store.id}:`, err.message);
    }
  }

  await touchLastSynced(store.id, store.tenant_id);
  return counts;
}
