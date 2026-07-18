export function friendlyConnectError(message) {
  const raw = String(message || "").trim();
  const msg = raw.toLowerCase();
  if (!msg) return "Something went wrong. Please try again.";
  if (msg.includes("invalid shop domain")) {
    return "Enter a valid Shopify domain, e.g. mystore or mystore.myshopify.com";
  }
  if (msg.includes("expired") || msg.includes("invalid_state")) {
    return "Your connection session expired. Please try connecting again.";
  }
  if (msg.includes("shop mismatch")) {
    return raw;
  }
  if (msg.includes("not configured") || msg.includes("503")) {
    return "This integration is not available right now. Please contact your administrator.";
  }
  if (msg.includes("tenant isolation") || msg.includes("tenant context")) {
    return "Connection could not start due to a server configuration issue. Please try again or contact support.";
  }
  if (raw.length < 200) return raw;
  return "We could not complete the connection. Please try again.";
}

/** Map Daraz push/sync errors to clearer copy for product forms. */
export function friendlyDarazSyncError(message) {
  const raw = String(message || "").trim();
  if (!raw) return "Daraz sync failed. Please try again.";
  const lower = raw.toLowerCase();
  if (/4104|price.?precision|biz_check_price_precision/.test(lower)) {
    return raw.includes("whole-number")
      ? raw
      : `${raw} Use a whole-number price for Daraz Pakistan (e.g. 1500).`;
  }
  if (/e500|create product failed|system_exception/.test(lower)) {
    return raw.length > 80
      ? raw
      : `${raw} Try brand "No Brand", a unique Seller SKU, and a whole-number price.`;
  }
  if (/could not match.*sku|seller skus/.test(lower)) {
    return raw;
  }
  if (/campaign|locked/.test(lower) && /501|e501|update product failed/.test(lower)) {
    return `${raw} This listing may be locked by a Daraz campaign.`;
  }
  return raw.length < 400 ? raw : "Daraz sync failed. Check Integrations → Push log for details.";
}

export const SYNC_STATUS_USER = {
  pending: "Waiting to sync",
  running: "Syncing your store…",
  completed: "Data fetched — review import",
  failed: "Sync interrupted",
};

export const ERP_IMPORT_STATUS_USER = {
  pending: "Not imported yet",
  in_progress: "Importing…",
  partial: "Partially imported",
  completed: "Imported to ERP",
};
