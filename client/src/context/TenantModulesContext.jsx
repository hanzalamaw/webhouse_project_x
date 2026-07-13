import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiFetch } from "../api/client";
import { filterAssignedModules } from "../portals/tenant-portal/modules/registry";

const TenantModulesContext = createContext(null);

export function TenantModulesProvider({ children }) {
  const { authFetch, user } = useAuth();
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (user?.portal !== "tenant") {
      setAssigned([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/tenant/modules", {}, authFetch);
      setAssigned(res.data || []);
    } catch (err) {
      setAssigned([]);
      setError(err.message || "Could not load modules.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, user?.portal]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const visible = useMemo(() => filterAssignedModules(assigned), [assigned]);

  const value = useMemo(
    () => ({ assigned, visible, loading, error, reload: load }),
    [assigned, visible, loading, error, load]
  );

  return (
    <TenantModulesContext.Provider value={value}>{children}</TenantModulesContext.Provider>
  );
}

export function useTenantModulesContext() {
  return useContext(TenantModulesContext);
}
