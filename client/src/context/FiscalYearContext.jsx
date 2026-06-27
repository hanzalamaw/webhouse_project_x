import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiFetch } from "../api/client";

const FiscalYearContext = createContext(null);

export function FiscalYearProvider({ children }) {
  const { user, authFetch } = useAuth();
  const [fiscalYearStart, setFiscalYearStart] = useState(null);

  useEffect(() => {
    if (user?.portal !== "tenant") {
      setFiscalYearStart(null);
      return;
    }
    let active = true;
    apiFetch("/tenant/organization-settings", {}, authFetch)
      .then((data) => {
        if (active) setFiscalYearStart(data?.fiscal_year_start || null);
      })
      .catch(() => {
        if (active) setFiscalYearStart(null);
      });
    return () => { active = false; };
  }, [user?.portal, authFetch]);

  return (
    <FiscalYearContext.Provider value={fiscalYearStart}>
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYear() {
  return useContext(FiscalYearContext);
}
