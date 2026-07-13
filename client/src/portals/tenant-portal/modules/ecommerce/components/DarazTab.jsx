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
  const [notice, setNotice] = useState("");
  const [autoSyncSaving, setAutoSyncSaving] = useState(false);
  const pollRef = useRef(null);
  const prevSyncStatusRef = useRef(null);

  const connected = connection?.connected;

  const loadSyncStatus = useCallback(async () => {
    try {
      const data = await ecomApiGet("daraz", "sync/status", authFetch);
      if (data.connected) {
        setConnection(data);
        writeCachedConnection("daraz", data);
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
      setNotice("Store connected. We are fetching your data — you will review before anything is added to your ERP.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    loadSyncStatus();
  }, [loadSyncStatus]);

  useEffect(() => {
    if (!connected) return undefined;
    pollRef.current = setInterval(loadSyncStatus, 5000);
    return () => clearInterval(pollRef.current);
  }, [connected, loadSyncStatus]);

  useEffect(() => {
    const status = connection?.initialSyncStatus;
    const prev = prevSyncStatusRef.current;
    prevSyncStatusRef.current = status;
    if (!syncing) return;
    if (status === "completed" || status === "failed") {
      setSyncing(false);
      if (prev === "running" || prev === "pending") {
        setNotice(
          status === "completed"
            ? "Re-sync finished — warehouses, orders, products, and customers are up to date."
            : "Re-sync failed. Check sync status and try again.",
        );
      }
    }
  }, [connection?.initialSyncStatus, syncing]);

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
    setNotice("Re-syncing from Daraz… fetching warehouses, orders, products, and customers.");
    setConnection((prev) => (prev ? { ...prev, initialSyncStatus: "running" } : prev));
    try {
      await ecomApiPostEmpty("daraz", "sync/retry", authFetch);
    } catch {
      setSyncing(false);
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
          connection={connection}
          authFetch={authFetch}
          onDisconnect={handleDisconnect}
          onRetrySync={handleRetrySync}
          onImported={handleImported}
          showRetry
          retryBusy={syncing || connection.initialSyncStatus === "running"}
          retryLabel={connection.initialSyncStatus === "failed" ? "Retry sync" : "Re-sync from Daraz"}
          autoSyncEnabled={connection.autoSyncEnabled !== false}
          autoSyncSaving={autoSyncSaving}
          onAutoSyncChange={handleAutoSyncChange}
        />
      </>
    );
  }

  return (
    <Card>
      <h3 className="wh-card__title">Connect your Daraz store</h3>
      <p className="wh-muted" style={{ margin: "0.35rem 0 1.25rem" }}>
        Link your Daraz seller account to fetch orders, products, and customers. You review and approve what gets added to your ERP.
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
