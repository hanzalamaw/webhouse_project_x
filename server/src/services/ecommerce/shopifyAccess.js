import { shopifyClient } from "./shopifyClient.js";
import { getShopifyConfig } from "./shopifyConfig.js";
import {
  formatShopifyError,
  isScopeApprovalError,
  buildScopeSetupMessage,
} from "./shopifyErrors.js";

export const SCOPE_PROBES = [
  { scope: "read_orders", path: "/orders.json", params: { limit: 1, status: "any" } },
  { scope: "read_products", path: "/products.json", params: { limit: 1 } },
  { scope: "read_customers", path: "/customers.json", params: { limit: 1 } },
  { scope: "read_inventory", path: "/locations.json", params: { limit: 1 } },
];

export const WEBHOOK_TOPIC_SCOPES = {
  ORDERS_CREATE: "read_orders",
  ORDERS_UPDATED: "read_orders",
  ORDERS_CANCELLED: "read_orders",
  ORDERS_FULFILLED: "read_orders",
  ORDERS_PAID: "read_orders",
  ORDERS_PARTIALLY_FULFILLED: "read_orders",
  PRODUCTS_CREATE: "read_products",
  PRODUCTS_UPDATE: "read_products",
  PRODUCTS_DELETE: "read_products",
  CUSTOMERS_CREATE: "read_customers",
  CUSTOMERS_UPDATE: "read_customers",
  CUSTOMERS_DELETE: "read_customers",
  INVENTORY_LEVELS_UPDATE: "read_inventory",
  APP_UNINSTALLED: null,
};

export function parseGrantedScopes(scopeString) {
  return (scopeString || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getRequiredScopes() {
  const config = getShopifyConfig();
  return parseGrantedScopes(config.scopes);
}

export async function verifyStoreApiAccess(store) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const granted = [];
  const missing = [];
  const errors = [];

  for (const probe of SCOPE_PROBES) {
    try {
      await client.get(probe.path, { params: probe.params });
      granted.push(probe.scope);
    } catch (error) {
      missing.push(probe.scope);
      errors.push({ scope: probe.scope, message: formatShopifyError(error) });
    }
  }

  const scopeIssue = errors.some((e) => isScopeApprovalError(e.message));

  return {
    ok: missing.length === 0,
    granted,
    missing,
    errors,
    scopeIssue,
    setupMessage: scopeIssue ? buildScopeSetupMessage(missing) : null,
  };
}

export function canRegisterWebhookTopic(topic, grantedScopes) {
  const required = WEBHOOK_TOPIC_SCOPES[topic];
  if (!required) return true;
  return grantedScopes.includes(required);
}
