import { Router } from "express";
import {
  normalizeDarazOrder,
  normalizeDarazProduct,
  normalizeDarazCustomer,
} from "../normalizers/daraz.js";
import { getDarazConfig, storeUrlForDaraz } from "../services/ecommerce/darazConfig.js";
import {
  darazApiGet,
  unwrapDarazResponse,
  darazCredentialsForStore,
  apiBaseFromStore,
  fetchAllDaraz,
  orderFetchParams,
} from "../services/ecommerce/darazClient.js";
import { runDarazInitialSync } from "../services/ecommerce/darazSync.js";
import {
  getDarazLocationMappingData,
  applyDarazLocationSelections,
} from "../services/ecommerce/darazLocationSync.js";
import {
  createOAuthState,
  peekOAuthState,
  consumeOAuthState,
  createSession,
  getSession,
  deleteSession,
} from "../services/ecommerce/oauthState.js";
import {
  upsertStoreConnection,
  getStoreById,
  getStoreByPlatform,
  getSyncedRecords,
  getEntityCounts,
  getPushLogs,
} from "../repositories/ecommerceRepository.js";
import { createEcomSharedHandlers } from "./ecomSharedHandlers.js";
import { retryPushByExternalId } from "../services/ecommerce/ecomPush.js";

const router = Router();
const SESSION_COOKIE = "daraz_oauth_session";
const shared = createEcomSharedHandlers("daraz");

async function getStoreFromRequest(req) {
  if (req.tenantId) {
    const store = await getStoreByPlatform(req.tenantId, "daraz");
    if (store?.status === "connected") return store;
  }

  const session = await getSession(req.cookies?.[SESSION_COOKIE]);
  if (session?.storeId) {
    const tenantId = session.tenantId ?? req.tenantId;
    const store = await getStoreById(session.storeId, tenantId);
    if (store?.status === "connected" && store.platform === "daraz") return store;
  }

  return null;
}

router.get("/oauth/status", (_req, res) => {
  const config = getDarazConfig();
  res.json({
    oauthConfigured: config.oauthConfigured,
    apiBase: config.apiBase,
    redirectUri: config.redirectUri,
    installUrl: config.installUrl,
    appKeyPreview: config.appKey ? `${config.appKey.slice(0, 4)}…` : null,
    frontendUrl: config.frontendUrl,
  });
});

export function createDarazInstallHandler() {
  return async (req, res) => {
    const config = getDarazConfig();
    if (!config.oauthConfigured) {
      return res.status(503).json({
        success: false,
        error:
          "Daraz OAuth not configured. Set DARAZ_APP_KEY, DARAZ_APP_SECRET, DARAZ_OAUTH_REDIRECT_URI in .env",
      });
    }

    const state = await createOAuthState({ shop: config.apiBase, tenantId: req.tenantId });
    const params = new URLSearchParams({
      response_type: "code",
      force_auth: "true",
      redirect_uri: config.redirectUri,
      client_id: config.appKey,
      state,
    });

    const redirectUrl = `${config.authorizeUrl}?${params}`;
    if (req.query.format === "json" || req.get("Accept")?.includes("application/json")) {
      return res.json({ success: true, redirectUrl });
    }
    res.redirect(redirectUrl);
  };
}

router.get("/oauth/callback", async (req, res) => {
  const config = getDarazConfig();
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(
      `${config.frontendIntegrationsUrl}?platform=daraz&daraz_error=${encodeURIComponent(String(oauthError))}`,
    );
  }

  if (!code || !state) {
    return res.redirect(
      `${config.frontendIntegrationsUrl}?platform=daraz&daraz_error=missing_oauth_params`,
    );
  }

  const stateKey = String(state);
  const stateData = await peekOAuthState(stateKey);
  if (!stateData) {
    return res.redirect(
      `${config.frontendIntegrationsUrl}?platform=daraz&daraz_error=${encodeURIComponent("OAuth session expired — click Connect Daraz again")}`,
    );
  }

  if (stateData.shop !== config.apiBase) {
    return res.redirect(
      `${config.frontendIntegrationsUrl}?platform=daraz&daraz_error=${encodeURIComponent("OAuth state mismatch — restart Daraz integration")}`,
    );
  }

  const consumed = await consumeOAuthState(stateKey);
  if (!consumed?.tenantId) {
    return res.redirect(
      `${config.frontendIntegrationsUrl}?platform=daraz&daraz_error=${encodeURIComponent("Invalid OAuth state")}`,
    );
  }

  try {
    const creds = { apiKey: config.appKey, apiSecret: config.appSecret };
    const tokenData = await darazApiGet(
      config.apiBase,
      "/auth/token/create",
      creds,
      { code: String(code) },
      { withToken: false },
    );
    const tokenResult = unwrapDarazResponse(tokenData);
    const accessToken = tokenResult.access_token;
    const refreshToken = tokenResult.refresh_token || null;

    if (!accessToken) {
      throw new Error("No access_token in Daraz response");
    }

    const sellerCreds = { ...creds, accessToken };
    const sellerData = await darazApiGet(config.apiBase, "/seller/get", sellerCreds);
    const seller = unwrapDarazResponse(sellerData);
    const sellerId = seller.seller_id || seller.short_code || seller.name;
    const storeName = seller.name || seller.shop_name || `Daraz Seller ${sellerId}`;
    const storeUrl = storeUrlForDaraz(config.apiBase, sellerId);

    const storeId = await upsertStoreConnection({
      tenantId: consumed.tenantId,
      shop: storeUrl,
      accessToken,
      storeName,
      grantedScopes: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : null,
      platform: "daraz",
    });

    const sessionId = await createSession({
      shop: storeUrl,
      accessToken,
      scope: refreshToken ? "refresh" : null,
      storeId,
      tenantId: consumed.tenantId,
    });

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
      secure: config.redirectUri.startsWith("https"),
    });

    runDarazInitialSync(storeId, consumed.tenantId).catch((err) => console.error("Daraz post-connect sync:", err));

    res.redirect(`${config.frontendIntegrationsUrl}?platform=daraz&daraz_connected=1&sync=started`);
  } catch (error) {
    const message = error.response?.data?.message || error.message || "token_exchange_failed";
    console.error("[Daraz OAuth callback]", message, error.response?.data);
    res.redirect(
      `${config.frontendIntegrationsUrl}?platform=daraz&daraz_error=${encodeURIComponent(message)}`,
    );
  }
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
  if (!store) return res.json({ connected: false });

  const importExtras = await shared.handleSyncStatusExtras(store);

  res.json({
    connected: true,
    storeId: store.id,
    shop: store.store_url,
    storeName: store.store_name,
    autoSyncEnabled: store.auto_sync_enabled !== false,
    apiBase: apiBaseFromStore(store),
    initialSyncStatus: store.initial_sync_status,
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

router.get("/sync/logs", async (req, res) => {
  const store = await getStoreFromRequest(req);
  await shared.handleSyncLogs(req, res, store);
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
  if (!store) return res.status(409).json({ success: false, error: "Not connected" });
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

router.get("/categories/suggest", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(409).json({ success: false, error: "Not connected" });
  const productName = String(req.query.product_name || req.query.q || "").trim();
  if (!productName) {
    return res.status(400).json({ success: false, error: "product_name is required" });
  }
  try {
    const { suggestDarazCategories } = await import("../services/ecommerce/darazWrite.js");
    const categories = await suggestDarazCategories(store, productName);
    res.json({ success: true, categories });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || "Could not suggest categories" });
  }
});

router.post("/sync/import-inventory", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(409).json({ success: false, error: "Not connected" });
  req.body = { entities: ["product"], ...(req.body || {}) };
  await shared.handleImport(req, res, store);
});

router.post("/sync/retry", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(409).json({ success: false, error: "Not connected" });
  try {
    const { updateInitialSyncStatus } = await import("../repositories/ecommerceRepository.js");
    await updateInitialSyncStatus(store.id, store.tenant_id, "running");
  } catch {
    // best-effort
  }
  res.json({
    success: true,
    message: "Re-sync started in the background. Stay on this page to watch progress.",
  });
  runDarazInitialSync(store.id, store.tenant_id).catch((err) => console.error("Daraz retry sync:", err));
});

router.get("/locations", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(409).json({ success: false, error: "Not connected" });
  try {
    const data = await getDarazLocationMappingData(req.tenantId, store.id);
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(502).json({
      success: false,
      error: error.message || "Could not fetch Daraz warehouses",
    });
  }
});

router.post("/locations/import", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(409).json({ success: false, error: "Not connected" });
  const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];
  const data = await applyDarazLocationSelections(req.tenantId, store.id, selections);
  res.json({ success: true, ...data });
});

router.get("/db/:entityType", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(409).json({ success: false, error: "Not connected" });

  const typeMap = { orders: "order", products: "product", customers: "customer" };
  const entityType = typeMap[req.params.entityType];
  if (!entityType) return res.status(400).json({ success: false, error: "Invalid entity type" });

  const records = await getSyncedRecords(store.id, store.tenant_id, entityType, 100);
  res.json({
    success: true,
    source: "database",
    raw: records.map((r) => r.raw),
    normalized: records.map((r) => r.normalized),
    counts: await getEntityCounts(store.id, store.tenant_id),
  });
});

router.post("/live/:entityType", async (req, res) => {
  const store = await getStoreFromRequest(req);
  if (!store) return res.status(409).json({ success: false, error: "Not connected" });

  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);

  try {
    if (req.params.entityType === "orders") {
      const raw = await fetchAllDaraz(
        apiBase,
        "/orders/get",
        creds,
        orderFetchParams(apiBase),
        "orders",
        "order_list",
      );
      return res.json({
        success: true,
        raw,
        normalized: raw.map(normalizeDarazOrder),
        count: raw.length,
      });
    }
    if (req.params.entityType === "products") {
      const raw = await fetchAllDaraz(
        apiBase,
        "/products/get",
        creds,
        { filter: "all" },
        "products",
        "product_list",
      );
      return res.json({
        success: true,
        raw,
        normalized: raw.map(normalizeDarazProduct),
        count: raw.length,
      });
    }
    if (req.params.entityType === "customers") {
      const orders = await fetchAllDaraz(
        apiBase,
        "/orders/get",
        creds,
        orderFetchParams(apiBase),
        "orders",
        "order_list",
      );
      const seen = new Map();
      for (const order of orders) {
        const buyerId = order.buyer_id || order.order_id;
        if (!seen.has(buyerId)) {
          seen.set(buyerId, {
            buyer_id: order.buyer_id || buyerId,
            buyer_name: [order.customer_first_name, order.customer_last_name]
              .filter(Boolean)
              .join(" "),
            buyer_email: order.address_billing?.customer_email,
            phone: order.address_billing?.phone,
          });
        }
      }
      const raw = [...seen.values()];
      return res.json({
        success: true,
        raw,
        normalized: raw.map(normalizeDarazCustomer),
        note: "Derived from orders",
      });
    }
    res.status(400).json({ success: false, error: "Invalid entity type" });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(500).json({ success: false, error: String(message) });
  }
});

export { router as darazRouter };
