const SKIP_REASON_MESSAGES = {
  no_store: "No Shopify store is connected. Connect Shopify in Integrations first.",
  not_linked: "This record is not linked to Shopify.",
  store_disconnected: "The Shopify store is disconnected.",
  unsupported_entity: "This record type cannot be synced to Shopify.",
  shopify_variant_not_found: "Could not match variants in Shopify.",
  variant_not_found: "Variant not found in ERP.",
  zero_adjustment: "No Shopify inventory adjustment needed.",
  no_mapped_warehouse_locations: "Map at least one warehouse to a Shopify location in Integrations.",
};

/**
 * User-facing message when ERP changes are rolled back because Shopify rejected the update.
 */
export function formatShopifySyncError(detail, label = "record") {
  const text = String(detail || "").trim();
  if (!text) {
    return `Changes were not saved. Shopify did not accept the ${label.toLowerCase()} change.`;
  }
  if (/^changes were not saved/i.test(text)) return text;
  return `Changes were not saved. Shopify sync failed: ${text}`;
}

function shopifyFailureDetail(push, label) {
  if (push.skipped) {
    const reason = push.reason || "skipped";
    return SKIP_REASON_MESSAGES[reason] || `${label} could not be synced to Shopify (${reason}).`;
  }
  return push.error || push.warnings?.join("; ") || `Shopify did not accept the ${label.toLowerCase()} change.`;
}

/**
 * When Shopify push was attempted, treat any failure, skip (except not_linked), or warning as a hard error.
 * Callers must roll back ERP changes when this throws.
 */
export function requireShopifySync(push, label = "Record") {
  if (!push) {
    throw new Error(formatShopifySyncError(null, label));
  }
  if (push.skipped && push.reason !== "not_linked") {
    throw new Error(formatShopifySyncError(shopifyFailureDetail(push, label), label));
  }
  if (!push.skipped && !push.ok) {
    throw new Error(formatShopifySyncError(shopifyFailureDetail(push, label), label));
  }
  if (!push.skipped && push.warnings?.length) {
    throw new Error(formatShopifySyncError(push.warnings.join("; "), label));
  }
  return push;
}

/** Require Shopify success only when the record is linked (skipped not_linked is OK). */
export function requireShopifySyncIfLinked(push, label = "Record") {
  if (!push || (push.skipped && ["not_linked", "zero_adjustment"].includes(push.reason))) return push;
  return requireShopifySync(push, label);
}
