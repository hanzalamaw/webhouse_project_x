import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { ecomApiGet } from "../api/ecommerceClient";

/** Connected Shopify + Daraz stores for create-time destination pickers. */
export function useConnectedEcomStores() {
  const { authFetch } = useAuth();
  const [shopify, setShopify] = useState(null);
  const [daraz, setDaraz] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [shopifyRes, darazRes] = await Promise.allSettled([
        ecomApiGet("shopify", "sync/status", authFetch),
        ecomApiGet("daraz", "sync/status", authFetch),
      ]);
      setShopify(shopifyRes.status === "fulfilled" && shopifyRes.value?.connected ? shopifyRes.value : null);
      setDaraz(darazRes.status === "fulfilled" && darazRes.value?.connected ? darazRes.value : null);
      return {
        shopify: shopifyRes.status === "fulfilled" && shopifyRes.value?.connected ? shopifyRes.value : null,
        daraz: darazRes.status === "fulfilled" && darazRes.value?.connected ? darazRes.value : null,
      };
    } catch {
      setShopify(null);
      setDaraz(null);
      return { shopify: null, daraz: null };
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  return {
    loading,
    refresh,
    shopifyConnection: shopify,
    darazConnection: daraz,
    shopifyConnected: Boolean(shopify?.connected),
    darazConnected: Boolean(daraz?.connected),
    shopifyStoreName: shopify?.storeName || shopify?.store_name || "",
    darazStoreName: daraz?.storeName || daraz?.store_name || "",
    anyConnected: Boolean(shopify?.connected || daraz?.connected),
  };
}
