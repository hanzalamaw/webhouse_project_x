import {
  importNormalizedProduct,
  importNormalizedCustomer,
  importNormalizedOrder,
  maybeUpdateLinkedProduct,
} from "./ecomImport.js";
import { getStoreById, getEntityLink } from "../../repositories/ecommerceRepository.js";

/**
 * After a webhook or initial sync, sync into ERP.
 * - Auto-sync ON: create + update ERP records.
 * - Auto-sync OFF: still repair/update records already linked to the ERP (so a manual
 *   re-sync fixes existing data), but leave brand-new records for manual review/import.
 */
export async function autoSyncEntityToErp(tenantId, storeId, entityType, normalized) {
  const store = await getStoreById(storeId, tenantId);
  const autoSync = Boolean(store?.auto_sync_enabled);
  const linked = await getEntityLink(storeId, entityType, normalized.externalId);
  if (!autoSync && !linked) return { action: "skipped", reason: "auto_sync_disabled" };

  if (entityType === "product") {
    const updated = await maybeUpdateLinkedProduct(tenantId, storeId, normalized);
    if (updated) return { action: updated.action || "updated", entityType };
    const imp = await importNormalizedProduct(tenantId, normalized, {
      storeId,
      platform: "shopify",
      allowUpdate: true,
    });
    return { action: imp.action || (imp.ok ? "imported" : "failed"), entityType, ...imp };
  }

  if (entityType === "customer") {
    const imp = await importNormalizedCustomer(tenantId, normalized, {
      storeId,
      platform: "shopify",
    });
    return { action: imp.action || (imp.ok ? "imported" : "failed"), entityType, ...imp };
  }

  if (entityType === "order") {
    const imp = await importNormalizedOrder(tenantId, normalized, {
      storeId,
      platform: "shopify",
    });
    return { action: imp.action || (imp.ok ? "imported" : "failed"), entityType, ...imp };
  }

  return { action: "ignored", entityType };
}

export async function autoImportAllStaged(storeId, tenantId, platform = "shopify") {
  const store = await getStoreById(storeId, tenantId);
  if (!store?.auto_sync_enabled) return null;

  const { importEntitiesToErp } = await import("./ecomImport.js");
  return importEntitiesToErp(storeId, tenantId, platform, ["product", "customer", "order"], {
    updateExisting: true,
  });
}
