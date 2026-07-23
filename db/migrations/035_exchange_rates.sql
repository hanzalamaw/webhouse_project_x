-- Exchange rates for converting subscription plan prices (always PKR) to tenant display currency.
CREATE TABLE IF NOT EXISTS `wh_exchange_rates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `base_currency` VARCHAR(10) NOT NULL DEFAULT 'PKR',
  `target_currency` VARCHAR(10) NOT NULL,
  `rate` DECIMAL(24, 12) NOT NULL COMMENT 'Units of target per 1 base (PKR)',
  `rate_date` DATE NULL DEFAULT NULL,
  `source` VARCHAR(100) NULL DEFAULT NULL,
  `fetched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_wh_exchange_rates_pair` (`base_currency` ASC, `target_currency` ASC)
) ENGINE = InnoDB;
