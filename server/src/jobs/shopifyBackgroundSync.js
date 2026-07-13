import { listConnectedShopifyStoresForAutoSync } from "../repositories/ecommerceRepository.js";
import { pollShopifyStoreChanges } from "../services/ecommerce/shopifySync.js";

const running = new Set();

/** Poll all auto-sync Shopify stores for recent changes and import into the ERP. */
export async function runShopifyBackgroundSync() {
  let stores;
  try {
    stores = await listConnectedShopifyStoresForAutoSync();
  } catch (err) {
    console.error("[shopifyBackgroundSync] list stores failed:", err?.message || err);
    return;
  }

  for (const store of stores) {
    if (running.has(store.id)) continue;
    running.add(store.id);
    try {
      const counts = await pollShopifyStoreChanges(store);
      const total = (counts.products || 0) + (counts.orders || 0) + (counts.customers || 0);
      if (total > 0) {
        console.log(
          `[shopifyBackgroundSync] store ${store.store_name || store.id}: ` +
            `${counts.products} product(s), ${counts.orders} order(s), ${counts.customers} customer(s)`,
        );
      }
    } catch (err) {
      console.error(`[shopifyBackgroundSync] store ${store.id} failed:`, err?.message || err);
    } finally {
      running.delete(store.id);
    }
  }
}
