-- Bidirectional Shopify sync: auto-import flag + location → warehouse/outlet mapping

ALTER TABLE `ecom_store_connections`
  ADD COLUMN `auto_sync_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `erp_import_status`;

CREATE TABLE IF NOT EXISTS `ecom_location_links` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `store_id` INT NOT NULL,
  `shopify_location_id` VARCHAR(50) NOT NULL,
  `location_name` VARCHAR(150) NOT NULL,
  `warehouse_id` INT NULL DEFAULT NULL,
  `outlet_id` INT NULL DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_ecom_location_store` (`store_id`, `shopify_location_id`),
  INDEX `idx_ecom_location_tenant` (`tenant_id`),
  INDEX `idx_ecom_location_warehouse` (`warehouse_id`),
  INDEX `idx_ecom_location_outlet` (`outlet_id`),
  CONSTRAINT `fk_ecom_location_links_store`
    FOREIGN KEY (`store_id`) REFERENCES `ecom_store_connections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ecom_location_links_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `wh_tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ecom_location_links_warehouse`
    FOREIGN KEY (`warehouse_id`) REFERENCES `inventory_warehouses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ecom_location_links_outlet`
    FOREIGN KEY (`outlet_id`) REFERENCES `pos_outlets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
