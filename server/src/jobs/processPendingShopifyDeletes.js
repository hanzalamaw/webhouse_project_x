import {
  getStoreById,
  listDuePendingShopifyDeletes,
  markPendingShopifyDeleteStatus,
  softDeleteEntityLinkByInternalId,
  addSyncLog,
} from "../repositories/ecommerceRepository.js";
import {
  deleteCustomerFromShopify,
  deleteOrderFromShopify,
  deleteProductFromShopify,
  logPushResult,
} from "../services/ecommerce/shopifyWrite.js";
import { shopifyHardDeleteDelayLabel } from "../utils/shopifyDeferredDelete.js";

async function hardDeleteShopifyEntity(store, entityType, externalId) {
  if (entityType === "order") return deleteOrderFromShopify(store, externalId);
  if (entityType === "customer") return deleteCustomerFromShopify(store, externalId);
  if (entityType === "product") return deleteProductFromShopify(store, externalId);
  return { ok: false, error: `Unsupported entity type: ${entityType}` };
}

/**
 * Process due deferred Shopify hard-deletes (phase 2).
 * Run from the daily retention job when delete_after has passed.
 */
export async function processPendingShopifyDeletes() {
  let due = [];
  try {
    due = await listDuePendingShopifyDeletes(50);
  } catch (err) {
    // Table may not exist until migration 031 is applied.
    if (/ecom_pending_shopify_deletes|doesn't exist|ER_NO_SUCH_TABLE/i.test(err.message || "")) {
      console.warn(
        "[shopify-deferred-delete] table missing — run db/migrations/031_ecom_pending_shopify_deletes.sql",
      );
      return { processed: 0, succeeded: 0, failed: 0 };
    }
    throw err;
  }

  if (!due.length) return { processed: 0, succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;

  for (const row of due) {
    const label = `${row.entity_type}:${row.internal_id}`;
    const shopifyLabel = `${row.entity_type} shopify:${row.external_id}`;
    try {
      await markPendingShopifyDeleteStatus(row.id, "processing");
      console.log(`[shopify-deferred-delete] deleting ${label} (${shopifyLabel})…`);

      const store = await getStoreById(row.store_id, row.tenant_id);
      if (!store?.access_token) {
        await markPendingShopifyDeleteStatus(row.id, "failed", {
          lastError: "Store missing or disconnected",
        });
        console.warn(`[shopify-deferred-delete] failed ${label}: store missing or disconnected`);
        failed += 1;
        continue;
      }

      const result = await hardDeleteShopifyEntity(store, row.entity_type, row.external_id);
      await logPushResult(store.id, row.tenant_id, row.entity_type, row.external_id, {
        ok: result.ok,
        action: result.action || (result.ok ? "hard_deleted" : "hard_delete_failed"),
        error: result.error,
      });

      if (!result.ok) {
        await markPendingShopifyDeleteStatus(row.id, "failed", { lastError: result.error || "Delete failed" });
        await addSyncLog(store.id, row.tenant_id, {
          syncType: `erp_deferred_delete:${row.entity_type}`,
          externalId: String(row.external_id),
          status: "failed",
          message: result.error || "Shopify hard delete failed",
        });
        console.warn(`[shopify-deferred-delete] failed ${label}: ${result.error}`);
        failed += 1;
        continue;
      }

      await softDeleteEntityLinkByInternalId(
        row.tenant_id,
        row.entity_type,
        row.internal_id,
        "shopify",
      );
      await markPendingShopifyDeleteStatus(row.id, "completed", { completed: true });
      await addSyncLog(store.id, row.tenant_id, {
        syncType: `erp_deferred_delete:${row.entity_type}`,
        externalId: String(row.external_id),
        status: "success",
        message: `Hard-deleted from Shopify after deferred delay (${shopifyHardDeleteDelayLabel()})`,
      });
      console.log(`[shopify-deferred-delete] deleted ${label} from Shopify (and ERP was already soft-deleted)`);
      succeeded += 1;
    } catch (err) {
      const message = err?.message || String(err);
      try {
        await markPendingShopifyDeleteStatus(row.id, "failed", { lastError: message });
      } catch {
        // ignore secondary failure
      }
      console.error(`[shopify-deferred-delete] error ${label}:`, message);
      failed += 1;
    }
  }

  return { processed: due.length, succeeded, failed };
}
