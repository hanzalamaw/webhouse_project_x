import crypto from "crypto";
import { getShopifyConfig } from "./shopifyConfig.js";

export function verifyShopifyWebhook(req) {
  const config = getShopifyConfig();
  const hmac = req.get("X-Shopify-Hmac-Sha256");
  if (!hmac || !config.apiSecret) return false;

  const digest = crypto.createHmac("sha256", config.apiSecret).update(req.body).digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch {
    return false;
  }
}

export function topicToEntityType(topic) {
  if (topic.startsWith("orders/")) return "order";
  if (topic.startsWith("products/")) return "product";
  if (topic.startsWith("customers/")) return "customer";
  if (topic === "inventory_levels/update") return "inventory";
  return null;
}

export function topicToSyncType(topic) {
  return `webhook:${topic}`;
}
