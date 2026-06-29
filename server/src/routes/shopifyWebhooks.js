import { getStoreByShop, disconnectStore } from "../repositories/ecommerceRepository.js";
import { verifyShopifyWebhook } from "../services/ecommerce/shopifyWebhooks.js";
import { handleWebhookPayload } from "../services/ecommerce/shopifySync.js";

export async function shopifyWebhookHandler(req, res) {
  if (!verifyShopifyWebhook(req)) {
    return res.status(401).send("Invalid HMAC");
  }

  const shop = req.get("X-Shopify-Shop-Domain");
  const topic = req.get("X-Shopify-Topic");

  if (!shop || !topic) {
    return res.status(400).send("Missing headers");
  }

  const store = await getStoreByShop(shop);
  if (!store) {
    return res.status(404).send("Store not connected");
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  try {
    const result = await handleWebhookPayload(store, topic, payload);
    if (result.action === "uninstalled") {
      await disconnectStore(store.id);
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Error");
  }
}
