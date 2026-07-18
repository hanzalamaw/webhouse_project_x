/**
 * Soft-delete policy (see cursor_instructions.txt):
 * - User "delete" actions must SET deleted_at = NOW(), never hard DELETE rows.
 * - ERP list queries already filter deleted_at IS NULL.
 * - Rows with deleted_at older than PURGE_AFTER_DAYS are hard-deleted by the daily retention job.
 *
 * Exceptions (no deleted_at column — ephemeral or junction data):
 * - ecom_oauth_pending_states, ecom_oauth_sessions (TTL cleanup in oauthState.js)
 * - inventory_variant_attributes, inventory_variant_attribute_values (replaced on variant save)
 *
 * Shopify remote hard-delete uses the same 7-day policy via ecom_pending_shopify_deletes
 * (processed once daily with this purge — not a separate poll loop).
 */

export const PURGE_AFTER_DAYS = 7;

/** SQL fragment: alias.deleted_at IS NULL */
export function notDeleted(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return `${prefix}deleted_at IS NULL`;
}

/** Standard soft-delete UPDATE for a single row. */
export function softDeleteWhere(idColumn = "id") {
  return `SET deleted_at = NOW() WHERE ${idColumn} = ? AND deleted_at IS NULL`;
}
