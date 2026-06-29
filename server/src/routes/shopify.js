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
  disconnectStore,
  getSyncedRecords,
  getEntityCounts,
  getSyncLogs,
  getPendingOrderConflicts,
  countPendingOrderConflicts,
  resolveOrderConflict,
} from "../repositories/ecommerceRepository.js";
import { onAppInstalled, retryPostInstall } from "../services/ecommerce/shopifySync.js";
import { verifyStoreApiAccess, getRequiredScopes } from "../services/ecommerce/shopifyAccess.js";
import {
  ensureInventoryProductsImported,
  importAllSyncedProductsForStore,
} from "../services/ecommerce/ecomImport.js";

const router = Router();
const SESSION_COOKIE = "shopify_oauth_session";

async function getStoreFromRequest(req) {
  if (req.tenantId) {
    const store = await getStoreByPlatform(req.tenantId, "shopify");
    if (store?.status === "connected") return store;
  }

  const session = await getSession(req.cookies?.[SESSION_COOKIE]);
  if (session?.storeId) {
    const store = await getStoreById(session.storeId);
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

    onAppInstalled(storeId).catch((err) => console.error("Post-install sync error:", err));

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
    counts: await getEntityCounts(store.id),
  });
});

router.post("/oauth/disconnect", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (store) {
    await disconnectStore(store.id);
  }
  await deleteSession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.json({ success: true });
});

router.get("/sync/status", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) {
    return res.json({ connected: false });
  }

  if (store.initial_sync_status === "completed") {
    ensureInventoryProductsImported(store.id, store.tenant_id).catch((err) =>
      console.error("Shopify inventory import:", err),
    );
  }

  const access = await verifyStoreApiAccess(store);

  res.json({
    connected: true,
    storeId: store.id,
    shop: store.store_url,
    storeName: store.store_name,
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
    counts: await getEntityCounts(store.id),
    pendingConflictCount: await countPendingOrderConflicts(store.id),
  });
});

router.get("/sync/conflicts", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(401).json({ success: false, error: "Not connected" });
  const conflicts = await getPendingOrderConflicts(store.id);
  res.json({ success: true, conflicts });
});

router.post("/sync/conflicts/:externalId/resolve", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(401).json({ success: false, error: "Not connected" });
  const action = req.body?.action === "update" ? "update" : "keep";
  const ok = await resolveOrderConflict(store.id, req.params.externalId, action);
  if (!ok) return res.status(404).json({ success: false, error: "Conflict not found" });
  res.json({
    success: true,
    counts: await getEntityCounts(store.id),
    pendingConflictCount: await countPendingOrderConflicts(store.id),
  });
});

router.post("/sync/retry", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) {
    return res.status(401).json({ success: false, error: "Not connected" });
  }

  retryPostInstall(store.id).catch((err) => console.error("Retry sync error:", err));
  res.json({ success: true, message: "Retry started — check sync log" });
});

router.post("/sync/import-inventory", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(401).json({ success: false, error: "Not connected" });
  const result = await importAllSyncedProductsForStore(store.id, store.tenant_id);
  res.json({ success: true, ...result });
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

  const records = await getSyncedRecords(store.id, entityType, 100);
  res.json({
    success: true,
    source: "database",
    records,
    raw: records.map((r) => r.raw),
    normalized: records.map((r) => r.normalized),
    counts: await getEntityCounts(store.id),
  });
});

router.get("/sync/logs", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) {
    return res.json({ logs: [] });
  }
  res.json({ logs: await getSyncLogs(store.id, 150) });
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
