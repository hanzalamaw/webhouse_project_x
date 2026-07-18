-- Structured payload + dedupe key for sync-duplicate alerts (Admin → Activity Alerts)

ALTER TABLE `activity_alerts`
  ADD COLUMN `meta_json` TEXT NULL DEFAULT NULL AFTER `device_info`,
  ADD COLUMN `dedupe_key` VARCHAR(191) NULL DEFAULT NULL AFTER `meta_json`;

ALTER TABLE `activity_alerts`
  ADD INDEX `idx_activity_alerts_dedupe` (`tenant_id`, `alert_type`, `dedupe_key`, `is_read`);
