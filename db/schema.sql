-- Full schema snapshot for webhouse_project_x
-- 57 tables: Webhouse Admin, Client Admin, Portal, Inventory, CRM,
-- E-Commerce, Orders, Finance, Logistics, POS
--
-- Soft delete: every table has deleted_at (NULL = active). Purge-after-7d is app/cron later.
-- Foreign keys: ON DELETE CASCADE, ON UPDATE CASCADE
--
-- Apply: cd server && npm run setup:db
-- Or:    mysql -u root -p < db/schema.sql

CREATE DATABASE IF NOT EXISTS `webhouse_project_x`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `webhouse_project_x`;

-- =============================================================================
-- WEBHOUSE ADMIN
-- =============================================================================

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
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_wh_admin_users_email` (`email` ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `modules`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `modules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `module_name` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `last_updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_subscription_plans`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_subscription_plans` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `plan_name` VARCHAR(45) NOT NULL,
  `plan_price` DECIMAL(12,2) NOT NULL,
  `login_portal` VARCHAR(20) NOT NULL DEFAULT 'erp1',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `last_updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
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
  `login_portal` VARCHAR(20) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_subscription_module`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_subscription_module` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subscription_plan_id` INT NOT NULL,
  `module_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_wh_subscription_module_plan_module` (`subscription_plan_id` ASC, `module_id` ASC),
  INDEX `fk_wh_subscription_module_wh_subscription_plans1_idx` (`subscription_plan_id` ASC),
  INDEX `fk_wh_subscription_module_modules1_idx` (`module_id` ASC),
  CONSTRAINT `fk_wh_subscription_module_wh_subscription_plans1`
    FOREIGN KEY (`subscription_plan_id`)
    REFERENCES `wh_subscription_plans` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_wh_subscription_module_modules1`
    FOREIGN KEY (`module_id`)
    REFERENCES `modules` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_tenant_modules`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_tenant_modules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `is_enabled` TINYINT(1) NOT NULL,
  `enabled_at` TIMESTAMP NULL DEFAULT NULL,
  `disabled_at` TIMESTAMP NULL DEFAULT NULL,
  `module_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_wh_tenant_modules_tenant_module` (`tenant_id` ASC, `module_id` ASC),
  INDEX `fk_wh_tenant_modules_modules1_idx` (`module_id` ASC),
  INDEX `fk_wh_tenant_modules_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_wh_tenant_modules_modules1`
    FOREIGN KEY (`module_id`)
    REFERENCES `modules` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_wh_tenant_modules_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
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
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_wh_tenant_limits_tenant` (`tenant_id` ASC),
  INDEX `fk_wh_tenant_limits_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_wh_tenant_limits_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_tenant_subscriptions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_tenant_subscriptions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `billing_cycle` VARCHAR(45) NOT NULL,
  `start_date` DATE NOT NULL,
  `billing_anchor_date` DATE NULL DEFAULT NULL,
  `renewal_date` DATE NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `total_amount` DECIMAL(12,2) NOT NULL,
  `amount_due` DECIMAL(12,2) NOT NULL,
  `tenant_id` INT NOT NULL,
  `subscription_plan_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_tenant_subscriptions_wh_tenants1_idx` (`tenant_id` ASC),
  INDEX `fk_wh_tenant_subscriptions_wh_subscription_plans1_idx` (`subscription_plan_id` ASC),
  CONSTRAINT `fk_wh_tenant_subscriptions_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_wh_tenant_subscriptions_wh_subscription_plans1`
    FOREIGN KEY (`subscription_plan_id`)
    REFERENCES `wh_subscription_plans` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_tenant_payments`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_tenant_payments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `bank` DECIMAL(12,2) NOT NULL,
  `cash` DECIMAL(12,2) NOT NULL,
  `total_received` DECIMAL(12,2) NOT NULL,
  `received_at` TIMESTAMP NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_tenant_payments_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_wh_tenant_payments_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `wh_support_tickets`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `wh_support_tickets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subject` VARCHAR(45) NOT NULL,
  `description` TEXT NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_support_tickets_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_wh_support_tickets_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
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
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `admin_user_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_wh_audit_logs_wh_admin_users1_idx` (`admin_user_id` ASC),
  CONSTRAINT `fk_wh_audit_logs_wh_admin_users1`
    FOREIGN KEY (`admin_user_id`)
    REFERENCES `wh_admin_users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- CLIENT ADMIN
-- =============================================================================

-- -----------------------------------------------------
-- Table `roles`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `role_name` VARCHAR(45) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_roles_tenant_role_name` (`tenant_id` ASC, `role_name` ASC),
  INDEX `fk_roles_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_roles_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `users`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(45) NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `role_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_users_tenant_email` (`tenant_id` ASC, `email` ASC),
  UNIQUE INDEX `uk_users_tenant_username` (`tenant_id` ASC, `username` ASC),
  INDEX `fk_users_wh_tenants1_idx` (`tenant_id` ASC),
  INDEX `fk_users_roles1_idx` (`role_id` ASC),
  CONSTRAINT `fk_users_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_users_roles1`
    FOREIGN KEY (`role_id`)
    REFERENCES `roles` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `permissions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `permission_name` VARCHAR(45) NOT NULL,
  `action` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `role_id` INT NOT NULL,
  `module_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_permissions_roles1_idx` (`role_id` ASC),
  INDEX `fk_permissions_modules1_idx` (`module_id` ASC),
  CONSTRAINT `fk_permissions_roles1`
    FOREIGN KEY (`role_id`)
    REFERENCES `roles` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_permissions_modules1`
    FOREIGN KEY (`module_id`)
    REFERENCES `modules` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- WEBHOUSE PORTAL
-- =============================================================================

-- -----------------------------------------------------
-- Table `audit_logs`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `action` VARCHAR(45) NOT NULL,
  `old_value` JSON NULL DEFAULT NULL,
  `new_value` JSON NULL DEFAULT NULL,
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `device_info` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `module_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_audit_logs_wh_tenants1_idx` (`tenant_id` ASC),
  INDEX `fk_audit_logs_modules1_idx` (`module_id` ASC),
  INDEX `fk_audit_logs_users1_idx` (`user_id` ASC),
  CONSTRAINT `fk_audit_logs_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_logs_modules1`
    FOREIGN KEY (`module_id`)
    REFERENCES `modules` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_logs_users1`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `sessions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_token` TEXT NOT NULL,
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `device_info` TEXT NULL DEFAULT NULL,
  `login_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `logout_at` TIMESTAMP NULL DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `tenant_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_sessions_wh_tenants1_idx` (`tenant_id` ASC),
  INDEX `fk_sessions_users1_idx` (`user_id` ASC),
  CONSTRAINT `fk_sessions_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_sessions_users1`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `organization_settings`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `organization_settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `company_name` VARCHAR(100) NOT NULL,
  `logo_url` TEXT NULL DEFAULT NULL,
  `timezone` VARCHAR(60) NULL DEFAULT NULL,
  `currency` VARCHAR(45) NULL DEFAULT NULL,
  `language` VARCHAR(45) NULL DEFAULT NULL,
  `fiscal_year_start` DATE NULL DEFAULT NULL,
  `fiscal_year_end` DATE NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `last_updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_organization_settings_tenant` (`tenant_id` ASC),
  INDEX `fk_organization_settings_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_organization_settings_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `activity_alerts`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_alerts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `alert_type` VARCHAR(100) NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NULL DEFAULT NULL,
  `priority` VARCHAR(45) NOT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_activity_alerts_users1_idx` (`user_id` ASC),
  INDEX `fk_activity_alerts_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_activity_alerts_users1`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_activity_alerts_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- INVENTORY & PROCUREMENT
-- =============================================================================

-- -----------------------------------------------------
-- Table `inventory_categories`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_categories` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `category_name` VARCHAR(100) NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_inventory_categories_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_inventory_categories_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `inventory_products`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_products` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_name` VARCHAR(150) NOT NULL,
  `sku` VARCHAR(100) NOT NULL,
  `unit` VARCHAR(45) NOT NULL,
  `cost_price` DECIMAL(12,2) NOT NULL,
  `selling_price` DECIMAL(12,2) NOT NULL,
  `delivery_charges` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `category_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_inventory_products_tenant_sku` (`tenant_id` ASC, `sku` ASC),
  INDEX `fk_inventory_products_inventory_categories1_idx` (`category_id` ASC),
  INDEX `fk_inventory_products_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_inventory_products_inventory_categories1`
    FOREIGN KEY (`category_id`)
    REFERENCES `inventory_categories` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_products_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `inventory_warehouses`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_warehouses` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `warehouse_name` VARCHAR(100) NOT NULL,
  `location` TEXT NULL DEFAULT NULL,
  `city` VARCHAR(100) NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_inventory_warehouses_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_inventory_warehouses_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `inventory_stock_levels`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_stock_levels` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `available_qty` INT NOT NULL DEFAULT 0,
  `reserved_qty` INT NOT NULL DEFAULT 0,
  `damaged_qty` INT NOT NULL DEFAULT 0,
  `total_qty` INT NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `product_id` INT NOT NULL,
  `warehouse_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_inventory_stock_levels_tenant_product_warehouse` (`tenant_id` ASC, `product_id` ASC, `warehouse_id` ASC),
  INDEX `fk_inventory_stock_levels_inventory_products1_idx` (`product_id` ASC),
  INDEX `fk_inventory_stock_levels_inventory_warehouses1_idx` (`warehouse_id` ASC),
  INDEX `fk_inventory_stock_levels_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_inventory_stock_levels_inventory_products1`
    FOREIGN KEY (`product_id`)
    REFERENCES `inventory_products` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_stock_levels_inventory_warehouses1`
    FOREIGN KEY (`warehouse_id`)
    REFERENCES `inventory_warehouses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_stock_levels_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `inventory_stock_movements`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_stock_movements` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `movement_type` VARCHAR(45) NOT NULL,
  `qty` INT NOT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `product_id` INT NOT NULL,
  `warehouse_id` INT NOT NULL,
  `created_by` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_inventory_stock_movements_inventory_products1_idx` (`product_id` ASC),
  INDEX `fk_inventory_stock_movements_inventory_warehouses1_idx` (`warehouse_id` ASC),
  INDEX `fk_inventory_stock_movements_users1_idx` (`created_by` ASC),
  INDEX `fk_inventory_stock_movements_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_inventory_stock_movements_inventory_products1`
    FOREIGN KEY (`product_id`)
    REFERENCES `inventory_products` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_stock_movements_inventory_warehouses1`
    FOREIGN KEY (`warehouse_id`)
    REFERENCES `inventory_warehouses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_stock_movements_users1`
    FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_stock_movements_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `inventory_stock_transfers`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_stock_transfers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `qty` INT NOT NULL,
  `transfer_status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `product_id` INT NOT NULL,
  `from_warehouse_id` INT NOT NULL,
  `to_warehouse_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_inventory_stock_transfers_inventory_products1_idx` (`product_id` ASC),
  INDEX `fk_inventory_stock_transfers_from_warehouse_idx` (`from_warehouse_id` ASC),
  INDEX `fk_inventory_stock_transfers_to_warehouse_idx` (`to_warehouse_id` ASC),
  INDEX `fk_inventory_stock_transfers_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_inventory_stock_transfers_inventory_products1`
    FOREIGN KEY (`product_id`)
    REFERENCES `inventory_products` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_stock_transfers_from_warehouse`
    FOREIGN KEY (`from_warehouse_id`)
    REFERENCES `inventory_warehouses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_stock_transfers_to_warehouse`
    FOREIGN KEY (`to_warehouse_id`)
    REFERENCES `inventory_warehouses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_stock_transfers_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- CRM
-- =============================================================================

-- -----------------------------------------------------
-- Table `crm_customers`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `crm_customers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customer_name` VARCHAR(100) NOT NULL,
  `company_name` VARCHAR(100) NULL DEFAULT NULL,
  `customer_type` VARCHAR(45) NOT NULL DEFAULT 'retailer',
  `tags` VARCHAR(500) NULL DEFAULT NULL,
  `phone` VARCHAR(45) NULL DEFAULT NULL,
  `email` VARCHAR(100) NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `note` TEXT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_crm_customers_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_crm_customers_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `crm_customer_addresses`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `crm_customer_addresses` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `address_type` VARCHAR(45) NOT NULL,
  `address` TEXT NOT NULL,
  `city` VARCHAR(60) NULL DEFAULT NULL,
  `state` VARCHAR(60) NULL DEFAULT NULL,
  `postal_code` VARCHAR(45) NULL DEFAULT NULL,
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `customer_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_crm_customer_addresses_crm_customers1_idx` (`customer_id` ASC),
  INDEX `fk_crm_customer_addresses_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_crm_customer_addresses_crm_customers1`
    FOREIGN KEY (`customer_id`)
    REFERENCES `crm_customers` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_customer_addresses_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `crm_leads`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `crm_leads` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lead_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(45) NULL DEFAULT NULL,
  `email` VARCHAR(100) NULL DEFAULT NULL,
  `company_name` VARCHAR(100) NULL DEFAULT NULL,
  `source` VARCHAR(100) NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `assigned_to` INT NULL DEFAULT NULL,
  `converted_customer_id` INT NULL DEFAULT NULL,
  `converted_at` TIMESTAMP NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_crm_leads_users1_idx` (`assigned_to` ASC),
  INDEX `fk_crm_leads_converted_customer_idx` (`converted_customer_id` ASC),
  INDEX `fk_crm_leads_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_crm_leads_users1`
    FOREIGN KEY (`assigned_to`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_leads_converted_customer`
    FOREIGN KEY (`converted_customer_id`)
    REFERENCES `crm_customers` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_leads_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `crm_customer_complaints`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `crm_customer_complaints` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subject` VARCHAR(150) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `priority` VARCHAR(45) NOT NULL,
  `issue_type` VARCHAR(45) NOT NULL DEFAULT 'complaint',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  `resolution_note` TEXT NULL DEFAULT NULL,
  `customer_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `assigned_to` INT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_crm_customer_complaints_crm_customers1_idx` (`customer_id` ASC),
  INDEX `fk_crm_customer_complaints_users1_idx` (`user_id` ASC),
  INDEX `fk_crm_customer_complaints_assigned_idx` (`assigned_to` ASC),
  INDEX `fk_crm_customer_complaints_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_crm_customer_complaints_crm_customers1`
    FOREIGN KEY (`customer_id`)
    REFERENCES `crm_customers` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_customer_complaints_users1`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_customer_complaints_assigned`
    FOREIGN KEY (`assigned_to`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_customer_complaints_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- ORDER MANAGEMENT
-- =============================================================================

-- -----------------------------------------------------
-- Table `orders`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(60) NOT NULL,
  `order_source` VARCHAR(60) NULL DEFAULT NULL,
  `order_status` VARCHAR(45) NOT NULL,
  `payment_status` VARCHAR(45) NOT NULL,
  `fulfillment_status` VARCHAR(45) NOT NULL,
  `total_amount` DECIMAL(12,2) NOT NULL,
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `delivery_charges` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `payable_amount` DECIMAL(12,2) NOT NULL,
  `city` VARCHAR(60) NULL DEFAULT NULL,
  `delivery_address` TEXT NULL DEFAULT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `customer_id` INT NULL DEFAULT NULL,
  `created_by` INT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_orders_tenant_order_no` (`tenant_id` ASC, `order_no` ASC),
  INDEX `fk_orders_crm_customers1_idx` (`customer_id` ASC),
  INDEX `fk_orders_users1_idx` (`created_by` ASC),
  INDEX `fk_orders_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_orders_crm_customers1`
    FOREIGN KEY (`customer_id`)
    REFERENCES `crm_customers` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_orders_users1`
    FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_orders_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `order_items`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_name` VARCHAR(150) NOT NULL,
  `sku` VARCHAR(80) NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(12,2) NOT NULL,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_price` DECIMAL(12,2) NOT NULL,
  `order_id` INT NOT NULL,
  `product_id` INT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_order_items_orders1_idx` (`order_id` ASC),
  INDEX `fk_order_items_inventory_products1_idx` (`product_id` ASC),
  INDEX `fk_order_items_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_order_items_orders1`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_items_inventory_products1`
    FOREIGN KEY (`product_id`)
    REFERENCES `inventory_products` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_items_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `order_assignments`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_assignments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `assigned_to` INT NOT NULL,
  `assignment_type` VARCHAR(45) NOT NULL,
  `assigned_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `status` VARCHAR(45) NOT NULL,
  `order_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_order_assignments_orders1_idx` (`order_id` ASC),
  INDEX `fk_order_assignments_users1_idx` (`assigned_to` ASC),
  INDEX `fk_order_assignments_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_order_assignments_orders1`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_assignments_users1`
    FOREIGN KEY (`assigned_to`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_assignments_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `order_payments`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_payments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `payment_method` VARCHAR(45) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `payment_status` VARCHAR(45) NOT NULL,
  `paid_at` TIMESTAMP NULL DEFAULT NULL,
  `order_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_order_payments_orders1_idx` (`order_id` ASC),
  INDEX `fk_order_payments_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_order_payments_orders1`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_payments_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `order_cancellations`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_cancellations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `reason` TEXT NULL DEFAULT NULL,
  `cancelled_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `order_id` INT NOT NULL,
  `cancelled_by` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_order_cancellations_orders1_idx` (`order_id` ASC),
  INDEX `fk_order_cancellations_users1_idx` (`cancelled_by` ASC),
  INDEX `fk_order_cancellations_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_order_cancellations_orders1`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_cancellations_users1`
    FOREIGN KEY (`cancelled_by`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_cancellations_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `order_returns`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_returns` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `reason` TEXT NULL DEFAULT NULL,
  `return_status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `order_id` INT NOT NULL,
  `created_by` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_order_returns_orders1_idx` (`order_id` ASC),
  INDEX `fk_order_returns_users1_idx` (`created_by` ASC),
  INDEX `fk_order_returns_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_order_returns_orders1`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_returns_users1`
    FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_returns_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `order_exchanges`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_exchanges` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `reason` TEXT NULL DEFAULT NULL,
  `exchange_status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `order_id` INT NOT NULL,
  `old_product_id` INT NOT NULL,
  `new_product_id` INT NOT NULL,
  `created_by` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_order_exchanges_orders1_idx` (`order_id` ASC),
  INDEX `fk_order_exchanges_inventory_products1_idx` (`old_product_id` ASC),
  INDEX `fk_order_exchanges_inventory_products2_idx` (`new_product_id` ASC),
  INDEX `fk_order_exchanges_users1_idx` (`created_by` ASC),
  INDEX `fk_order_exchanges_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_order_exchanges_orders1`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_exchanges_inventory_products1`
    FOREIGN KEY (`old_product_id`)
    REFERENCES `inventory_products` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_exchanges_inventory_products2`
    FOREIGN KEY (`new_product_id`)
    REFERENCES `inventory_products` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_exchanges_users1`
    FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_exchanges_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `order_refunds`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_refunds` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `refund_amount` DECIMAL(12,2) NOT NULL,
  `refund_method` VARCHAR(45) NOT NULL,
  `refund_status` VARCHAR(45) NOT NULL,
  `reason` TEXT NULL DEFAULT NULL,
  `refunded_at` TIMESTAMP NULL DEFAULT NULL,
  `order_id` INT NOT NULL,
  `created_by` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_order_refunds_orders1_idx` (`order_id` ASC),
  INDEX `fk_order_refunds_users1_idx` (`created_by` ASC),
  INDEX `fk_order_refunds_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_order_refunds_orders1`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_refunds_users1`
    FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_order_refunds_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- E-COMMERCE INTEGRATION
-- =============================================================================

-- -----------------------------------------------------
-- Table `ecom_store_connections`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ecom_store_connections` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `store_name` VARCHAR(100) NOT NULL,
  `platform` VARCHAR(45) NOT NULL,
  `store_url` TEXT NULL DEFAULT NULL,
  `access_token` TEXT NULL DEFAULT NULL,
  `api_key` TEXT NULL DEFAULT NULL,
  `api_secret` TEXT NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `last_synced_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_ecom_store_connections_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_ecom_store_connections_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `ecom_sync_logs`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ecom_sync_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `sync_type` VARCHAR(45) NOT NULL,
  `external_id` VARCHAR(100) NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `message` TEXT NULL DEFAULT NULL,
  `synced_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `store_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_ecom_sync_logs_ecom_store_connections1_idx` (`store_id` ASC),
  INDEX `fk_ecom_sync_logs_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_ecom_sync_logs_ecom_store_connections1`
    FOREIGN KEY (`store_id`)
    REFERENCES `ecom_store_connections` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_ecom_sync_logs_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `ecom_external_orders`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ecom_external_orders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `platform` VARCHAR(45) NOT NULL,
  `external_order_id` VARCHAR(100) NOT NULL,
  `internal_order_id` INT NULL DEFAULT NULL,
  `store_name` VARCHAR(100) NULL DEFAULT NULL,
  `sync_status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `store_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_ecom_external_orders_ecom_store_connections1_idx` (`store_id` ASC),
  INDEX `fk_ecom_external_orders_orders1_idx` (`internal_order_id` ASC),
  INDEX `fk_ecom_external_orders_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_ecom_external_orders_ecom_store_connections1`
    FOREIGN KEY (`store_id`)
    REFERENCES `ecom_store_connections` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_ecom_external_orders_orders1`
    FOREIGN KEY (`internal_order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_ecom_external_orders_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- FINANCE & ACCOUNTING
-- =============================================================================

-- -----------------------------------------------------
-- Table `finance_vendor_bills`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `finance_vendor_bills` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `vendor_name` VARCHAR(100) NOT NULL,
  `bill_no` VARCHAR(60) NOT NULL,
  `bill_amount` DECIMAL(12,2) NOT NULL,
  `amount_due` DECIMAL(12,2) NOT NULL,
  `due_date` DATE NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_finance_vendor_bills_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_finance_vendor_bills_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `finance_vendor_payments`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `finance_vendor_payments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `amount_paid` DECIMAL(12,2) NOT NULL,
  `payment_method` VARCHAR(45) NOT NULL,
  `paid_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `vendor_bill_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_finance_vendor_payments_finance_vendor_bills1_idx` (`vendor_bill_id` ASC),
  INDEX `fk_finance_vendor_payments_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_finance_vendor_payments_finance_vendor_bills1`
    FOREIGN KEY (`vendor_bill_id`)
    REFERENCES `finance_vendor_bills` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_finance_vendor_payments_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `finance_expense_categories`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `finance_expense_categories` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `category_name` VARCHAR(45) NOT NULL,
  `monthly_allocated_budget` DECIMAL(12,2) NULL DEFAULT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_finance_expense_categories_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_finance_expense_categories_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `finance_expense_sub_categories`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `finance_expense_sub_categories` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `sub_category_name` VARCHAR(100) NOT NULL,
  `monthly_allocated_budget` DECIMAL(12,2) NULL DEFAULT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `category_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_fin_exp_sub_cat_fin_exp_cat1_idx` (`category_id` ASC),
  INDEX `fk_finance_expense_sub_categories_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_fin_exp_sub_cat_fin_exp_cat1`
    FOREIGN KEY (`category_id`)
    REFERENCES `finance_expense_categories` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_finance_expense_sub_categories_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `finance_expenses`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `finance_expenses` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `expense_title` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `payment_method` VARCHAR(45) NOT NULL,
  `expense_date` DATE NOT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `category_id` INT NOT NULL,
  `sub_category_id` INT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_finance_expenses_finance_expense_categories1_idx` (`category_id` ASC),
  INDEX `fk_finance_expenses_finance_expense_sub_categories1_idx` (`sub_category_id` ASC),
  INDEX `fk_finance_expenses_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_finance_expenses_finance_expense_categories1`
    FOREIGN KEY (`category_id`)
    REFERENCES `finance_expense_categories` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_finance_expenses_finance_expense_sub_categories1`
    FOREIGN KEY (`sub_category_id`)
    REFERENCES `finance_expense_sub_categories` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_finance_expenses_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `finance_recurring_expenses`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `finance_recurring_expenses` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `frequency` VARCHAR(45) NOT NULL,
  `next_due_date` DATE NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `category_id` INT NOT NULL,
  `sub_category_id` INT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_finance_recurring_expenses_finance_expense_categories1_idx` (`category_id` ASC),
  INDEX `fk_fin_recur_exp_fin_exp_sub_cat1_idx` (`sub_category_id` ASC),
  INDEX `fk_finance_recurring_expenses_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_finance_recurring_expenses_finance_expense_categories1`
    FOREIGN KEY (`category_id`)
    REFERENCES `finance_expense_categories` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_fin_recur_exp_fin_exp_sub_cat1`
    FOREIGN KEY (`sub_category_id`)
    REFERENCES `finance_expense_sub_categories` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_finance_recurring_expenses_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `finance_bank_accounts`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `finance_bank_accounts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `bank_name` VARCHAR(100) NOT NULL,
  `account_title` VARCHAR(100) NOT NULL,
  `account_number` VARCHAR(100) NOT NULL,
  `current_balance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(45) NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_finance_bank_accounts_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_finance_bank_accounts_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `finance_transactions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `finance_transactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `transaction_type` VARCHAR(45) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `payment_method` VARCHAR(45) NULL DEFAULT NULL,
  `reference` VARCHAR(45) NULL DEFAULT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `transaction_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_finance_transactions_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_finance_transactions_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- LOGISTICS PARTNERS
-- =============================================================================

-- -----------------------------------------------------
-- Table `logistics_courier_partners`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `logistics_courier_partners` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `courier_name` VARCHAR(100) NOT NULL,
  `account_title` VARCHAR(100) NULL DEFAULT NULL,
  `account_number` VARCHAR(100) NULL DEFAULT NULL,
  `api_key` TEXT NULL DEFAULT NULL,
  `api_secret` TEXT NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_logistics_courier_partners_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_logistics_courier_partners_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `logistics_tracking_sync_logs`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `logistics_tracking_sync_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tracking_number` VARCHAR(100) NOT NULL,
  `old_status` VARCHAR(45) NULL DEFAULT NULL,
  `new_status` VARCHAR(45) NULL DEFAULT NULL,
  `synced_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `response_message` TEXT NULL DEFAULT NULL,
  `courier_id` INT NOT NULL,
  `order_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_logistics_tracking_sync_logs_logistics_courier_partners1_idx` (`courier_id` ASC),
  INDEX `fk_logistics_tracking_sync_logs_orders1_idx` (`order_id` ASC),
  INDEX `fk_logistics_tracking_sync_logs_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_logistics_tracking_sync_logs_logistics_courier_partners1`
    FOREIGN KEY (`courier_id`)
    REFERENCES `logistics_courier_partners` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_logistics_tracking_sync_logs_orders1`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_logistics_tracking_sync_logs_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `logistics_pickup_requests`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `logistics_pickup_requests` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `pickup_date` DATE NOT NULL,
  `pickup_address` TEXT NOT NULL,
  `pickup_status` VARCHAR(45) NOT NULL,
  `response_message` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `courier_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_logistics_pickup_requests_logistics_courier_partners1_idx` (`courier_id` ASC),
  INDEX `fk_logistics_pickup_requests_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_logistics_pickup_requests_logistics_courier_partners1`
    FOREIGN KEY (`courier_id`)
    REFERENCES `logistics_courier_partners` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_logistics_pickup_requests_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `logistics_pickup_orders`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `logistics_pickup_orders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `pickup_request_id` INT NOT NULL,
  `order_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_logistics_pickup_orders_pickup_order` (`pickup_request_id` ASC, `order_id` ASC),
  INDEX `fk_logistics_pickup_orders_orders1_idx` (`order_id` ASC),
  INDEX `fk_logistics_pickup_orders_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_logistics_pickup_orders_logistics_pickup_requests1`
    FOREIGN KEY (`pickup_request_id`)
    REFERENCES `logistics_pickup_requests` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_logistics_pickup_orders_orders1`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_logistics_pickup_orders_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- POS
-- =============================================================================

-- -----------------------------------------------------
-- Table `pos_outlets`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `pos_outlets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `outlet_name` VARCHAR(100) NOT NULL,
  `location` TEXT NULL DEFAULT NULL,
  `city` VARCHAR(60) NULL DEFAULT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_pos_outlets_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_pos_outlets_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `pos_terminals`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `pos_terminals` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `terminal_name` VARCHAR(100) NOT NULL,
  `device_code` VARCHAR(100) NOT NULL,
  `status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `outlet_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_pos_terminals_pos_outlets1_idx` (`outlet_id` ASC),
  INDEX `fk_pos_terminals_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_pos_terminals_pos_outlets1`
    FOREIGN KEY (`outlet_id`)
    REFERENCES `pos_outlets` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_terminals_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `pos_sales`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `pos_sales` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `sale_no` VARCHAR(60) NOT NULL,
  `total_amount` DECIMAL(12,2) NOT NULL,
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `payable_amount` DECIMAL(12,2) NOT NULL,
  `payment_status` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `outlet_id` INT NOT NULL,
  `terminal_id` INT NOT NULL,
  `crm_customers_id` INT NULL DEFAULT NULL,
  `created_by` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_pos_sales_tenant_sale_no` (`tenant_id` ASC, `sale_no` ASC),
  INDEX `fk_pos_sales_pos_outlets1_idx` (`outlet_id` ASC),
  INDEX `fk_pos_sales_pos_terminals1_idx` (`terminal_id` ASC),
  INDEX `fk_pos_sales_crm_customers1_idx` (`crm_customers_id` ASC),
  INDEX `fk_pos_sales_users1_idx` (`created_by` ASC),
  INDEX `fk_pos_sales_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_pos_sales_pos_outlets1`
    FOREIGN KEY (`outlet_id`)
    REFERENCES `pos_outlets` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_sales_pos_terminals1`
    FOREIGN KEY (`terminal_id`)
    REFERENCES `pos_terminals` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_sales_crm_customers1`
    FOREIGN KEY (`crm_customers_id`)
    REFERENCES `crm_customers` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_sales_users1`
    FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_sales_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `pos_sale_items`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `pos_sale_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_name` VARCHAR(150) NOT NULL,
  `sku` VARCHAR(80) NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(12,2) NOT NULL,
  `total_price` DECIMAL(12,2) NOT NULL,
  `pos_sale_id` INT NOT NULL,
  `product_id` INT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_pos_sale_items_pos_sales1_idx` (`pos_sale_id` ASC),
  INDEX `fk_pos_sale_items_inventory_products1_idx` (`product_id` ASC),
  INDEX `fk_pos_sale_items_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_pos_sale_items_pos_sales1`
    FOREIGN KEY (`pos_sale_id`)
    REFERENCES `pos_sales` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_sale_items_inventory_products1`
    FOREIGN KEY (`product_id`)
    REFERENCES `inventory_products` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_sale_items_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `pos_cash_registers`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `pos_cash_registers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `opening_balance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `closing_balance` DECIMAL(12,2) NULL DEFAULT NULL,
  `cash_collected` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `opened_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` TIMESTAMP NULL DEFAULT NULL,
  `outlet_id` INT NOT NULL,
  `terminal_id` INT NOT NULL,
  `opened_by` INT NOT NULL,
  `closed_by` INT NULL DEFAULT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_pos_cash_registers_pos_outlets1_idx` (`outlet_id` ASC),
  INDEX `fk_pos_cash_registers_pos_terminals1_idx` (`terminal_id` ASC),
  INDEX `fk_pos_cash_registers_users1_idx` (`opened_by` ASC),
  INDEX `fk_pos_cash_registers_users2_idx` (`closed_by` ASC),
  INDEX `fk_pos_cash_registers_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_pos_cash_registers_pos_outlets1`
    FOREIGN KEY (`outlet_id`)
    REFERENCES `pos_outlets` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_cash_registers_pos_terminals1`
    FOREIGN KEY (`terminal_id`)
    REFERENCES `pos_terminals` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_cash_registers_users1`
    FOREIGN KEY (`opened_by`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_cash_registers_users2`
    FOREIGN KEY (`closed_by`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_cash_registers_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `pos_refunds`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `pos_refunds` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `refund_amount` DECIMAL(12,2) NOT NULL,
  `reason` TEXT NULL DEFAULT NULL,
  `refunded_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `pos_sale_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_pos_refunds_pos_sales1_idx` (`pos_sale_id` ASC),
  INDEX `fk_pos_refunds_wh_tenants1_idx` (`tenant_id` ASC),
  CONSTRAINT `fk_pos_refunds_pos_sales1`
    FOREIGN KEY (`pos_sale_id`)
    REFERENCES `pos_sales` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pos_refunds_wh_tenants1`
    FOREIGN KEY (`tenant_id`)
    REFERENCES `wh_tenants` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
