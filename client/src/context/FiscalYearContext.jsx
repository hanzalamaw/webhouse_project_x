import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { apiFetch } from "../api/client";
import { getTenantCurrency, setTenantCurrency } from "../utils/tenantCurrency";

const FiscalYearContext = createContext(null);

export function FiscalYearProvider({ children }) {
  const { user, authFetch } = useAuth();
  const [fiscalYearStart, setFiscalYearStart] = useState(null);
  const [currency, setCurrency] = useState(() => getTenantCurrency());

  const loadOrgSettings = useCallback(() => {
    if (user?.portal !== "tenant") {
      setFiscalYearStart(null);
      setCurrency(setTenantCurrency("PKR"));
      return Promise.resolve();
    }
    return apiFetch("/tenant/organization-settings", {}, authFetch)
      .then((res) => {
        setFiscalYearStart(res.data?.fiscal_year_start || null);
        const next = setTenantCurrency(res.data?.currency || "PKR");
        setCurrency(next);
      })
      .catch(() => {
        setFiscalYearStart(null);
        setCurrency(setTenantCurrency("PKR"));
      });
  }, [user?.portal, authFetch]);

  useEffect(() => {
    loadOrgSettings();
  }, [loadOrgSettings]);

  useEffect(() => {
    const handler = () => {
      loadOrgSettings();
    };
    window.addEventListener("tenant-org-updated", handler);
    return () => window.removeEventListener("tenant-org-updated", handler);
  }, [loadOrgSettings]);

  const value = useMemo(
    () => ({ fiscalYearStart, currency }),
    [fiscalYearStart, currency]
  );

  return (
    <FiscalYearContext.Provider value={value}>
      {/* Re-render tenant UI when currency changes so formatPKR/labels update everywhere. */}
      <CurrencyBridge currency={currency}>{children}</CurrencyBridge>
    </FiscalYearContext.Provider>
  );
}

function CurrencyBridge({ currency, children }) {
  void currency;
  return children;
}

/** Fiscal year start date from organization settings. */
export function useFiscalYear() {
  const ctx = useContext(FiscalYearContext);
  return ctx?.fiscalYearStart ?? null;
}

/** Tenant display currency code (e.g. PKR, USD). */
export function useTenantCurrency() {
  const ctx = useContext(FiscalYearContext);
  return ctx?.currency || getTenantCurrency();
}
