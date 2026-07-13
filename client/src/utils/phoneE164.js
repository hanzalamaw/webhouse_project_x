/**
 * Client-side mirror of server phoneE164 helpers for form validation.
 * Shopify requires E.164 (e.g. +923001234567).
 */

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * @returns {string|undefined} E.164 phone or undefined if empty/invalid
 */
export function toShopifyPhone(raw, { defaultCountry = "PK" } = {}) {
  const original = String(raw || "").trim();
  if (!original) return undefined;

  let digits = digitsOnly(original);
  if (!digits) return undefined;

  if (digits.startsWith("00") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (original.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  if (String(defaultCountry).toUpperCase() === "PK") {
    if (digits.startsWith("92") && digits.length >= 11 && digits.length <= 13) {
      return `+${digits}`;
    }
    if (digits.startsWith("0") && (digits.length === 10 || digits.length === 11)) {
      return `+92${digits.slice(1)}`;
    }
    if (digits.startsWith("3") && digits.length === 10) {
      return `+92${digits}`;
    }
  }

  if (!digits.startsWith("0") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return undefined;
}

export function validatePhoneNumber(raw, { required = false, forShopify = false } = {}) {
  const value = String(raw || "").trim();
  if (!value) {
    return required ? "Phone number is required" : "";
  }
  const e164 = toShopifyPhone(value);
  if (!e164) {
    return forShopify
      ? "Enter a valid phone (e.g. 03001234567 or +923001234567)"
      : "Enter a valid phone number";
  }
  return "";
}
