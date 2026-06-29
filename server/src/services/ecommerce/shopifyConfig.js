const DEFAULT_SCOPES =
  "read_orders,read_all_orders,read_products,read_customers,read_inventory,read_locations";

export const WEBHOOK_TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "ORDERS_FULFILLED",
  "ORDERS_PAID",
  "ORDERS_PARTIALLY_FULFILLED",
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "CUSTOMERS_CREATE",
  "CUSTOMERS_UPDATE",
  "CUSTOMERS_DELETE",
  "INVENTORY_LEVELS_UPDATE",
  "APP_UNINSTALLED",
];

export const SHOPIFY_WEBHOOK_TOPIC = {
  ORDERS_CREATE: "orders/create",
  ORDERS_UPDATED: "orders/updated",
  ORDERS_CANCELLED: "orders/cancelled",
  ORDERS_FULFILLED: "orders/fulfilled",
  ORDERS_PAID: "orders/paid",
  ORDERS_PARTIALLY_FULFILLED: "orders/partially_fulfilled",
  PRODUCTS_CREATE: "products/create",
  PRODUCTS_UPDATE: "products/update",
  PRODUCTS_DELETE: "products/delete",
  CUSTOMERS_CREATE: "customers/create",
  CUSTOMERS_UPDATE: "customers/update",
  CUSTOMERS_DELETE: "customers/delete",
  INVENTORY_LEVELS_UPDATE: "inventory_levels/update",
  APP_UNINSTALLED: "app/uninstalled",
};

export function toShopifyWebhookTopic(topicKey) {
  return SHOPIFY_WEBHOOK_TOPIC[topicKey] || topicKey.toLowerCase();
}

export function getShopifyConfig() {
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const apiSecret = process.env.SHOPIFY_API_SECRET || "";
  const scopes = process.env.SHOPIFY_SCOPES || DEFAULT_SCOPES;
  const webhookBaseUrl = (process.env.SHOPIFY_WEBHOOK_BASE_URL || "").replace(/\/$/, "");
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  const explicitRedirect = (process.env.SHOPIFY_REDIRECT_URI || "").trim();
  const webhookCallback = webhookBaseUrl ? `${webhookBaseUrl}/api/shopify/oauth/callback` : "";

  let redirectUri =
    explicitRedirect || webhookCallback || `${frontendUrl}/api/shopify/oauth/callback`;
  if (webhookCallback && (!explicitRedirect || explicitRedirect.includes("localhost"))) {
    redirectUri = webhookCallback;
  }

  return {
    apiKey,
    apiSecret,
    scopes,
    redirectUri,
    frontendUrl,
    frontendIntegrationsUrl: `${frontendUrl}/app/m/ecommerce/integrations`,
    webhookBaseUrl,
    webhookAddress: webhookBaseUrl
      ? `${webhookBaseUrl.replace(/\/$/, "")}/api/shopify/webhooks`
      : null,
    oauthConfigured: Boolean(apiKey && apiSecret),
    webhooksConfigured: Boolean(webhookBaseUrl),
  };
}

export function normalizeShopDomain(shop) {
  let domain = (shop || "").trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!domain.includes(".")) {
    domain = `${domain}.myshopify.com`;
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new Error("Invalid shop domain. Use mystore or mystore.myshopify.com");
  }
  return domain;
}
