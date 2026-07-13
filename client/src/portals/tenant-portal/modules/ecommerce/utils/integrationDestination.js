import { INTEGRATION_DESTINATIONS } from "../constants";

/**
 * Map UI destination choice to sync flags and ERP source fields.
 */
export function resolveIntegrationSave(destination, { shopifyConnected, darazConnected } = {}) {
  if (destination === INTEGRATION_DESTINATIONS.SHOPIFY) {
    if (!shopifyConnected) {
      return { error: "Connect Shopify in Integrations before saving to Shopify." };
    }
    return {
      syncToShopify: true,
      syncToDaraz: false,
      source: "shopify",
      orderSource: "shopify",
    };
  }

  if (destination === INTEGRATION_DESTINATIONS.DARAZ) {
    if (!darazConnected) {
      return { error: "Connect Daraz in Integrations before saving to Daraz." };
    }
    return {
      syncToShopify: false,
      syncToDaraz: true,
      source: "daraz",
      orderSource: "daraz",
    };
  }

  return {
    syncToShopify: false,
    syncToDaraz: false,
    source: "manual",
    orderSource: "manual",
  };
}

export function destinationHelpText(destination, { shopifyStoreName, darazStoreName } = {}) {
  if (destination === INTEGRATION_DESTINATIONS.SHOPIFY) {
    return `Also creates or updates this record in Shopify${shopifyStoreName ? ` (${shopifyStoreName})` : ""}.`;
  }
  if (destination === INTEGRATION_DESTINATIONS.DARAZ) {
    return `Also creates or updates this product in Daraz${darazStoreName ? ` (${darazStoreName})` : ""}. Stock and prices sync on save.`;
  }
  return "Saved to your ERP inventory catalog. No store sync.";
}

/**
 * Auto-resolve save when editing a record already linked to Shopify or Daraz.
 */
export function resolveLinkedEditSave(link, entitySource = "manual") {
  if (!link?.platform) return null;

  if (link.platform === "shopify") {
    return {
      syncToShopify: true,
      syncToDaraz: false,
      source: entitySource || "shopify",
      orderSource: entitySource || "shopify",
    };
  }

  if (link.platform === "daraz") {
    return {
      syncToShopify: false,
      syncToDaraz: true,
      source: "daraz",
      orderSource: "daraz",
    };
  }

  return null;
}
