-- E-Commerce integration: sync state, staging records, OAuth helpers

ALTER TABLE `ecom_store_connections`
  ADD COLUMN `initial_sync_status` VARCHAR(45) NOT NULL DEFAULT 'pending' AFTER `status`,
  ADD COLUMN `webhooks_registered` TINYINT(1) NOT NULL DEFAULT 0 AFTER `initial_sync_status`,
  ADD COLUMN `granted_scopes` TEXT NULL DEFAULT NULL AFTER `webhooks_registered`;

CREATE TABLE IF NOT EXISTS `ecom_synced_records` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `store_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `entity_type` VARCHAR(45) NOT NULL,
  `external_id` VARCHAR(100) NOT NULL,
  `raw_json` LONGTEXT NOT NULL,
  `normalized_json` LONGTEXT NOT NULL,
  `source` VARCHAR(100) NOT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_ecom_synced_store_entity` (`store_id`, `entity_type`, `external_id`),
  INDEX `idx_ecom_synced_store_type` (`store_id`, `entity_type`),
  CONSTRAINT `fk_ecom_synced_records_store`
    FOREIGN KEY (`store_id`) REFERENCES `ecom_store_connections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ecom_synced_records_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `wh_tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ecom_oauth_pending_states` (
  `state` VARCHAR(64) NOT NULL,
  `shop` TEXT NOT NULL,
  `tenant_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`state`),
  INDEX `idx_ecom_oauth_states_created` (`created_at`),
  CONSTRAINT `fk_ecom_oauth_states_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `wh_tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `ecom_external_orders`
  ADD UNIQUE INDEX `uq_ecom_external_order` (`store_id`, `external_order_id`);

CREATE TABLE IF NOT EXISTS `ecom_oauth_sessions` (
  `session_id` VARCHAR(64) NOT NULL,
  `shop` TEXT NOT NULL,
  `access_token` TEXT NOT NULL,
  `scope` TEXT NULL DEFAULT NULL,
  `store_id` INT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  INDEX `idx_ecom_oauth_sessions_created` (`created_at`),
  CONSTRAINT `fk_ecom_oauth_sessions_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `wh_tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
