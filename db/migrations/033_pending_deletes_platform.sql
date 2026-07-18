-- Support deferred hard-deletes for Daraz (and future platforms) in the same queue.
-- Existing rows default to shopify.

ALTER TABLE `ecom_pending_shopify_deletes`
  ADD COLUMN `platform` VARCHAR(45) NOT NULL DEFAULT 'shopify' AFTER `store_id`;

ALTER TABLE `ecom_pending_shopify_deletes`
  ADD INDEX `idx_ecom_pending_platform` (`platform`, `status`, `delete_after`);
