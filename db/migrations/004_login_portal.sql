-- Add login_portal to wh_tenants (erp1 | erp2 | erp3)
USE `webhouse_project_x`;

ALTER TABLE `wh_tenants`
  ADD COLUMN `login_portal` VARCHAR(20) NULL DEFAULT NULL AFTER `status`;
