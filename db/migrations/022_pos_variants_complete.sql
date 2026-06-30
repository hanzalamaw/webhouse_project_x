-- Complete POS variant migration (resume after partial 021 run)

ALTER TABLE pos_stock_levels DROP FOREIGN KEY fk_pos_stock_levels_outlet;
ALTER TABLE pos_stock_levels DROP FOREIGN KEY fk_pos_stock_levels_tenant;
ALTER TABLE pos_stock_levels DROP INDEX uk_pos_stock_levels_product_outlet;
ALTER TABLE pos_stock_levels DROP COLUMN product_id;
ALTER TABLE pos_stock_levels MODIFY variant_id INT NOT NULL;
ALTER TABLE pos_stock_levels ADD UNIQUE KEY uk_pos_stock_levels_variant_outlet (tenant_id, outlet_id, variant_id);
ALTER TABLE pos_stock_levels ADD CONSTRAINT fk_pos_stock_levels_variant FOREIGN KEY (variant_id) REFERENCES pos_product_variants (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_levels ADD CONSTRAINT fk_pos_stock_levels_outlet FOREIGN KEY (outlet_id) REFERENCES pos_outlets (id) ON DELETE CASCADE;
ALTER TABLE pos_stock_levels ADD CONSTRAINT fk_pos_stock_levels_tenant FOREIGN KEY (tenant_id) REFERENCES wh_tenants (id) ON DELETE CASCADE;

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

ALTER TABLE pos_sale_items ADD COLUMN variant_id INT NULL AFTER product_id;

UPDATE pos_sale_items si
INNER JOIN pos_product_variants v ON v.product_id = si.product_id AND v.tenant_id = si.tenant_id AND v.deleted_at IS NULL
SET si.variant_id = v.id
WHERE si.product_id IS NOT NULL AND si.variant_id IS NULL;

ALTER TABLE pos_sale_items DROP FOREIGN KEY fk_pos_sale_items_pos_products;
ALTER TABLE pos_sale_items DROP COLUMN product_id;
ALTER TABLE pos_sale_items ADD CONSTRAINT fk_pos_sale_items_variant FOREIGN KEY (variant_id) REFERENCES pos_product_variants (id) ON DELETE SET NULL;

ALTER TABLE pos_products DROP INDEX uk_pos_products_tenant_outlet_sku;
ALTER TABLE pos_products DROP COLUMN sku;
ALTER TABLE pos_products DROP COLUMN cost_price;
ALTER TABLE pos_products DROP COLUMN selling_price;
