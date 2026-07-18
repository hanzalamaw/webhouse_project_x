/**
 * Deferred marketplace hard-delete after ERP soft-delete (Shopify + Daraz).
 * Same 7-day policy as Shopify deferred deletes.
 */

export {
  SHOPIFY_PENDING_DELETE_DAYS as MARKETPLACE_PENDING_DELETE_DAYS,
  SHOPIFY_HARD_DELETE_DELAY_MS as MARKETPLACE_HARD_DELETE_DELAY_MS,
  shopifyHardDeleteDelayLabel as marketplaceHardDeleteDelayLabel,
} from "./shopifyDeferredDelete.js";

export function darazPendingDeleteNote(entityLabel = "product") {
  const when = new Date().toISOString().slice(0, 19).replace("T", " ");
  return (
    `[ERP] This ${entityLabel} was deleted from the ERP on ${when} UTC. `
    + "It was set to inactive on Daraz and will be permanently removed automatically in 7 days."
  );
}
