-- Bank/cash split on order payments (matches WH tenant transaction pattern)
ALTER TABLE `order_payments`
  ADD COLUMN `bank` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `payment_method`,
  ADD COLUMN `cash` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `bank`;

UPDATE `order_payments`
SET
  `bank` = CASE WHEN `payment_method` IN ('bank_transfer', 'card', 'online') THEN `amount` ELSE 0 END,
  `cash` = CASE WHEN `payment_method` IN ('cash', 'cod') THEN `amount` ELSE 0 END
WHERE `deleted_at` IS NULL;
