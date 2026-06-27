-- POS sale line items must reference pos_products (store catalog), not inventory_products.

UPDATE pos_sale_items psi
LEFT JOIN pos_products pp ON pp.id = psi.product_id AND pp.deleted_at IS NULL
SET psi.product_id = NULL
WHERE psi.product_id IS NOT NULL AND pp.id IS NULL AND psi.deleted_at IS NULL;

ALTER TABLE pos_sale_items DROP FOREIGN KEY fk_pos_sale_items_inventory_products1;

ALTER TABLE pos_sale_items
  ADD CONSTRAINT fk_pos_sale_items_pos_products
    FOREIGN KEY (product_id) REFERENCES pos_products (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
