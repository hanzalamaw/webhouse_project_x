export function formatShopifyError(error) {
  const data = error?.response?.data;
  if (!data) return error?.message || "Unknown error";

  if (typeof data.errors === "string") return data.errors;
  if (typeof data.error === "string") return data.error;
  if (data.error_description) return String(data.error_description);

  if (data.errors && typeof data.errors === "object") {
    const parts = [];
    for (const [key, value] of Object.entries(data.errors)) {
      const val = Array.isArray(value) ? value.join(", ") : String(value);
      parts.push(key === "base" ? val : `${key}: ${val}`);
    }
    return parts.join("; ") || JSON.stringify(data.errors);
  }

  return JSON.stringify(data);
}

export function isScopeApprovalError(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("merchant approval") ||
    text.includes("protected customer data") ||
    text.includes("missing access scope") ||
    text.includes("not approved to access")
  );
}

export function buildScopeSetupMessage(missingScopes = []) {
  const scopeList = missingScopes.length
    ? missingScopes.join(", ")
    : "read_orders, read_products, read_customers";
  return [
    `Shopify did not grant API scopes: ${scopeList}.`,
    "Fix in Partners → Apps → your app:",
    "1. Versions → configure Admin API scopes (read_orders, read_products, read_customers, read_inventory, read_locations) → Release",
    "2. API access requests → Protected customer data → select Order/Product/Customer fields → save (auto-approved on dev stores)",
    "3. Uninstall the app from the store, then click Integrate again to re-approve scopes.",
  ].join(" ");
}
