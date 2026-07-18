import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { API_BASE } from "../../../../../config/api";
import { ecomApiGet, ecomApiPostEmpty, ecomApiPost } from "../api/ecommerceClient";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import ConnectedStoreSummary from "./ConnectedStoreSummary";
import { friendlyConnectError } from "../utils/friendlyMessages";
import { readCachedConnection, writeCachedConnection, clearCachedConnection } from "../utils/connectionCache";

const DARAZ_STEPS = [
  "Click Connect Daraz — you will be redirected to Daraz.",
  "Sign in with your seller account.",
  "Authorize the connection.",
  "We fetch your warehouses, orders, products, and customers first, then you choose what to import into your ERP.",
];

export default function DarazTab() {
  const { authFetch } = useAuth();
  const [connection, setConnection] = useState(() => readCachedConnection("daraz"));
  const [statusLoading, setStatusLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [autoSyncSaving, setAutoSyncSaving] = useState(false);
  const pollRef = useRef(null);
  const prevSyncStatusRef = useRef(null);
  const awaitSyncPreviewRef = useRef(false);
  const serverSawRunningRef = useRef(false);

  const connected = connection?.connected;
  const syncInProgress =
    syncing
    || connection?.initialSyncStatus === "running"
    || connection?.initialSyncStatus === "pending";
  const openSyncPreview = useCallback(() => setSyncPreviewOpen(true), []);
  const closeSyncPreview = useCallback(() => setSyncPreviewOpen(false), []);

  const loadSyncStatus = useCallback(async () => {
    try {
      const data = await ecomApiGet("daraz", "sync/status", authFetch);
      if (data.connected) {
        setConnection(data);
        writeCachedConnection("daraz", data);
        if (data.initialSyncStatus === "running" || data.initialSyncStatus === "pending") {
          serverSawRunningRef.current = true;
          setSyncing(true);
          sessionStorage.setItem("ecom_daraz_syncing", "1");
        }
      } else {
        setConnection(null);
        clearCachedConnection("daraz");
      }
      return data;
    } finally {
      setStatusLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("daraz_error")) {
      setNotice(friendlyConnectError(params.get("daraz_error")));
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("daraz_connected")) {
      setNotice("Store connected. We are fetching your data — stay on this page until the review window opens.");
      awaitSyncPreviewRef.current = true;
      setSyncing(true);
      sessionStorage.setItem("ecom_daraz_await_sync_preview", "1");
      sessionStorage.setItem("ecom_daraz_syncing", "1");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (sessionStorage.getItem("ecom_daraz_syncing") === "1") {
      setSyncing(true);
      awaitSyncPreviewRef.current = true;
    }
    loadSyncStatus();
  }, [loadSyncStatus]);

  useEffect(() => {
    if (!connected) return undefined;
    pollRef.current = setInterval(loadSyncStatus, syncInProgress ? 2500 : 5000);
    return () => clearInterval(pollRef.current);
  }, [connected, loadSyncStatus, syncInProgress]);

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

  useEffect(() => {
    const status = connection?.initialSyncStatus;
    const prev = prevSyncStatusRef.current;
    prevSyncStatusRef.current = status;

    if (sessionStorage.getItem("ecom_daraz_await_sync_preview") === "1") {
      awaitSyncPreviewRef.current = true;
    }

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
      sessionStorage.removeItem("ecom_daraz_await_sync_preview");
      sessionStorage.removeItem("ecom_daraz_syncing");
      const counts = connection?.counts || {};
      const parts = [
        counts.location != null ? `${counts.location} warehouse(s)` : null,
        counts.order != null ? `${counts.order} order(s)` : null,
        counts.product != null ? `${counts.product} product(s)` : null,
        counts.customer != null ? `${counts.customer} customer(s)` : null,
      ].filter(Boolean);
      setNotice(
        parts.length
          ? `Sync finished — staged ${parts.join(", ")}. Review the details in the window.`
          : "Sync finished. Review the details in the window.",
      );
      setSyncPreviewOpen(true);
    } else if (finishedFail) {
      setSyncing(false);
      awaitSyncPreviewRef.current = false;
      serverSawRunningRef.current = false;
      sessionStorage.removeItem("ecom_daraz_await_sync_preview");
      sessionStorage.removeItem("ecom_daraz_syncing");
      setNotice("Re-sync failed. Check Import failures below.");
    }
  }, [connection?.initialSyncStatus, connection?.counts]);

  const handleConnect = async () => {
    setNotice("");
    setConnecting(true);
    try {
      const res = await authFetch(`${API_BASE}/daraz/oauth/install?format=json`);
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
    setSyncing(true);
    awaitSyncPreviewRef.current = true;
    serverSawRunningRef.current = false;
    sessionStorage.setItem("ecom_daraz_await_sync_preview", "1");
    sessionStorage.setItem("ecom_daraz_syncing", "1");
    setNotice(
      "Re-syncing from Daraz… Stay on this page until it finishes. Leaving may interrupt progress updates.",
    );
    setConnection((prev) => (prev ? { ...prev, initialSyncStatus: "running" } : prev));
    prevSyncStatusRef.current = "running";
    try {
      await ecomApiPostEmpty("daraz", "sync/retry", authFetch);
      serverSawRunningRef.current = true;
    } catch {
      setSyncing(false);
      awaitSyncPreviewRef.current = false;
      sessionStorage.removeItem("ecom_daraz_await_sync_preview");
      sessionStorage.removeItem("ecom_daraz_syncing");
      setNotice("Could not start the re-sync. Please try again.");
      return;
    }
    setTimeout(loadSyncStatus, 1500);
  };

  const handleDisconnect = () => {
    setConnection(null);
    clearCachedConnection("daraz");
    setNotice("");
  };

  const handleImported = () => {
    loadSyncStatus();
  };

  const handleAutoSyncChange = async (enabled) => {
    setAutoSyncSaving(true);
    try {
      await ecomApiPost("daraz", "sync/auto-sync", authFetch, { enabled });
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
          platform="daraz"
          storeName={connection.storeName}
          storeSubtitle={connection.apiBase}
          syncStatus={connection.initialSyncStatus}
          erpImportStatus={connection.erpImportStatus}
          lastSyncedAt={connection.lastSyncedAt}
          counts={counts}
          pendingImportCount={connection.pendingImportCount}
          pendingConflictCount={connection.pendingConflictCount}
          unmappedLocationCount={connection.unmappedLocationCount}
          connection={connection}
          authFetch={authFetch}
          onDisconnect={handleDisconnect}
          onRetrySync={handleRetrySync}
          onImported={handleImported}
          showRetry
          retryBusy={syncInProgress}
          retryLabel={connection.initialSyncStatus === "failed" ? "Retry sync" : "Re-sync from Daraz"}
          syncStayWarning={syncInProgress}
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
      <h3 className="wh-card__title">Connect your Daraz store</h3>
      <p className="wh-muted" style={{ margin: "0.35rem 0 1.25rem" }}>
        Link your Daraz seller account to fetch warehouses, orders, products, and customers (from orders). You review and approve what gets added to your ERP. Product create/update and stock can push back to Daraz; customers and warehouses are pull/map only.
      </p>

      {notice && <p className="wh-form-message" style={{ marginBottom: "1rem" }}>{notice}</p>}

      <ol className="wh-list" style={{ marginBottom: "1.25rem" }}>
        {DARAZ_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <Button onClick={handleConnect} disabled={connecting}>
        {connecting ? "Redirecting…" : "Connect Daraz"}
      </Button>
    </Card>
  );
}
