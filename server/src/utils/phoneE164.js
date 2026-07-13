/**
 * Shopify requires E.164 phone numbers (e.g. +923001234567).
 * ERP users typically enter Pakistan local formats (03XX… / 3XX…).
 */

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * Convert a stored ERP phone to Shopify-safe E.164, or undefined if empty/unusable.
 * @param {string|null|undefined} raw
 * @param {{ defaultCountry?: string }} [opts]
 */
export function toShopifyPhone(raw, { defaultCountry = "PK" } = {}) {
  const original = String(raw || "").trim();
  if (!original) return undefined;

  let digits = digitsOnly(original);
  if (!digits) return undefined;

  // Strip international dial prefix 00…
  if (digits.startsWith("00") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  // Already international-looking (+… or leading country code after strip)
  if (original.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  if (String(defaultCountry).toUpperCase() === "PK") {
    // 923XXXXXXXXX (mobile) or 92 + area landline
    if (digits.startsWith("92") && digits.length >= 11 && digits.length <= 13) {
      return `+${digits}`;
    }
    // 03XXXXXXXXX mobile (11 digits) or 0XX landline (10–11 digits)
    if (digits.startsWith("0") && (digits.length === 10 || digits.length === 11)) {
      return `+92${digits.slice(1)}`;
    }
    // 3XXXXXXXXX mobile without leading 0
    if (digits.startsWith("3") && digits.length === 10) {
      return `+92${digits}`;
    }
  }

  // Generic international without '+': accept 10–15 digits that don't start with 0
  if (!digits.startsWith("0") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  // Don't send local-only numbers Shopify will reject
  return undefined;
}
