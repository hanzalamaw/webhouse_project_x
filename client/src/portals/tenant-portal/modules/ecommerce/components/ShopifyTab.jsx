import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { API_BASE } from "../../../../../config/api";
import { ecomApiGet, ecomApiPostEmpty, ecomApiPost } from "../api/ecommerceClient";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { FormField } from "../../../../../components/FormField";
import ConnectedStoreSummary from "./ConnectedStoreSummary";
import { friendlyConnectError } from "../utils/friendlyMessages";
import { normalizeShopifyDomain } from "../utils/shopifyDomain";
import { readCachedConnection, writeCachedConnection, clearCachedConnection } from "../utils/connectionCache";

const SHOPIFY_STEPS = [
  "Enter your Shopify store domain.",
  "Click Integrate — you will be redirected to Shopify.",
  "Install the app and approve access.",
  "New orders, customers, and products sync into your ERP automatically.",
  "Edits to linked records can be pushed back to Shopify when you save.",
  "New products, orders, customers, and warehouses can be created in Shopify when you save.",
];

export default function ShopifyTab() {
  const { authFetch } = useAuth();
  const [shopInput, setShopInput] = useState("");
  const [connection, setConnection] = useState(() => readCachedConnection("shopify"));
  const [statusLoading, setStatusLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [autoSyncSaving, setAutoSyncSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef(null);

  const connected = connection?.connected;
  const shopQuery = (shop) => (shop ? `?shop=${encodeURIComponent(shop)}` : "");

  const loadSyncStatus = useCallback(
    async (shop) => {
      try {
        const data = await ecomApiGet("shopify", `sync/status${shopQuery(shop)}`, authFetch);
        if (data.connected) {
          setConnection(data);
          writeCachedConnection("shopify", data);
        } else {
          setConnection(null);
          clearCachedConnection("shopify");
        }
        return data;
      } finally {
        setStatusLoading(false);
      }
    },
    [authFetch],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopify_error")) {
      setNotice(friendlyConnectError(params.get("shopify_error")));
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("shopify_connected")) {
      setNotice("Store connected. We are fetching your data — you will review before anything is added to your ERP.");
      window.history.replaceState({}, "", window.location.pathname);
    }

    const shop = params.get("shop");
    loadSyncStatus(shop || undefined).then((data) => {
      if (shop && data?.connected) setShopInput(shop);
    });
  }, [loadSyncStatus]);

  useEffect(() => {
    if (!connected) return undefined;
    const shop = connection?.shop || shopInput;
    // Poll faster while a re-sync is in progress so completion is detected promptly.
    pollRef.current = setInterval(() => loadSyncStatus(shop), syncing ? 2500 : 5000);
    return () => clearInterval(pollRef.current);
  }, [connected, connection?.shop, shopInput, loadSyncStatus, syncing]);

  // Detect when an in-progress re-sync finishes and surface a clear result.
  useEffect(() => {
    if (!syncing) return;
    const status = connection?.initialSyncStatus;
    if (status === "completed") {
      setSyncing(false);
      const c = connection?.counts || {};
      setNotice(
        `Re-sync complete — ${c.order ?? 0} orders, ${c.product ?? 0} products, ${c.customer ?? 0} customers fetched.`,
      );
    } else if (status === "failed") {
      setSyncing(false);
      setNotice("Re-sync failed — see the sync log below for details.");
    }
  }, [connection, syncing]);

  const handleIntegrate = async () => {
    if (!shopInput.trim()) return;
    setNotice("");
    setConnecting(true);
    let shop;
    try {
      shop = normalizeShopifyDomain(shopInput);
      setShopInput(shop);
    } catch (error) {
      setNotice(friendlyConnectError(error.message));
      setConnecting(false);
      return;
    }
    try {
      const res = await authFetch(
        `${API_BASE}/shopify/oauth/install?shop=${encodeURIComponent(shop)}&format=json`,
      );
      const data = await res.json();
      if (!res.ok || !data.redirectUrl) {
        setNotice(friendlyConnectError(data.error));
        setConnecting(false);
        return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      setNotice(friendlyConnectError());
      setConnecting(false);
    }
  };

  const handleRetrySync = async () => {
    const shop = connection?.shop || shopInput;
    setSyncing(true);
    setNotice("Re-syncing from Shopify… repairing your imported data.");
    // Optimistically mark as running so the completion detector doesn't fire on the stale status.
    setConnection((prev) => (prev ? { ...prev, initialSyncStatus: "running" } : prev));
    let data;
    try {
      data = await ecomApiPostEmpty("shopify", `sync/retry${shopQuery(shop)}`, authFetch);
    } catch {
      setSyncing(false);
      setNotice("Could not start the re-sync. Please try again.");
      return;
    }
    const r = data?.repaired;
    if (r) {
      setNotice(
        `Repaired ${r.products} product(s), ${r.orders} order(s), ${r.customers} customer(s) — dates and warehouse stock corrected. Fetching the latest from Shopify in the background…`,
      );
    }
    // Refresh counts/status; the background fetch continues and the completion detector
    // will report when the fresh pull finishes.
    setTimeout(() => loadSyncStatus(shop), 1500);
  };

  const handleDisconnect = () => {
    setConnection(null);
    clearCachedConnection("shopify");
    setNotice("");
  };

  const handleImported = () => {
    const shop = connection?.shop || shopInput;
    loadSyncStatus(shop);
  };

  const handleAutoSyncChange = async (enabled) => {
    const shop = connection?.shop || shopInput;
    setAutoSyncSaving(true);
    try {
      await ecomApiPost("shopify", `sync/auto-sync${shopQuery(shop)}`, authFetch, { enabled });
      setConnection((prev) => (prev ? { ...prev, autoSyncEnabled: enabled } : prev));
      setNotice(
        enabled
          ? "Auto-sync is on — new store data will import into your ERP automatically."
          : "Auto-sync is off — use Import review below when you want data in your ERP.",
      );
    } catch (err) {
      setNotice(err.message || "Could not update auto-sync setting.");
    } finally {
      setAutoSyncSaving(false);
    }
  };

  if (statusLoading && !connected) {
    return (
      <Card>
        <p className="wh-muted" style={{ margin: 0 }}>Checking store connection…</p>
      </Card>
    );
  }

  if (connected) {
    const counts = connection.counts || {};
    return (
      <>
        {notice && <p className="wh-form-message">{notice}</p>}
        <ConnectedStoreSummary
          platform="shopify"
          storeName={connection.storeName || connection.shop}
          storeSubtitle={connection.shop}
          syncStatus={connection.initialSyncStatus}
          erpImportStatus={connection.erpImportStatus}
          lastSyncedAt={connection.lastSyncedAt}
          counts={counts}
          pendingImportCount={connection.pendingImportCount}
          pendingConflictCount={connection.pendingConflictCount}
          apiAccess={connection.apiAccess}
          connection={connection}
          authFetch={authFetch}
          onDisconnect={handleDisconnect}
          onRetrySync={handleRetrySync}
          onImported={handleImported}
          showRetry
          retryBusy={syncing}
          retryLabel={connection.initialSyncStatus === "failed" ? "Retry sync" : "Re-sync from Shopify"}
          autoSyncEnabled={connection.autoSyncEnabled !== false}
          autoSyncSaving={autoSyncSaving}
          onAutoSyncChange={handleAutoSyncChange}
        />
      </>
    );
  }

  return (
    <Card>
      <h3 className="wh-card__title">Connect your Shopify store</h3>
      <p className="wh-muted" style={{ margin: "0.35rem 0 1.25rem" }}>
        Link your store to fetch orders, products, and customers. You review and approve what gets added to your ERP.
      </p>

      {notice && <p className="wh-form-message" style={{ marginBottom: "1rem" }}>{notice}</p>}

      <ol className="wh-list" style={{ marginBottom: "1.25rem" }}>
        {SHOPIFY_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="wh-form" style={{ maxWidth: 420 }}>
        <FormField
          id="shopify_shop"
          label="Shop domain"
          placeholder="mystore.myshopify.com"
          hint="Use the .myshopify.com address from Shopify Admin → Settings → Domains (not a custom domain)."
          value={shopInput}
          onChange={(e) => setShopInput(e.target.value)}
        />
        <Button onClick={handleIntegrate} disabled={!shopInput.trim() || connecting}>
          {connecting ? "Redirecting…" : "Integrate with Shopify"}
        </Button>
      </div>
    </Card>
  );
}
