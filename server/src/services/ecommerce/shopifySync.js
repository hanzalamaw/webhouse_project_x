import {
  normalizeShopifyOrder,
  normalizeShopifyProduct,
  normalizeShopifyCustomer,
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
} from "../../repositories/ecommerceRepository.js";

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
  return raw;
}

export async function persistEntity(storeId, tenantId, entityType, raw, source) {
  if (!raw?.id && entityType !== "inventory") return;
  const externalId =
    entityType === "inventory"
      ? `${raw.inventory_item_id}-${raw.location_id}`
      : String(raw.id);
  const normalized = normalizeEntity(entityType, raw);
  await upsertSyncedRecord(storeId, tenantId, entityType, externalId, raw, normalized, source);
  await touchLastSynced(storeId);
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
    await markWebhooksRegistered(store.id);
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

export async function runInitialFullSync(storeId) {
  if (runningSyncs.has(storeId)) return;
  runningSyncs.add(storeId);

  const store = await getStoreById(storeId);
  if (!store) {
    runningSyncs.delete(storeId);
    return;
  }

  await updateInitialSyncStatus(storeId, "running");
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

    await updateInitialSyncStatus(storeId, "completed");
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync",
      status: "completed",
      message: "Initial full sync completed — webhooks will keep DB in sync",
    });
  } catch (error) {
    await updateInitialSyncStatus(storeId, "failed");
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync",
      status: "failed",
      message: formatShopifyError(error),
    });
  } finally {
    runningSyncs.delete(storeId);
  }
}

export async function onAppInstalled(storeId) {
  const store = await getStoreById(storeId);
  if (!store) return;

  const access = await verifyStoreApiAccess(store);
  if (!access.ok) {
    await updateInitialSyncStatus(storeId, "failed");
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
  await runInitialFullSync(storeId);
}

export async function retryPostInstall(storeId) {
  const store = await getStoreById(storeId);
  if (!store) return { ok: false, error: "Store not found" };

  await updateInitialSyncStatus(storeId, "pending");
  await onAppInstalled(storeId);
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

  if (topic === "products/delete") {
    const id = payload.id;
    await deleteSyncedRecord(store.id, "product", id);
    await addSyncLog(store.id, store.tenant_id, {
      syncType: `webhook:${topic}`,
      externalId: String(id),
      status: "success",
      message: "Product deleted from DB",
    });
    return { action: "deleted", entityType: "product", externalId: id };
  }

  if (!entityType) {
    await addSyncLog(store.id, store.tenant_id, {
      syncType: `webhook:${topic}`,
      status: "ignored",
      message: "Unhandled topic",
    });
    return { action: "ignored" };
  }

  await persistEntity(store.id, store.tenant_id, entityType, payload, `webhook:${topic}`);
  await addSyncLog(store.id, store.tenant_id, {
    syncType: `webhook:${topic}`,
    externalId: String(payload.id || payload.inventory_item_id),
    status: "success",
    message: `Upserted ${entityType} to DB`,
  });

  return { action: "upserted", entityType, externalId: payload.id };
}
