import {
  getStoreById,
  listDuePendingShopifyDeletes,
  markPendingShopifyDeleteStatus,
  softDeleteEntityLinkByInternalId,
  softDeleteLocationLinkByWarehouse,
  addSyncLog,
} from "../repositories/ecommerceRepository.js";
import {
  deleteCustomerFromShopify,
  deleteOrderFromShopify,
  deleteProductFromShopify,
  deleteLocationFromShopify,
  logPushResult,
} from "../services/ecommerce/shopifyWrite.js";
import { removeProductFromDaraz, logDarazPushResult } from "../services/ecommerce/darazWrite.js";
import { shopifyHardDeleteDelayLabel } from "../utils/shopifyDeferredDelete.js";

async function hardDeleteShopifyEntity(store, entityType, externalId) {
  if (entityType === "order") return deleteOrderFromShopify(store, externalId);
  if (entityType === "customer") return deleteCustomerFromShopify(store, externalId);
  if (entityType === "product") return deleteProductFromShopify(store, externalId);
  if (entityType === "warehouse") return deleteLocationFromShopify(store, externalId);
  return { ok: false, error: `Unsupported entity type: ${entityType}` };
}

async function hardDeleteDarazEntity(store, entityType, externalId) {
  if (entityType === "product") return removeProductFromDaraz(store, externalId);
  return { ok: false, error: `Unsupported Daraz entity type: ${entityType}` };
}

/**
 * Process due deferred marketplace hard-deletes (phase 2) for Shopify and Daraz.
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
        "[marketplace-deferred-delete] table missing — run db/migrations/031_ecom_pending_shopify_deletes.sql",
      );
      return { processed: 0, succeeded: 0, failed: 0 };
    }
    throw err;
  }

  if (!due.length) return { processed: 0, succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;

  for (const row of due) {
    const platform = String(row.platform || "shopify").toLowerCase();
    const label = `${row.entity_type}:${row.internal_id}`;
    const remoteLabel = `${row.entity_type} ${platform}:${row.external_id}`;
    const logPrefix = `[${platform}-deferred-delete]`;
    try {
      await markPendingShopifyDeleteStatus(row.id, "processing");
      console.log(`${logPrefix} deleting ${label} (${remoteLabel})…`);

      const store = await getStoreById(row.store_id, row.tenant_id);
      if (!store?.access_token) {
        await markPendingShopifyDeleteStatus(row.id, "failed", {
          lastError: "Store missing or disconnected",
        });
        console.warn(`${logPrefix} failed ${label}: store missing or disconnected`);
        failed += 1;
        continue;
      }

      const result = platform === "daraz"
        ? await hardDeleteDarazEntity(store, row.entity_type, row.external_id)
        : await hardDeleteShopifyEntity(store, row.entity_type, row.external_id);

      if (platform === "daraz") {
        await logDarazPushResult(store.id, row.tenant_id, row.entity_type, row.external_id, {
          ok: result.ok,
          action: result.action || (result.ok ? "hard_deleted" : "hard_delete_failed"),
          error: result.error,
        });
      } else {
        await logPushResult(store.id, row.tenant_id, row.entity_type, row.external_id, {
          ok: result.ok,
          action: result.action || (result.ok ? "hard_deleted" : "hard_delete_failed"),
          error: result.error,
        });
      }

      if (!result.ok) {
        await markPendingShopifyDeleteStatus(row.id, "failed", { lastError: result.error || "Delete failed" });
        await addSyncLog(store.id, row.tenant_id, {
          syncType: `erp_deferred_delete:${row.entity_type}`,
          externalId: String(row.external_id),
          status: "failed",
          message: result.error || `${platform} hard delete failed`,
        });
        console.warn(`${logPrefix} failed ${label}: ${result.error}`);
        failed += 1;
        continue;
      }

      await softDeleteEntityLinkByInternalId(
        row.tenant_id,
        row.entity_type,
        row.internal_id,
        platform,
      );
      if (platform === "shopify" && row.entity_type === "warehouse") {
        await softDeleteLocationLinkByWarehouse(row.tenant_id, row.internal_id);
      }
      await markPendingShopifyDeleteStatus(row.id, "completed", { completed: true });
      await addSyncLog(store.id, row.tenant_id, {
        syncType: `erp_deferred_delete:${row.entity_type}`,
        externalId: String(row.external_id),
        status: "success",
        message: `Hard-deleted from ${platform} after deferred delay (${shopifyHardDeleteDelayLabel()})`,
      });
      console.log(`${logPrefix} deleted ${label} from ${platform} (ERP was already soft-deleted)`);
      succeeded += 1;
    } catch (err) {
      const message = err?.message || String(err);
      try {
        await markPendingShopifyDeleteStatus(row.id, "failed", { lastError: message });
      } catch {
        // ignore secondary failure
      }
      console.error(`${logPrefix} error ${label}:`, message);
      failed += 1;
    }
  }

  return { processed: due.length, succeeded, failed };
}
