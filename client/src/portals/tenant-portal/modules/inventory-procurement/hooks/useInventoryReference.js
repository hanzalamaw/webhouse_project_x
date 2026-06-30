import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";

export function useInventoryReference() {
  const { authFetch } = useAuth();
  const [data, setData] = useState({ categories: [], warehouses: [], products: [], variants: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ref = await apiFetch("/inventory/reference", {}, authFetch);
      setData(ref);
    } catch {
      setData({ categories: [], warehouses: [], products: [], variants: [] });
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return { ...data, loading, reload: load };
}
