-- Tenant-scoped custom dropdown values for order management
CREATE TABLE IF NOT EXISTS `order_field_options` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `field_key` VARCHAR(50) NOT NULL,
  `option_value` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_order_field_option` (`tenant_id`, `field_key`, `option_value`),
  INDEX `fk_order_field_options_tenant_idx` (`tenant_id`),
  CONSTRAINT `fk_order_field_options_tenant`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- IP and device metadata for activity alerts
ALTER TABLE `activity_alerts`
  ADD COLUMN `ip_address` VARCHAR(45) NULL DEFAULT NULL AFTER `message`,
  ADD COLUMN `device_info` TEXT NULL DEFAULT NULL AFTER `ip_address`;
