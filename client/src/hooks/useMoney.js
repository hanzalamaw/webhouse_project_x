import { useMemo } from "react";
import { useTenantCurrency } from "../context/FiscalYearContext";
import {
  currencyFieldSuffix,
  currencyPrefix,
  formatCompactMoney,
  formatMoney,
} from "../utils/currency";

/** Money helpers bound to the tenant's selected organization currency. */
export function useMoney() {
  const currency = useTenantCurrency();

  return useMemo(
    () => ({
      currency,
      prefix: currencyPrefix(currency),
      fieldSuffix: currencyFieldSuffix(currency),
      format: (amount) => formatMoney(amount, currency),
      formatCompact: (amount) => formatCompactMoney(amount, currency),
      amountLabel: (base = "Amount") => `${base} ${currencyFieldSuffix(currency)}`,
    }),
    [currency]
  );
}
