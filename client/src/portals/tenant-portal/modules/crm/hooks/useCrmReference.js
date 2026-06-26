import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";

export function useCrmReference() {
  const { authFetch } = useAuth();
  const [data, setData] = useState({ crm_users: [], tags: [], active_customer_days: 30 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/crm/reference", {}, authFetch);
      setData(res);
    } catch {
      setData({ crm_users: [], tags: [], active_customer_days: 30 });
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return { ...data, loading, reload: load };
}
