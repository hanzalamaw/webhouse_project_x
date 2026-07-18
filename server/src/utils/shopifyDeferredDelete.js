/**
 * Deferred Shopify hard-delete after ERP soft-delete.
 *
 * Phase 1 (on ERP delete): cancel order / draft product / note customer on Shopify,
 * then soft-delete in ERP and schedule a hard DELETE on Shopify (delete_after = now + 7 days).
 * Phase 2 (daily retention job): permanently delete from Shopify when delete_after has passed.
 */

export const SHOPIFY_PENDING_DELETE_DAYS = 7;

/** Delay before Shopify hard-delete (ms). Default 7 days. */
export const SHOPIFY_HARD_DELETE_DELAY_MS =
  Number(process.env.SHOPIFY_HARD_DELETE_DELAY_MS)
  || SHOPIFY_PENDING_DELETE_DAYS * 24 * 60 * 60 * 1000;

export function shopifyPendingDeleteNote(entityLabel = "record") {
  const when = new Date().toISOString().slice(0, 19).replace("T", " ");
  return (
    `[ERP] This ${entityLabel} was deleted from the ERP on ${when} UTC. `
    + `It will be permanently removed from Shopify automatically in ${SHOPIFY_PENDING_DELETE_DAYS} days.`
  );
}

export function shopifyHardDeleteDelayLabel() {
  return `${SHOPIFY_PENDING_DELETE_DAYS}d`;
}
