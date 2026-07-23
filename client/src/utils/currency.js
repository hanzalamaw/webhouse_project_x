import {
  currencyFieldSuffix,
  currencyPrefix,
  getTenantCurrency,
  setTenantCurrency,
} from "./tenantCurrency";

export { currencyFieldSuffix, currencyPrefix, getTenantCurrency, setTenantCurrency };

const MONEY_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COMPACT_MONEY_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function withPrefix(prefix, formattedNumber) {
  const spaced = prefix.endsWith(" ") ? prefix : `${prefix} `;
  return `${spaced}${formattedNumber}`;
}

/** Format a numeric amount with thousands separators (e.g. 1,234,567.89). */
export function formatNumber(amount, options = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    return options.fallback ?? "0.00";
  }
  const min = options.minimumFractionDigits ?? 2;
  const max = options.maximumFractionDigits ?? 2;
  if (min === 2 && max === 2) {
    return MONEY_FORMAT.format(n);
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(n);
}

/**
 * Format money using the tenant's organization currency (or an explicit code).
 * Legacy name `formatPKR` kept so existing imports keep working.
 */
export function formatMoney(amount, currencyCode = getTenantCurrency()) {
  const prefix = currencyPrefix(currencyCode);
  if (amount == null || amount === "") return withPrefix(prefix, "0.00");
  const n = Number(amount);
  if (!Number.isFinite(n)) return withPrefix(prefix, "0.00");
  return withPrefix(prefix, MONEY_FORMAT.format(n));
}

/** Follows the tenant organization currency. */
export function formatPKR(amount) {
  return formatMoney(amount);
}

/** Compact money label for charts (e.g. Rs. 1.2M / $45.5k). */
export function formatCompactMoney(amount, currencyCode = getTenantCurrency()) {
  const prefix = currencyPrefix(currencyCode);
  const n = Number(amount) || 0;
  if (n >= 1_000_000) {
    return withPrefix(prefix, `${COMPACT_MONEY_FORMAT.format(n / 1_000_000)}M`);
  }
  if (n >= 1_000) {
    return withPrefix(prefix, `${COMPACT_MONEY_FORMAT.format(n / 1_000)}k`);
  }
  return formatMoney(Math.round(n), currencyCode);
}

/** Follows the tenant organization currency. */
export function formatCompactPKR(amount) {
  return formatCompactMoney(amount);
}

export const LOGIN_PORTAL_OPTIONS = [
  { value: "erp1", label: "ERP 1" },
  { value: "erp2", label: "ERP 2" },
  { value: "erp3", label: "ERP 3" },
];
