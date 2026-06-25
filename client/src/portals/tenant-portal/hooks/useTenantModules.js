import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { apiFetch } from "../../../api/client";
import { filterAssignedModules } from "../modules/registry";

export function useTenantModules() {
  const { authFetch } = useAuth();
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch("/tenant/modules", {}, authFetch);
        if (!cancelled) setAssigned(res.data || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load modules.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  const visible = useMemo(() => filterAssignedModules(assigned), [assigned]);

  return { assigned, visible, loading, error };
}
