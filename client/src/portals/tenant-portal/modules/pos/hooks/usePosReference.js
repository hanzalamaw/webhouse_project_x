import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";

export function usePosReference(outletId = null) {
  const { authFetch } = useAuth();
  const [data, setData] = useState({ categories: [], outlets: [], products: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = outletId ? `?outlet_id=${outletId}` : "";
      const ref = await apiFetch(`/pos/inventory/reference${qs}`, {}, authFetch);
      setData(ref);
    } catch {
      setData({ categories: [], outlets: [], products: [] });
    } finally {
      setLoading(false);
    }
  }, [authFetch, outletId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  return { ...data, loading, reload: load };
}
