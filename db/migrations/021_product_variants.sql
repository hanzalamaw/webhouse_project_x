-- Product variants: inventory (warehouse) + POS (outlet) catalogs
-- Creates variant tables, backfills default variants, migrates stock FKs product_id → variant_id

-- ═══════════════════════════════════════════════════════════════════════════════
-- INVENTORY: variant tables
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS inventory_product_variants (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  sku VARCHAR(100) NOT NULL,
  variant_name VARCHAR(150) NOT NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(45) NOT NULL DEFAULT 'active',
  tenant_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inventory_variants_tenant_sku (tenant_id, sku),
  INDEX idx_inventory_variants_product (product_id),
  CONSTRAINT fk_inventory_variants_product FOREIGN KEY (product_id) REFERENCES inventory_products (id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_variants_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_variant_attributes (
  id INT NOT NULL AUTO_INCREMENT,
  attribute_name VARCHAR(45) NOT NULL,
  tenant_id INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inventory_variant_attrs_tenant_name (tenant_id, attribute_name),
  CONSTRAINT fk_inventory_variant_attrs_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_variant_attribute_values (
  id INT NOT NULL AUTO_INCREMENT,
  variant_id INT NOT NULL,
  attribute_id INT NOT NULL,
  value VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inventory_variant_attr_vals (variant_id, attribute_id),
  CONSTRAINT fk_inventory_variant_attr_vals_variant FOREIGN KEY (variant_id) REFERENCES inventory_product_variants (id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_variant_attr_vals_attr FOREIGN KEY (attribute_id) REFERENCES inventory_variant_attributes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- inventory_stock_levels product_id to variant_id
ALTER TABLE inventory_stock_levels ADD COLUMN variant_id INT NULL AFTER product_id;

UPDATE inventory_stock_levels sl
INNER JOIN inventory_product_variants v ON v.product_id = sl.product_id AND v.tenant_id = sl.tenant_id AND v.deleted_at IS NULL
SET sl.variant_id = v.id
WHERE sl.variant_id IS NULL;

ALTER TABLE inventory_stock_levels DROP FOREIGN KEY fk_inventory_stock_levels_inventory_products1;
ALTER TABLE inventory_stock_levels DROP INDEX uk_inventory_stock_levels_tenant_product_warehouse;
ALTER TABLE inventory_stock_levels DROP COLUMN product_id;
ALTER TABLE inventory_stock_levels MODIFY variant_id INT NOT NULL;
ALTER TABLE inventory_stock_levels ADD UNIQUE KEY uk_inventory_stock_levels_tenant_variant_warehouse (tenant_id, variant_id, warehouse_id);
ALTER TABLE inventory_stock_levels ADD CONSTRAINT fk_inventory_stock_levels_variant FOREIGN KEY (variant_id) REFERENCES inventory_product_variants (id) ON DELETE CASCADE;

-- inventory_stock_movements: product_id → variant_id
ALTER TABLE inventory_stock_movements ADD COLUMN variant_id INT NULL AFTER product_id;

UPDATE inventory_stock_movements m
INNER JOIN inventory_product_variants v ON v.product_id = m.product_id AND v.tenant_id = m.tenant_id AND v.deleted_at IS NULL
SET m.variant_id = v.id
WHERE m.variant_id IS NULL;

ALTER TABLE inventory_stock_movements DROP FOREIGN KEY fk_inventory_stock_movements_inventory_products1;
ALTER TABLE inventory_stock_movements DROP COLUMN product_id;
ALTER TABLE inventory_stock_movements MODIFY variant_id INT NOT NULL;
ALTER TABLE inventory_stock_movements ADD CONSTRAINT fk_inventory_stock_movements_variant FOREIGN KEY (variant_id) REFERENCES inventory_product_variants (id) ON DELETE CASCADE;

-- inventory_stock_transfers: product_id → variant_id
ALTER TABLE inventory_stock_transfers ADD COLUMN variant_id INT NULL AFTER product_id;

UPDATE inventory_stock_transfers t
INNER JOIN inventory_product_variants v ON v.product_id = t.product_id AND v.tenant_id = t.tenant_id AND v.deleted_at IS NULL
SET t.variant_id = v.id
WHERE t.variant_id IS NULL;

ALTER TABLE inventory_stock_transfers DROP FOREIGN KEY fk_inventory_stock_transfers_inventory_products1;
ALTER TABLE inventory_stock_transfers DROP COLUMN product_id;
ALTER TABLE inventory_stock_transfers MODIFY variant_id INT NOT NULL;
ALTER TABLE inventory_stock_transfers ADD CONSTRAINT fk_inventory_stock_transfers_variant FOREIGN KEY (variant_id) REFERENCES inventory_product_variants (id) ON DELETE CASCADE;

-- Remove variant-level columns from parent product
ALTER TABLE inventory_products DROP INDEX uk_inventory_products_tenant_sku;
ALTER TABLE inventory_products DROP COLUMN sku;
ALTER TABLE inventory_products DROP COLUMN cost_price;
ALTER TABLE inventory_products DROP COLUMN selling_price;

-- ═══════════════════════════════════════════════════════════════════════════════
-- POS: variant tables
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pos_product_variants (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  outlet_id INT NOT NULL,
  sku VARCHAR(100) NOT NULL,
  variant_name VARCHAR(150) NOT NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(45) NOT NULL DEFAULT 'active',
  tenant_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pos_variants_tenant_outlet_sku (tenant_id, outlet_id, sku),
  INDEX idx_pos_variants_product (product_id),
  CONSTRAINT fk_pos_variants_product FOREIGN KEY (product_id) REFERENCES pos_products (id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_variants_outlet FOREIGN KEY (outlet_id) REFERENCES pos_outlets (id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_variants_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_variant_attributes (
  id INT NOT NULL AUTO_INCREMENT,
  attribute_name VARCHAR(45) NOT NULL,
  tenant_id INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pos_variant_attrs_tenant_name (tenant_id, attribute_name),
  CONSTRAINT fk_pos_variant_attrs_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_variant_attribute_values (
  id INT NOT NULL AUTO_INCREMENT,
  variant_id INT NOT NULL,
  attribute_id INT NOT NULL,
  value VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pos_variant_attr_vals (variant_id, attribute_id),
  CONSTRAINT fk_pos_variant_attr_vals_variant FOREIGN KEY (variant_id) REFERENCES pos_product_variants (id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_variant_attr_vals_attr FOREIGN KEY (attribute_id) REFERENCES pos_variant_attributes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- POS variant backfill: see 022_pos_variants_complete.sql when upgrading from pre-variant schema

-- pos_stock_levels
ALTER TABLE pos_stock_levels ADD COLUMN variant_id INT NULL AFTER product_id;

UPDATE pos_stock_levels sl
INNER JOIN pos_product_variants v ON v.product_id = sl.product_id AND v.tenant_id = sl.tenant_id AND v.deleted_at IS NULL
SET sl.variant_id = v.id
WHERE sl.variant_id IS NULL;

ALTER TABLE pos_stock_levels DROP FOREIGN KEY fk_pos_stock_levels_product;
ALTER TABLE pos_stock_levels DROP FOREIGN KEY fk_pos_stock_levels_outlet;
ALTER TABLE pos_stock_levels DROP FOREIGN KEY fk_pos_stock_levels_tenant;
ALTER TABLE pos_stock_levels DROP INDEX uk_pos_stock_levels_product_outlet;
ALTER TABLE pos_stock_levels DROP COLUMN product_id;
ALTER TABLE pos_stock_levels MODIFY variant_id INT NOT NULL;
ALTER TABLE pos_stock_levels ADD UNIQUE KEY uk_pos_stock_levels_variant_outlet (tenant_id, outlet_id, variant_id);
ALTER TABLE pos_stock_levels ADD CONSTRAINT fk_pos_stock_levels_variant FOREIGN KEY (variant_id) REFERENCES pos_product_variants (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_levels ADD CONSTRAINT fk_pos_stock_levels_outlet FOREIGN KEY (outlet_id) REFERENCES pos_outlets (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_levels ADD CONSTRAINT fk_pos_stock_levels_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE;

-- pos_stock_movements
ALTER TABLE pos_stock_movements ADD COLUMN variant_id INT NULL AFTER product_id;

UPDATE pos_stock_movements m
INNER JOIN pos_product_variants v ON v.product_id = m.product_id AND v.tenant_id = m.tenant_id AND v.deleted_at IS NULL
SET m.variant_id = v.id
WHERE m.variant_id IS NULL;

ALTER TABLE pos_stock_movements DROP FOREIGN KEY fk_pos_stock_movements_product;
ALTER TABLE pos_stock_movements DROP FOREIGN KEY fk_pos_stock_movements_outlet;
ALTER TABLE pos_stock_movements DROP FOREIGN KEY fk_pos_stock_movements_user;
ALTER TABLE pos_stock_movements DROP FOREIGN KEY fk_pos_stock_movements_tenant;
ALTER TABLE pos_stock_movements DROP COLUMN product_id;
ALTER TABLE pos_stock_movements MODIFY variant_id INT NOT NULL;
ALTER TABLE pos_stock_movements ADD CONSTRAINT fk_pos_stock_movements_variant FOREIGN KEY (variant_id) REFERENCES pos_product_variants (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_movements ADD CONSTRAINT fk_pos_stock_movements_outlet FOREIGN KEY (outlet_id) REFERENCES pos_outlets (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_movements ADD CONSTRAINT fk_pos_stock_movements_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_movements ADD CONSTRAINT fk_pos_stock_movements_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE;

-- pos_stock_transfers
ALTER TABLE pos_stock_transfers ADD COLUMN variant_id INT NULL AFTER product_id;

UPDATE pos_stock_transfers t
INNER JOIN pos_product_variants v ON v.product_id = t.product_id AND v.tenant_id = t.tenant_id AND v.deleted_at IS NULL
SET t.variant_id = v.id
WHERE t.variant_id IS NULL;

ALTER TABLE pos_stock_transfers DROP FOREIGN KEY fk_pos_stock_transfers_product;
ALTER TABLE pos_stock_transfers DROP FOREIGN KEY fk_pos_stock_transfers_from;
ALTER TABLE pos_stock_transfers DROP FOREIGN KEY fk_pos_stock_transfers_to;
ALTER TABLE pos_stock_transfers DROP FOREIGN KEY fk_pos_stock_transfers_tenant;
ALTER TABLE pos_stock_transfers DROP COLUMN product_id;
ALTER TABLE pos_stock_transfers MODIFY variant_id INT NOT NULL;
ALTER TABLE pos_stock_transfers ADD CONSTRAINT fk_pos_stock_transfers_variant FOREIGN KEY (variant_id) REFERENCES pos_product_variants (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_transfers ADD CONSTRAINT fk_pos_stock_transfers_from FOREIGN KEY (from_outlet_id) REFERENCES pos_outlets (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_transfers ADD CONSTRAINT fk_pos_stock_transfers_to FOREIGN KEY (to_outlet_id) REFERENCES pos_outlets (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_transfers ADD CONSTRAINT fk_pos_stock_transfers_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE;

-- pos_sale_items: product_id → variant_id
ALTER TABLE pos_sale_items ADD COLUMN variant_id INT NULL AFTER product_id;

UPDATE pos_sale_items si
INNER JOIN pos_product_variants v ON v.product_id = si.product_id AND v.tenant_id = si.tenant_id AND v.deleted_at IS NULL
SET si.variant_id = v.id
WHERE si.product_id IS NOT NULL AND si.variant_id IS NULL;

ALTER TABLE pos_sale_items DROP FOREIGN KEY fk_pos_sale_items_pos_products;
ALTER TABLE pos_sale_items DROP COLUMN product_id;
ALTER TABLE pos_sale_items ADD CONSTRAINT fk_pos_sale_items_variant FOREIGN KEY (variant_id) REFERENCES pos_product_variants (id) ON DELETE SET NULL;

-- Remove variant-level columns from pos parent product
ALTER TABLE pos_products DROP INDEX uk_pos_products_tenant_outlet_sku;
ALTER TABLE pos_products DROP COLUMN sku;
ALTER TABLE pos_products DROP COLUMN cost_price;
ALTER TABLE pos_products DROP COLUMN selling_price;
