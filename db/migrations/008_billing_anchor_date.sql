-- Billing anchor for lifetime total calculation (never rolls on auto-renewal)
ALTER TABLE `wh_tenant_subscriptions`
  ADD COLUMN `billing_anchor_date` DATE NULL DEFAULT NULL AFTER `start_date`;

UPDATE `wh_tenant_subscriptions`
SET `billing_anchor_date` = `start_date`
WHERE `billing_anchor_date` IS NULL AND `deleted_at IS NULL`;
