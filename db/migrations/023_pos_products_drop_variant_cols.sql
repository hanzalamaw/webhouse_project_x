-- Drop variant-level columns from pos_products (resume)

ALTER TABLE pos_products DROP COLUMN sku;
ALTER TABLE pos_products DROP COLUMN cost_price;
ALTER TABLE pos_products DROP COLUMN selling_price;
