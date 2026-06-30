-- E-commerce: entity source tracking, import status, and ERP link table

ALTER TABLE inventory_products
  ADD COLUMN source VARCHAR(45) NOT NULL DEFAULT 'manual' AFTER status;

ALTER TABLE crm_customers
  ADD COLUMN source VARCHAR(45) NOT NULL DEFAULT 'manual' AFTER status;

ALTER TABLE ecom_store_connections
  ADD COLUMN erp_import_status VARCHAR(45) NOT NULL DEFAULT 'pending' AFTER initial_sync_status,
  ADD COLUMN disconnect_data_policy VARCHAR(45) NULL DEFAULT NULL AFTER erp_import_status;

ALTER TABLE ecom_synced_records
  ADD COLUMN platform VARCHAR(45) NULL DEFAULT NULL AFTER source,
  ADD COLUMN import_status VARCHAR(45) NOT NULL DEFAULT 'staged' AFTER platform;

CREATE TABLE IF NOT EXISTS ecom_entity_links (
  id INT NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  store_id INT NOT NULL,
  platform VARCHAR(45) NOT NULL,
  entity_type VARCHAR(45) NOT NULL,
  external_id VARCHAR(100) NOT NULL,
  internal_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX uq_ecom_entity_link (store_id, entity_type, external_id),
  INDEX idx_ecom_entity_internal (tenant_id, entity_type, internal_id),
  CONSTRAINT fk_ecom_entity_links_store
    FOREIGN KEY (store_id) REFERENCES ecom_store_connections (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ecom_entity_links_tenant
    FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill platform from normalized JSON where possible
UPDATE ecom_synced_records
SET platform = JSON_UNQUOTE(JSON_EXTRACT(normalized_json, '$.platform'))
WHERE platform IS NULL
  AND JSON_EXTRACT(normalized_json, '$.platform') IS NOT NULL;
