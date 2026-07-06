-- Bank account on order and vendor payments (bank transfer)
ALTER TABLE `order_payments`
  ADD COLUMN `bank_account_id` INT NULL DEFAULT NULL AFTER `payment_method`,
  ADD INDEX `fk_order_payments_bank_idx` (`bank_account_id`),
  ADD CONSTRAINT `fk_order_payments_bank`
    FOREIGN KEY (`bank_account_id`) REFERENCES `finance_bank_accounts` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `finance_vendor_payments`
  ADD COLUMN `bank_account_id` INT NULL DEFAULT NULL AFTER `payment_method`,
  ADD INDEX `fk_fin_vendor_pay_bank_idx` (`bank_account_id`),
  ADD CONSTRAINT `fk_fin_vendor_pay_bank`
    FOREIGN KEY (`bank_account_id`) REFERENCES `finance_bank_accounts` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
