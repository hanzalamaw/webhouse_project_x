-- Order payments: single amount + payment_method (bank or cash), no bank/cash split columns
UPDATE `order_payments`
SET `payment_method` = CASE
  WHEN COALESCE(`bank`, 0) > 0 AND COALESCE(`cash`, 0) <= 0 THEN 'bank_transfer'
  WHEN COALESCE(`cash`, 0) > 0 AND COALESCE(`bank`, 0) <= 0 THEN 'cash'
  WHEN COALESCE(`bank`, 0) >= COALESCE(`cash`, 0) THEN 'bank_transfer'
  ELSE 'cash'
END
WHERE `deleted_at` IS NULL;

ALTER TABLE `order_payments`
  DROP COLUMN `bank`,
  DROP COLUMN `cash`;
