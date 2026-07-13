-- Shopify field parity: shipping address parts, order tags, customer country, product description

ALTER TABLE `orders`
  ADD COLUMN `delivery_state` VARCHAR(60) NULL DEFAULT NULL AFTER `delivery_address`,
  ADD COLUMN `delivery_postal_code` VARCHAR(45) NULL DEFAULT NULL AFTER `delivery_state`,
  ADD COLUMN `delivery_country` VARCHAR(60) NULL DEFAULT NULL AFTER `delivery_postal_code`,
  ADD COLUMN `tags` VARCHAR(500) NULL DEFAULT NULL AFTER `notes`;

ALTER TABLE `crm_customer_addresses`
  ADD COLUMN `country` VARCHAR(60) NULL DEFAULT NULL AFTER `postal_code`;

ALTER TABLE `inventory_products`
  ADD COLUMN `description` TEXT NULL DEFAULT NULL AFTER `product_name`;
