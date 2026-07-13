import { Router } from "express";
import axios from "axios";
import { getShopifyConfig, normalizeShopDomain } from "../services/ecommerce/shopifyConfig.js";
import {
  createOAuthState,
  peekOAuthState,
  consumeOAuthState,
  createSession,
  getSession,
  deleteSession,
} from "../services/ecommerce/oauthState.js";
import { shopifyClient, handleShopifyError } from "../services/ecommerce/shopifyClient.js";
import {
  upsertStoreConnection,
  getStoreById,
  getStoreByShop,
  getStoreByPlatform,
  getSyncedRecords,
  getEntityCounts,
} from "../repositories/ecommerceRepository.js";
import { onAppInstalled, retryPostInstall } from "../services/ecommerce/shopifySync.js";
import { verifyStoreApiAccess, getRequiredScopes } from "../services/ecommerce/shopifyAccess.js";
import { createEcomSharedHandlers } from "./ecomSharedHandlers.js";
import { getEcomLinkStatus, getShopifyLinkStatus, retryPushByExternalId } from "../services/ecommerce/ecomPush.js";
import { repairCustomerLinksFromOrders, reconcileImportedData } from "../services/ecommerce/ecomImport.js";
import { getPushLogs } from "../repositories/ecommerceRepository.js";
import { getLocationMappingData, applyLocationSelections } from "../services/ecommerce/locationSync.js";

const router = Router();
const SESSION_COOKIE = "shopify_oauth_session";
const shared = createEcomSharedHandlers("shopify");

async function getStoreFromRequest(req) {
  if (req.tenantId) {
    const store = await getStoreByPlatform(req.tenantId, "shopify");
    if (store?.status === "connected") return store;
  }

  const session = await getSession(req.cookies?.[SESSION_COOKIE]);
  if (session?.storeId) {
    const tenantId = session.tenantId ?? req.tenantId;
    const store = await getStoreById(session.storeId, tenantId);
    if (store?.status === "connected") return store;
  }

  const shop = req.query.shop;
  if (shop) {
    try {
      const store = await getStoreByShop(
        normalizeShopDomain(String(shop)),
        req.tenantId || undefined,
      );
      if (store?.status === "connected") return store;
    } catch {
      /* ignore */
    }
  }

  return null;
}

router.get("/oauth/status", (_req, res) => {
  const config = getShopifyConfig();
  res.json({
    oauthConfigured: config.oauthConfigured,
    webhooksConfigured: config.webhooksConfigured,
    scopes: config.scopes,
    requiredScopes: getRequiredScopes(),
    redirectUri: config.redirectUri,
    installUrl: config.redirectUri.replace(/\/oauth\/callback$/, "/oauth/install"),
    redirectUriIsLocalhost: config.redirectUri.includes("localhost"),
    frontendUrl: config.frontendUrl,
    webhookAddress: config.webhookAddress,
    clientId: config.oauthConfigured ? config.apiKey : null,
    clientIdPreview: config.apiKey
      ? `${config.apiKey.slice(0, 8)}…${config.apiKey.slice(-4)}`
      : null,
  });
});

export function createShopifyInstallHandler() {
  return async (req, res) => {
    const config = getShopifyConfig();
    if (!config.oauthConfigured) {
      return res.status(503).json({
        success: false,
        error: "Shopify OAuth not configured. Set SHOPIFY_API_KEY and SHOPIFY_API_SECRET in .env",
      });
    }

    try {
      const shop = normalizeShopDomain(req.query.shop);
      const state = await createOAuthState({ shop, tenantId: req.tenantId });
      const params = new URLSearchParams({
        client_id: config.apiKey,
        scope: config.scopes,
        redirect_uri: config.redirectUri,
        state,
      });
      const redirectUrl = `https://${shop}/admin/oauth/authorize?${params}`;
      if (req.query.format === "json" || req.get("Accept")?.includes("application/json")) {
        return res.json({ success: true, redirectUrl });
      }
      res.redirect(redirectUrl);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };
}

router.get("/oauth/callback", async (req, res) => {
  const config = getShopifyConfig();
  const { shop, code, state, error: oauthError } = req.query;

  if (oauthError) {
    const errMsg = String(oauthError);
    const hint =
      errMsg === "invalid_state"
        ? "Redirect URI mismatch — add the HTTPS Redirect URI to Partners → Versions."
        : errMsg.includes("redirect_uri") || errMsg.includes("not whitelisted")
          ? "redirect_uri is not whitelisted in Partners → Versions."
          : errMsg;
    return res.redirect(
      `${config.frontendIntegrationsUrl}?shopify_error=${encodeURIComponent(hint)}`,
    );
  }

  if (!shop || !code || !state) {
    return res.redirect(`${config.frontendIntegrationsUrl}?shopify_error=missing_oauth_params`);
  }

  const stateKey = String(state);
  const stateData = await peekOAuthState(stateKey);
  if (!stateData) {
    return res.redirect(
      `${config.frontendIntegrationsUrl}?shopify_error=${encodeURIComponent("OAuth session expired — click Integrate with Shopify again")}`,
    );
  }

  let shopDomain;
  try {
    shopDomain = normalizeShopDomain(String(shop));
  } catch {
    return res.redirect(
      `${config.frontendIntegrationsUrl}?shopify_error=${encodeURIComponent("Invalid shop domain in callback")}`,
    );
  }

  let expectedShop = stateData.shop;
  try {
    expectedShop = normalizeShopDomain(stateData.shop);
  } catch {
    // keep raw value for error message
  }
  if (expectedShop !== shopDomain) {
    console.warn(
      `[shopify oauth] shop mismatch: expected=${expectedShop} callback=${shopDomain} state=${stateKey.slice(0, 8)}…`,
    );
    const hint =
      `Shop mismatch: you started connecting ${expectedShop} but Shopify returned ${shopDomain}. ` +
      "Use the exact .myshopify.com domain from Shopify Admin → Settings → Domains, close other OAuth tabs, and click Integrate once.";
    return res.redirect(
      `${config.frontendIntegrationsUrl}?shopify_error=${encodeURIComponent(hint)}`,
    );
  }

  const consumed = await consumeOAuthState(stateKey);
  if (!consumed?.tenantId) {
    return res.redirect(
      `${config.frontendIntegrationsUrl}?shopify_error=${encodeURIComponent("Invalid OAuth state")}`,
    );
  }

  try {
    const { data } = await axios.post(
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        client_id: config.apiKey,
        client_secret: config.apiSecret,
        code,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 30000 },
    );

    const client = shopifyClient({ storeUrl: shopDomain, accessToken: data.access_token });
    const { data: shopData } = await client.get("/shop.json");
    const storeName = shopData.shop?.name || shopDomain;

    const storeId = await upsertStoreConnection({
      tenantId: consumed.tenantId,
      shop: shopDomain,
      accessToken: data.access_token,
      storeName,
      grantedScopes: data.scope || null,
    });

    const sessionId = await createSession({
      shop: shopDomain,
      accessToken: data.access_token,
      scope: data.scope,
      storeId,
      tenantId: consumed.tenantId,
    });

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
      secure: config.redirectUri.startsWith("https"),
    });

    onAppInstalled(storeId, consumed.tenantId).catch((err) => console.error("Post-install sync error:", err));

    res.redirect(
      `${config.frontendIntegrationsUrl}?shopify_connected=1&shop=${encodeURIComponent(shopDomain)}&sync=started`,
    );
  } catch (error) {
    const message =
      error.response?.data?.error_description || error.message || "token_exchange_failed";
    console.error("OAuth callback failed:", message, error.response?.data);
    res.redirect(`${config.frontendIntegrationsUrl}?shopify_error=${encodeURIComponent(message)}`);
  }
});

router.get("/oauth/session", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) {
    return res.json({ connected: false });
  }

  res.json({
    connected: true,
    shop: store.store_url,
    storeUrl: store.store_url,
    storeId: store.id,
    storeName: store.store_name,
    initialSyncStatus: store.initial_sync_status,
    webhooksRegistered: Boolean(store.webhooks_registered),
    lastSyncedAt: store.last_synced_at,
    counts: await getEntityCounts(store.id, store.tenant_id),
  });
});

router.post("/oauth/disconnect", async (req, res) => {
  const store = await getStoreFromRequest(req);
  await shared.handleDisconnect(req, res, store, async (req) => {
    await deleteSession(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE);
  });
});

router.get("/oauth/disconnect-preview", async (req, res) => {
  const store = await getStoreFromRequest(req);
  await shared.handleDisconnectPreview(req, res, store);
});

router.get("/sync/import-preview", async (req, res) => {
  const store = await getStoreFromRequest(req);
  await shared.handleImportPreview(req, res, store);
});

router.post("/sync/import", async (req, res) => {
  const store = await getStoreFromRequest(req);
  await shared.handleImport(req, res, store);
});

router.post("/sync/auto-sync", async (req, res) => {
  const store = await getStoreFromRequest(req);
  await shared.handleAutoSyncSetting(req, res, store);
});

router.get("/sync/status", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) {
    return res.json({ connected: false });
  }

  const access = await verifyStoreApiAccess(store);
  const importExtras = await shared.handleSyncStatusExtras(store);

  res.json({
    connected: true,
    storeId: store.id,
    shop: store.store_url,
    storeName: store.store_name,
    autoSyncEnabled: store.auto_sync_enabled !== false,
    grantedScopes: store.granted_scopes,
    requiredScopes: getRequiredScopes(),
    apiAccess: {
      ok: access.ok,
      granted: access.granted,
      missing: access.missing,
      setupMessage: access.setupMessage,
    },
    initialSyncStatus: store.initial_sync_status,
    webhooksRegistered: Boolean(store.webhooks_registered),
    lastSyncedAt: store.last_synced_at,
    counts: await getEntityCounts(store.id, store.tenant_id),
    ...importExtras,
  });
});

router.get("/sync/conflicts", async (req, res) => {
  const store = await getStoreFromRequest(req);
  await shared.handleConflicts(req, res, store);
});

router.post("/sync/conflicts/:externalId/resolve", async (req, res) => {
  const store = await getStoreFromRequest(req);
  await shared.handleResolveConflict(req, res, store);
});

router.post("/sync/retry", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) {
    return res.status(401).json({ success: false, error: "Not connected" });
  }

  // First, synchronously repair already-imported records from data already fetched
  // (fixes wrong dates + stock stuck in the wrong warehouse) so the user gets an
  // immediate, accurate result. Then kick off a fresh background pull from Shopify.
  let repaired = { products: 0, customers: 0, orders: 0, failed: 0 };
  try {
    repaired = await reconcileImportedData(store.id, store.tenant_id);
  } catch (err) {
    console.error("Reconcile error:", err);
  }

  retryPostInstall(store.id, store.tenant_id).catch((err) => console.error("Retry sync error:", err));
  res.json({
    success: true,
    repaired,
    message: `Repaired ${repaired.products} products, ${repaired.orders} orders, ${repaired.customers} customers. Fetching latest from Shopify in the background…`,
  });
});

router.post("/sync/import-inventory", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(401).json({ success: false, error: "Not connected" });
  req.body = { entities: ["product"], ...(req.body || {}) };
  await shared.handleImport(req, res, store);
});

router.get("/sync/link", async (req, res) => {
  const entityType = String(req.query.entityType || "").trim();
  const entityId = Number(req.query.entityId);
  if (!entityType || !entityId) {
    return res.status(400).json({ success: false, error: "entityType and entityId are required" });
  }
  if (!req.tenantId) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const status = await getEcomLinkStatus(req.tenantId, entityType, entityId);
  res.json({ success: true, ...status });
});

router.post("/sync/repair-customer-links", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(401).json({ success: false, error: "Not connected" });
  const result = await repairCustomerLinksFromOrders(req.tenantId, store.id);
  res.json({ success: true, ...result });
});

router.get("/sync/push-logs", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.json({ success: true, logs: [] });
  const onlyFailed = req.query.onlyFailed === "1" || req.query.onlyFailed === "true";
  const logs = await getPushLogs(store.id, { onlyFailed });
  res.json({ success: true, logs });
});

router.post("/sync/push-retry", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(401).json({ success: false, error: "Not connected" });
  const syncType = String(req.body?.syncType || "");
  const entityType = String(req.body?.entityType || syncType.replace(/^erp_push:/, "")).trim();
  const externalId = String(req.body?.externalId || "").trim();
  if (!entityType || !externalId) {
    return res.status(400).json({ success: false, error: "entityType and externalId are required" });
  }
  const result = await retryPushByExternalId(req.tenantId, store.id, entityType, externalId);
  if (!result.ok) {
    return res.status(result.skipped ? 409 : 400).json({ success: false, ...result });
  }
  res.json({ success: true, ...result });
});

router.get("/locations", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(401).json({ success: false, error: "Not connected" });
  const data = await getLocationMappingData(req.tenantId, store.id);
  res.json({ success: true, ...data });
});

router.post("/locations/import", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(401).json({ success: false, error: "Not connected" });
  const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];
  const data = await applyLocationSelections(req.tenantId, store.id, selections);
  res.json({ success: true, ...data });
});

router.get("/sync/logs", async (req, res) => {
  const store = await getStoreFromRequest(req);
  await shared.handleSyncLogs(req, res, store);
});

router.get("/db/:entityType", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) {
    return res.status(401).json({ success: false, error: "Not connected" });
  }

  const typeMap = {
    orders: "order",
    products: "product",
    customers: "customer",
    inventory: "inventory",
  };
  const entityType = typeMap[req.params.entityType];
  if (!entityType) {
    return res.status(400).json({ success: false, error: "Invalid entity type" });
  }

  const records = await getSyncedRecords(store.id, store.tenant_id, entityType, 100);
  res.json({
    success: true,
    source: "database",
    records,
    raw: records.map((r) => r.raw),
    normalized: records.map((r) => r.normalized),
    counts: await getEntityCounts(store.id, store.tenant_id),
  });
});

router.post("/connect", async (req, res) => {
  try {
    const store = await getStoreFromRequest(req);
    if (!store) {
      return res.status(401).json({ success: false, error: "Not connected" });
    }
    const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
    const { data } = await client.get("/shop.json");
    res.json({ success: true, message: "Connected to Shopify", shop: data.shop });
  } catch (error) {
    handleShopifyError(res, error, "Shopify connection");
  }
});

export { router as shopifyRouter };
