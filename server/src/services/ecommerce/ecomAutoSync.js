import {
  importNormalizedProduct,
  importNormalizedCustomer,
  importNormalizedOrder,
  maybeUpdateLinkedProduct,
} from "./ecomImport.js";
import { getStoreById, getEntityLink } from "../../repositories/ecommerceRepository.js";

/**
 * After a webhook or ongoing auto-sync event, sync into ERP.
 * - Auto-sync ON: create new records; duplicates → Admin Activity Alert (ERP vs store).
 * - Auto-sync OFF: still repair/update records already linked to the ERP.
 * Reconnect / manual Import review does not use this path for duplicates.
 */
export async function autoSyncEntityToErp(tenantId, storeId, entityType, normalized) {
  const store = await getStoreById(storeId, tenantId);
  const autoSync = Boolean(store?.auto_sync_enabled);
  const linked = await getEntityLink(storeId, entityType, normalized.externalId);
  if (!autoSync && !linked) return { action: "skipped", reason: "auto_sync_disabled" };

  const platform = store?.platform || "shopify";

  if (entityType === "product") {
    const updated = await maybeUpdateLinkedProduct(tenantId, storeId, normalized);
    if (updated) return { action: updated.action || "updated", entityType };
    const imp = await importNormalizedProduct(tenantId, normalized, {
      storeId,
      platform,
      allowUpdate: true,
    });
    if (imp.needsDuplicateReview) {
      const { createEcomDuplicateAlert } = await import("../../utils/activityAlerts.js");
      await createEcomDuplicateAlert({
        tenantId,
        platform,
        storeId,
        entityType: "product",
        externalId: normalized.externalId,
        existingId: imp.existingId || null,
        name: normalized.name || null,
        sku: normalized.sku || null,
        reason: imp.why || imp.reason || null,
      }).catch(() => {});
    }
    return { action: imp.action || (imp.ok ? "imported" : "failed"), entityType, ...imp };
  }

  if (entityType === "customer") {
    const imp = await importNormalizedCustomer(tenantId, normalized, {
      storeId,
      platform,
    });
    if (imp.needsDuplicateReview) {
      const { createEcomDuplicateAlert } = await import("../../utils/activityAlerts.js");
      await createEcomDuplicateAlert({
        tenantId,
        platform,
        storeId,
        entityType: "customer",
        externalId: normalized.externalId,
        existingId: imp.existingId || null,
        name: normalized.name || null,
        reason: imp.why || imp.reason || null,
      }).catch(() => {});
    }
    return { action: imp.action || (imp.ok ? "imported" : "failed"), entityType, ...imp };
  }

  if (entityType === "order") {
    const imp = await importNormalizedOrder(tenantId, normalized, {
      storeId,
      platform,
    });
    if (imp.needsDuplicateReview) {
      const { createEcomDuplicateAlert } = await import("../../utils/activityAlerts.js");
      await createEcomDuplicateAlert({
        tenantId,
        platform,
        storeId,
        entityType: "order",
        externalId: normalized.externalId,
        existingId: imp.existingId || null,
        name: normalized.orderNo || normalized.externalId || null,
        reason: imp.why || imp.reason || null,
      }).catch(() => {});
    }
    return { action: imp.action || (imp.ok ? "imported" : "failed"), entityType, ...imp };
  }

  return { action: "ignored", entityType };
}

export async function autoImportAllStaged(storeId, tenantId, platform = "shopify") {
  const store = await getStoreById(storeId, tenantId);
  if (!store?.auto_sync_enabled) return null;

  const { importEntitiesToErp } = await import("./ecomImport.js");
  // Initial / bulk staged import: create new rows only. Duplicates stay for the
  // Import review modal (reconnect) — do not raise Activity Alerts here.
  return importEntitiesToErp(storeId, tenantId, platform, ["product", "customer", "order"], {
    updateExisting: true,
    defaultConflictAction: null,
  });
}
