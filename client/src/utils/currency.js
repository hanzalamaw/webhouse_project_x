const MONEY_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COMPACT_MONEY_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

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

/** Pakistani Rupee display — always includes comma-separated thousands. */
export function formatPKR(amount) {
  if (amount == null || amount === "") return "Rs. 0.00";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "Rs. 0.00";
  return `Rs. ${MONEY_FORMAT.format(n)}`;
}

/** Shorter PKR label for charts (e.g. Rs. 1.2M, Rs. 45.5k). */
export function formatCompactPKR(amount) {
  const n = Number(amount) || 0;
  if (n >= 1_000_000) {
    return `Rs. ${COMPACT_MONEY_FORMAT.format(n / 1_000_000)}M`;
  }
  if (n >= 1_000) {
    return `Rs. ${COMPACT_MONEY_FORMAT.format(n / 1_000)}k`;
  }
  return formatPKR(Math.round(n));
}

export const LOGIN_PORTAL_OPTIONS = [
  { value: "erp1", label: "ERP 1" },
  { value: "erp2", label: "ERP 2" },
  { value: "erp3", label: "ERP 3" },
];
