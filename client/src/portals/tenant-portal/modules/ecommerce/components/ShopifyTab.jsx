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
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);
  const pollRef = useRef(null);
  const prevSyncStatusRef = useRef(null);
  const awaitSyncPreviewRef = useRef(false);
  const serverSawRunningRef = useRef(false);

  const connected = connection?.connected;
  const shopQuery = (shop) => (shop ? `?shop=${encodeURIComponent(shop)}` : "");
  const syncInProgress =
    syncing
    || connection?.initialSyncStatus === "running"
    || connection?.initialSyncStatus === "pending";

  const openSyncPreview = useCallback(() => setSyncPreviewOpen(true), []);
  const closeSyncPreview = useCallback(() => setSyncPreviewOpen(false), []);

  const loadSyncStatus = useCallback(
    async (shop) => {
      try {
        const data = await ecomApiGet("shopify", `sync/status${shopQuery(shop)}`, authFetch);
        if (data.connected) {
          setConnection(data);
          writeCachedConnection("shopify", data);
          if (data.initialSyncStatus === "running" || data.initialSyncStatus === "pending") {
            serverSawRunningRef.current = true;
            setSyncing(true);
            sessionStorage.setItem("ecom_shopify_syncing", "1");
          }
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
      setNotice("Store connected. We are fetching your data — stay on this page until the review window opens.");
      awaitSyncPreviewRef.current = true;
      setSyncing(true);
      sessionStorage.setItem("ecom_shopify_await_sync_preview", "1");
      sessionStorage.setItem("ecom_shopify_syncing", "1");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (sessionStorage.getItem("ecom_shopify_syncing") === "1") {
      setSyncing(true);
      awaitSyncPreviewRef.current = true;
    }

    const shop = params.get("shop");
    loadSyncStatus(shop || undefined).then((data) => {
      if (shop && data?.connected) setShopInput(shop);
    });
  }, [loadSyncStatus]);

  useEffect(() => {
    if (!connected) return undefined;
    const shop = connection?.shop || shopInput;
    const fast = syncInProgress;
    pollRef.current = setInterval(() => loadSyncStatus(shop), fast ? 2500 : 5000);
    return () => clearInterval(pollRef.current);
  }, [connected, connection?.shop, shopInput, loadSyncStatus, syncInProgress]);

  // Warn before leaving while sync is in progress (UI progress / review only — server keeps going).
  useEffect(() => {
    if (!syncInProgress) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "A store sync is still running. Stay on this page until it finishes.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [syncInProgress]);

  // Open CSV-style review whenever sync finishes (re-sync or first connect).
  useEffect(() => {
    const status = connection?.initialSyncStatus;
    const prev = prevSyncStatusRef.current;
    prevSyncStatusRef.current = status;

    if (sessionStorage.getItem("ecom_shopify_await_sync_preview") === "1") {
      awaitSyncPreviewRef.current = true;
    }

    // Only treat completion as real after the server confirmed running/pending
    // (avoids first-click false "done" while status was still the previous completed).
    const finishedOk =
      status === "completed"
      && serverSawRunningRef.current
      && (prev === "running" || prev === "pending");
    const finishedFail =
      status === "failed"
      && serverSawRunningRef.current
      && (prev === "running" || prev === "pending");

    if (finishedOk) {
      setSyncing(false);
      awaitSyncPreviewRef.current = false;
      serverSawRunningRef.current = false;
      sessionStorage.removeItem("ecom_shopify_await_sync_preview");
      sessionStorage.removeItem("ecom_shopify_syncing");
      const c = connection?.counts || {};
      setNotice(
        `Sync complete — ${c.order ?? 0} orders, ${c.product ?? 0} products, ${c.customer ?? 0} customers, ${c.location ?? 0} locations fetched. Review the details in the window.`,
      );
      setSyncPreviewOpen(true);
    } else if (finishedFail) {
      setSyncing(false);
      awaitSyncPreviewRef.current = false;
      serverSawRunningRef.current = false;
      sessionStorage.removeItem("ecom_shopify_await_sync_preview");
      sessionStorage.removeItem("ecom_shopify_syncing");
      setNotice("Re-sync failed — see Import failures below for details.");
    }
  }, [connection?.initialSyncStatus, connection?.counts]);

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
    awaitSyncPreviewRef.current = true;
    serverSawRunningRef.current = false;
    sessionStorage.setItem("ecom_shopify_await_sync_preview", "1");
    sessionStorage.setItem("ecom_shopify_syncing", "1");
    setNotice(
      "Re-syncing from Shopify… Stay on this page until it finishes. Leaving may interrupt progress updates (the server sync can still continue).",
    );
    setConnection((prev) => (prev ? { ...prev, initialSyncStatus: "running" } : prev));
    prevSyncStatusRef.current = "running";
    try {
      await ecomApiPostEmpty("shopify", `sync/retry${shopQuery(shop)}`, authFetch);
      serverSawRunningRef.current = true;
    } catch {
      setSyncing(false);
      awaitSyncPreviewRef.current = false;
      sessionStorage.removeItem("ecom_shopify_await_sync_preview");
      sessionStorage.removeItem("ecom_shopify_syncing");
      setNotice("Could not start the re-sync. Please try again.");
      return;
    }
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
          unmappedLocationCount={connection.unmappedLocationCount}
          apiAccess={connection.apiAccess}
          connection={connection}
          authFetch={authFetch}
          onDisconnect={handleDisconnect}
          onRetrySync={handleRetrySync}
          onImported={handleImported}
          showRetry
          retryBusy={syncing || connection.initialSyncStatus === "running" || connection.initialSyncStatus === "pending"}
          retryLabel={connection.initialSyncStatus === "failed" ? "Retry sync" : "Re-sync from Shopify"}
          syncStayWarning={
            syncing || connection.initialSyncStatus === "running" || connection.initialSyncStatus === "pending"
          }
          autoSyncEnabled={connection.autoSyncEnabled !== false}
          autoSyncSaving={autoSyncSaving}
          onAutoSyncChange={handleAutoSyncChange}
          syncPreviewOpen={syncPreviewOpen}
          onSyncPreviewClose={closeSyncPreview}
          onOpenSyncPreview={openSyncPreview}
        />
      </>
    );
  }

  return (
    <Card>
      <h3 className="wh-card__title">Connect your Shopify store</h3>
      <p className="wh-muted" style={{ margin: "0.35rem 0 1.25rem" }}>
        Link your store to fetch orders, products, customers, and locations. You review and approve what gets added to your ERP.
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
