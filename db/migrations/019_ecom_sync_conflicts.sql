-- Order sync conflicts: hold incoming changes until user chooses keep or update

ALTER TABLE `ecom_synced_records`
  ADD COLUMN `conflict_status` VARCHAR(20) NOT NULL DEFAULT 'none' AFTER `source`,
  ADD COLUMN `pending_raw_json` LONGTEXT NULL DEFAULT NULL AFTER `conflict_status`,
  ADD COLUMN `pending_normalized_json` LONGTEXT NULL DEFAULT NULL AFTER `pending_raw_json`;
