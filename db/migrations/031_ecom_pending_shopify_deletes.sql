-- Deferred Shopify hard-deletes after ERP soft-delete (cancel/draft + note first)

CREATE TABLE IF NOT EXISTS `ecom_pending_shopify_deletes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `store_id` INT NOT NULL,
  `entity_type` VARCHAR(45) NOT NULL,
  `external_id` VARCHAR(100) NOT NULL,
  `internal_id` INT NOT NULL,
  `delete_after` DATETIME NOT NULL,
  `status` VARCHAR(45) NOT NULL DEFAULT 'pending',
  `phase1_action` VARCHAR(45) NULL DEFAULT NULL,
  `note` TEXT NULL,
  `last_error` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP NULL DEFAULT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_ecom_pending_shopify_due` (`status`, `delete_after`),
  INDEX `idx_ecom_pending_shopify_tenant` (`tenant_id`, `entity_type`, `internal_id`),
  INDEX `idx_ecom_pending_shopify_store` (`store_id`),
  CONSTRAINT `fk_ecom_pending_shopify_deletes_store`
    FOREIGN KEY (`store_id`) REFERENCES `ecom_store_connections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ecom_pending_shopify_deletes_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `wh_tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
