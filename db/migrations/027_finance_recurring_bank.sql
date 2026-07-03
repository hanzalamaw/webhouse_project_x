-- Link recurring expenses to bank accounts for automatic deduction
ALTER TABLE `finance_recurring_expenses`
  ADD COLUMN `bank_account_id` INT NULL DEFAULT NULL AFTER `sub_category_id`,
  ADD COLUMN `last_deducted_at` TIMESTAMP NULL DEFAULT NULL AFTER `next_due_date`,
  ADD INDEX `fk_fin_recur_exp_bank_idx` (`bank_account_id`),
  ADD CONSTRAINT `fk_fin_recur_exp_bank`
    FOREIGN KEY (`bank_account_id`)
    REFERENCES `finance_bank_accounts` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
