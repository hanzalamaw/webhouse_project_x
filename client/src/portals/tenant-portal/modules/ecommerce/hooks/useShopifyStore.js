import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { ecomApiGet } from "../api/ecommerceClient";

/** Whether the tenant has a connected Shopify store (for create-time sync prompts). */
export function useShopifyStore() {
  const { authFetch } = useAuth();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ecomApiGet("shopify", "sync/status", authFetch);
      const next = data?.connected ? data : null;
      setStore(next);
      return next;
    } catch {
      setStore(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  return {
    connected: Boolean(store?.connected),
    storeName: store?.storeName || store?.store_name || "",
    loading,
    refresh,
  };
}
