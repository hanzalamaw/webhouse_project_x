ALTER TABLE `pos_outlets`
  ADD COLUMN `store_open_time` TIME NULL DEFAULT NULL AFTER `status`,
  ADD COLUMN `store_close_time` TIME NULL DEFAULT NULL AFTER `store_open_time`;
