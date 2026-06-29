import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { apiFetch } from "../api/client";

const FiscalYearContext = createContext(null);

export function FiscalYearProvider({ children }) {
  const { user, authFetch } = useAuth();
  const [fiscalYearStart, setFiscalYearStart] = useState(null);

  const loadFiscalYear = useCallback(() => {
    if (user?.portal !== "tenant") {
      setFiscalYearStart(null);
      return Promise.resolve();
    }
    return apiFetch("/tenant/organization-settings", {}, authFetch)
      .then((res) => {
        setFiscalYearStart(res.data?.fiscal_year_start || null);
      })
      .catch(() => {
        setFiscalYearStart(null);
      });
  }, [user?.portal, authFetch]);

  useEffect(() => {
    loadFiscalYear();
  }, [loadFiscalYear]);

  useEffect(() => {
    const handler = () => {
      loadFiscalYear();
    };
    window.addEventListener("tenant-org-updated", handler);
    return () => window.removeEventListener("tenant-org-updated", handler);
  }, [loadFiscalYear]);

  return (
    <FiscalYearContext.Provider value={fiscalYearStart}>
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYear() {
  return useContext(FiscalYearContext);
}
