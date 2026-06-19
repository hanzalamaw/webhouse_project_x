-- Current schema snapshot for webhouse_project_x
-- Updated by migrations: 001_initial_schema, 002_user_sessions

CREATE DATABASE IF NOT EXISTS `webhouse_project_x`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `webhouse_project_x`;

-- -----------------------------------------------------
-- Table `wh_admin_users`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_admin_users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(60) NOT NULL,
  `email` VARCHAR(60) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_wh_admin_users_email` (`email` ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `user_sessions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `session_id` VARCHAR(64) NOT NULL,
  `admin_user_id` INT NOT NULL,
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `user_agent` TEXT NULL DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `refresh_token` VARCHAR(128) NULL DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_activity_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  INDEX `fk_user_sessions_wh_admin_users_idx` (`admin_user_id` ASC),
  CONSTRAINT `fk_user_sessions_wh_admin_users`
    FOREIGN KEY (`admin_user_id`)
    REFERENCES `wh_admin_users` (`id`)
    ON DELETE CASCADE
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `modules`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `modules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `module_name` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `last_updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_subscription_plans`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_subscription_plans` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `plan_name` VARCHAR(45) NOT NULL,
  `plan_price` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `last_updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_tenants`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_tenants` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `company_name` VARCHAR(45) NOT NULL,
  `owner_name` VARCHAR(45) NOT NULL,
  `owner_email` VARCHAR(45) NOT NULL,
  `owner_phone` VARCHAR(45) NOT NULL,
  `industry` VARCHAR(45) NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_audit_logs`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `action` VARCHAR(45) NOT NULL,
  `old_value` JSON NULL DEFAULT NULL,
  `new_value` JSON NULL DEFAULT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `admin_user_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_audit_logs_wh_admin_users1_idx` (`admin_user_id` ASC),
  CONSTRAINT `fk_wh_audit_logs_wh_admin_users1`
    FOREIGN KEY (`admin_user_id`)
    REFERENCES `wh_admin_users` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_tenant_payments`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_tenant_payments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `bank` DECIMAL NOT NULL,
  `cash` DECIMAL NOT NULL,
  `total_received` DECIMAL NOT NULL,
  `received_at` TIMESTAMP NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_tenant_payments_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_wh_tenant_payments_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_tenant_limits`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_tenant_limits` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `max_users` INT NOT NULL,
  `max_warehouses` INT NOT NULL,
  `max_stores` INT NOT NULL,
  `max_orders_per_month` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_tenant_limits_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_wh_tenant_limits_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_tenant_modules`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_tenant_modules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `is_enabled` TINYINT NOT NULL,
  `enabled_at` TIMESTAMP NULL DEFAULT NULL,
  `disabled_at` TIMESTAMP NULL DEFAULT NULL,
  `module_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_tenant_modules_modules1_idx` (`module_id` ASC),
  INDEX `fk_wh_tenant_modules_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_wh_tenant_modules_modules1`
    FOREIGN KEY (`module_id`)
    REFERENCES `modules` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_wh_tenant_modules_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_support_tickets`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_support_tickets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subject` VARCHAR(45) NOT NULL,
  `description` TEXT NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_support_tickets_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_wh_support_tickets_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_subscription_module`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_subscription_module` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subscription_id` INT NOT NULL,
  `module_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_subscription_module_wh_subscription_plans1_idx` (`subscription_id` ASC),
  INDEX `fk_wh_subscription_module_modules1_idx` (`module_id` ASC),
  CONSTRAINT `fk_wh_subscription_module_wh_subscription_plans1`
    FOREIGN KEY (`subscription_id`)
    REFERENCES `wh_subscription_plans` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_wh_subscription_module_modules1`
    FOREIGN KEY (`module_id`)
    REFERENCES `modules` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_tenant_subscriptions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_tenant_subscriptions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `billing_cycle` VARCHAR(45) NOT NULL,
  `start_date` DATE NOT NULL,
  `renewal_date` DATE NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  `total_amount` DECIMAL NOT NULL,
  `amount_due` DECIMAL NOT NULL,
  `tenant_id` INT NOT NULL,
  `subscription_plan_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_tenant_subscriptions_wh_tenants1_idx` (`tenant_id` ASC),
  INDEX `fk_wh_tenant_subscriptions_wh_subscription_plans1_idx` (`subscription_plan_id` ASC),
  CONSTRAINT `fk_wh_tenant_subscriptions_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_wh_tenant_subscriptions_wh_subscription_plans1`
    FOREIGN KEY (`subscription_plan_id`)
    REFERENCES `wh_subscription_plans` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
