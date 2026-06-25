ALTER TABLE `inventory_products`
  ADD COLUMN `delivery_charges` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `selling_price`,
  ADD COLUMN `discount` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `delivery_charges`,
  ADD COLUMN `tax` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `discount`;
