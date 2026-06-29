import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { API_BASE } from "../../../../../config/api";
import { ecomApiGet, ecomApiPostEmpty } from "../api/ecommerceClient";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { FormField } from "../../../../../components/FormField";
import ConnectedStoreSummary from "./ConnectedStoreSummary";
import { friendlyConnectError } from "../utils/friendlyMessages";

const SHOPIFY_STEPS = [
  "Enter your Shopify store domain.",
  "Click Integrate — you will be redirected to Shopify.",
  "Install the app and approve access.",
  "Your orders, products, and customers will sync automatically.",
];

export default function ShopifyTab() {
  const { authFetch } = useAuth();
  const [shopInput, setShopInput] = useState("");
  const [connection, setConnection] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const pollRef = useRef(null);

  const connected = connection?.connected;
  const shopQuery = (shop) => (shop ? `?shop=${encodeURIComponent(shop)}` : "");

  const loadSyncStatus = useCallback(
    async (shop) => {
      const data = await ecomApiGet("shopify", `sync/status${shopQuery(shop)}`, authFetch);
      if (data.connected) setConnection(data);
      else setConnection(null);
      return data;
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
      setNotice("Store connected. We are syncing your data now.");
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
    pollRef.current = setInterval(() => loadSyncStatus(shop), 5000);
    return () => clearInterval(pollRef.current);
  }, [connected, connection?.shop, shopInput, loadSyncStatus]);

  const handleIntegrate = async () => {
    if (!shopInput.trim()) return;
    setNotice("");
    setConnecting(true);
    const shop = shopInput.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
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
    setNotice("Syncing your store…");
    await ecomApiPostEmpty("shopify", `sync/retry${shopQuery(shop)}`, authFetch);
    setTimeout(() => loadSyncStatus(shop), 1500);
  };

  const handleDisconnect = async () => {
    await ecomApiPostEmpty("shopify", "oauth/disconnect", authFetch);
    setConnection(null);
    setNotice("");
  };

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
          lastSyncedAt={connection.lastSyncedAt}
          counts={counts}
          onDisconnect={handleDisconnect}
          onRetrySync={handleRetrySync}
          showRetry={connection.initialSyncStatus === "failed"}
        />
      </>
    );
  }

  return (
    <Card>
      <h3 className="wh-card__title">Connect your Shopify store</h3>
      <p className="wh-muted" style={{ margin: "0.35rem 0 1.25rem" }}>
        Link your store to import orders, products, and customers into your ERP.
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
