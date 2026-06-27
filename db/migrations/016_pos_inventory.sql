-- POS inventory tables (outlet-scoped, separate from central inventory)

CREATE TABLE IF NOT EXISTS pos_categories (
  id INT NOT NULL AUTO_INCREMENT,
  category_name VARCHAR(100) NOT NULL,
  status VARCHAR(45) NOT NULL DEFAULT 'active',
  outlet_id INT NOT NULL,
  tenant_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_pos_categories_tenant_outlet (tenant_id, outlet_id),
  CONSTRAINT fk_pos_categories_outlet FOREIGN KEY (outlet_id) REFERENCES pos_outlets (id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_categories_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_products (
  id INT NOT NULL AUTO_INCREMENT,
  product_name VARCHAR(150) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  unit VARCHAR(45) NOT NULL DEFAULT 'piece',
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  delivery_charges DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(45) NOT NULL DEFAULT 'active',
  category_id INT NOT NULL,
  outlet_id INT NOT NULL,
  tenant_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pos_products_tenant_outlet_sku (tenant_id, outlet_id, sku),
  INDEX idx_pos_products_outlet (outlet_id),
  CONSTRAINT fk_pos_products_category FOREIGN KEY (category_id) REFERENCES pos_categories (id),
  CONSTRAINT fk_pos_products_outlet FOREIGN KEY (outlet_id) REFERENCES pos_outlets (id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_products_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_stock_levels (
  id INT NOT NULL AUTO_INCREMENT,
  available_qty INT NOT NULL DEFAULT 0,
  reserved_qty INT NOT NULL DEFAULT 0,
  damaged_qty INT NOT NULL DEFAULT 0,
  total_qty INT NOT NULL DEFAULT 0,
  product_id INT NOT NULL,
  outlet_id INT NOT NULL,
  tenant_id INT NOT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pos_stock_levels_product_outlet (tenant_id, outlet_id, product_id),
  CONSTRAINT fk_pos_stock_levels_product FOREIGN KEY (product_id) REFERENCES pos_products (id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_stock_levels_outlet FOREIGN KEY (outlet_id) REFERENCES pos_outlets (id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_stock_levels_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_stock_movements (
  id INT NOT NULL AUTO_INCREMENT,
  movement_type VARCHAR(45) NOT NULL,
  qty INT NOT NULL,
  notes TEXT NULL,
  product_id INT NOT NULL,
  outlet_id INT NOT NULL,
  created_by INT NOT NULL,
  tenant_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_pos_stock_movements_outlet (outlet_id),
  CONSTRAINT fk_pos_stock_movements_product FOREIGN KEY (product_id) REFERENCES pos_products (id),
  CONSTRAINT fk_pos_stock_movements_outlet FOREIGN KEY (outlet_id) REFERENCES pos_outlets (id),
  CONSTRAINT fk_pos_stock_movements_user FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_pos_stock_movements_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_stock_transfers (
  id INT NOT NULL AUTO_INCREMENT,
  qty INT NOT NULL,
  transfer_status VARCHAR(45) NOT NULL DEFAULT 'pending',
  product_id INT NOT NULL,
  from_outlet_id INT NOT NULL,
  to_outlet_id INT NOT NULL,
  tenant_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_pos_stock_transfers_product FOREIGN KEY (product_id) REFERENCES pos_products (id),
  CONSTRAINT fk_pos_stock_transfers_from FOREIGN KEY (from_outlet_id) REFERENCES pos_outlets (id),
  CONSTRAINT fk_pos_stock_transfers_to FOREIGN KEY (to_outlet_id) REFERENCES pos_outlets (id),
  CONSTRAINT fk_pos_stock_transfers_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
