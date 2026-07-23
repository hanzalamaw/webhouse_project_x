/** Active tenant display currency (set from organization settings). */
let tenantCurrencyCode = "PKR";

export function setTenantCurrency(code) {
  const next = String(code || "PKR").trim().toUpperCase() || "PKR";
  tenantCurrencyCode = next;
  return tenantCurrencyCode;
}

export function getTenantCurrency() {
  return tenantCurrencyCode || "PKR";
}

/** Common display prefixes; unknown codes fall back to "CODE ". */
const CURRENCY_PREFIX = {
  PKR: "Rs.",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "AED",
  SAR: "SAR",
  INR: "₹",
  CAD: "CA$",
  AUD: "A$",
  CNY: "CN¥",
  JPY: "¥",
  CHF: "CHF",
  MYR: "RM",
  SGD: "S$",
  BDT: "৳",
  AFN: "؋",
};

export function currencyPrefix(code = getTenantCurrency()) {
  const c = String(code || "PKR").toUpperCase();
  return CURRENCY_PREFIX[c] || `${c} `;
}

/** Label suffix for amount fields, e.g. "(USD)" or "(Rs.)" for PKR. */
export function currencyFieldSuffix(code = getTenantCurrency()) {
  const c = String(code || "PKR").toUpperCase();
  if (c === "PKR") return "(Rs.)";
  return `(${c})`;
}
