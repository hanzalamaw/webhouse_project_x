-- =============================================================================
-- Consolidated migrations from chat session (run on an OLD database)
-- Covers: 009_crm_module, 010_crm_drop_extra_tables, 011_pos_terminal_module,
--         012_pos_terminal_all_tenants, 013_pos_outlet_store_hours
--
-- Fiscal-year filters use existing wh_organization_settings.fiscal_year_start
-- (no schema change — set in Admin → Organization Settings in the app).
--
-- Safe to re-run: skips columns/constraints that already exist.
-- Run against your tenant database, then restart the API server.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: add column only if missing
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _wh_add_column_if_missing;
DELIMITER //
CREATE PROCEDURE _wh_add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- -----------------------------------------------------------------------------
-- 009 — CRM module columns
-- -----------------------------------------------------------------------------
CALL _wh_add_column_if_missing('crm_customers', 'customer_type', "VARCHAR(45) NOT NULL DEFAULT 'retailer' AFTER `company_name`");
CALL _wh_add_column_if_missing('crm_customers', 'tags', 'VARCHAR(500) NULL DEFAULT NULL AFTER `customer_type`');
CALL _wh_add_column_if_missing('crm_leads', 'company_name', 'VARCHAR(100) NULL DEFAULT NULL AFTER `email`');
CALL _wh_add_column_if_missing('crm_leads', 'converted_customer_id', 'INT NULL DEFAULT NULL AFTER `assigned_to`');
CALL _wh_add_column_if_missing('crm_leads', 'converted_at', 'TIMESTAMP NULL DEFAULT NULL AFTER `converted_customer_id`');

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND INDEX_NAME = 'fk_crm_leads_converted_customer_idx'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE `crm_leads` ADD INDEX `fk_crm_leads_converted_customer_idx` (`converted_customer_id` ASC)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND CONSTRAINT_NAME = 'fk_crm_leads_converted_customer'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE `crm_leads` ADD CONSTRAINT `fk_crm_leads_converted_customer` FOREIGN KEY (`converted_customer_id`) REFERENCES `crm_customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CALL _wh_add_column_if_missing('crm_customer_complaints', 'issue_type', "VARCHAR(45) NOT NULL DEFAULT 'complaint' AFTER `priority`");
CALL _wh_add_column_if_missing('crm_customer_complaints', 'assigned_to', 'INT NULL DEFAULT NULL AFTER `user_id`');
CALL _wh_add_column_if_missing('crm_customer_complaints', 'resolution_note', 'TEXT NULL DEFAULT NULL AFTER `resolved_at`');

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer_complaints' AND INDEX_NAME = 'fk_crm_customer_complaints_assigned_idx'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE `crm_customer_complaints` ADD INDEX `fk_crm_customer_complaints_assigned_idx` (`assigned_to` ASC)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer_complaints' AND CONSTRAINT_NAME = 'fk_crm_customer_complaints_assigned'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE `crm_customer_complaints` ADD CONSTRAINT `fk_crm_customer_complaints_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 010 — Migrate extra CRM tables into columns, then drop them
-- -----------------------------------------------------------------------------
UPDATE `crm_customers` c
SET c.tags = (
  SELECT GROUP_CONCAT(DISTINCT t.tag_name ORDER BY t.tag_name SEPARATOR ', ')
  FROM `crm_customer_tags` ct
  INNER JOIN `crm_tags` t ON t.id = ct.tag_id AND t.deleted_at IS NULL
  WHERE ct.customer_id = c.id AND ct.tenant_id = c.tenant_id AND ct.deleted_at IS NULL
)
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'crm_customer_tags'
)
AND EXISTS (
  SELECT 1 FROM `crm_customer_tags` ct
  WHERE ct.customer_id = c.id AND ct.deleted_at IS NULL
);

UPDATE `crm_customers` c
SET c.note = TRIM(CONCAT(
  COALESCE(c.note, ''),
  CASE WHEN c.note IS NOT NULL AND c.note != '' THEN '\n\n' ELSE '' END,
  (
    SELECT GROUP_CONCAT(
      CONCAT('[', n.note_type, '] ', COALESCE(u.name, 'User'), ' — ', DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i'), '\n', n.body)
      ORDER BY n.created_at ASC SEPARATOR '\n\n'
    )
    FROM `crm_customer_notes` n
    LEFT JOIN `users` u ON u.id = n.user_id
    WHERE n.customer_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
  )
))
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'crm_customer_notes'
)
AND EXISTS (
  SELECT 1 FROM `crm_customer_notes` n
  WHERE n.customer_id = c.id AND n.deleted_at IS NULL
);

DROP TABLE IF EXISTS `crm_customer_tags`;
DROP TABLE IF EXISTS `crm_tags`;
DROP TABLE IF EXISTS `crm_customer_notes`;
DROP TABLE IF EXISTS `crm_activities`;

-- -----------------------------------------------------------------------------
-- 011 — POS Terminal module + default outlet/terminal (device code 1)
-- -----------------------------------------------------------------------------
INSERT INTO `modules` (`module_name`)
SELECT 'POS Terminal'
WHERE NOT EXISTS (
  SELECT 1 FROM `modules` WHERE `module_name` = 'POS Terminal' AND `deleted_at` IS NULL
);

SET @mod_pos_terminal = (
  SELECT `id` FROM `modules` WHERE `module_name` = 'POS Terminal' AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1
);

INSERT INTO `wh_tenant_modules` (`is_enabled`, `enabled_at`, `module_id`, `tenant_id`)
SELECT 1, NOW(), @mod_pos_terminal, tm.`tenant_id`
FROM `wh_tenant_modules` tm
INNER JOIN `modules` m ON m.`id` = tm.`module_id` AND m.`module_name` = 'POS' AND m.`deleted_at` IS NULL
WHERE tm.`is_enabled` = 1 AND tm.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `wh_tenant_modules` x
    WHERE x.`tenant_id` = tm.`tenant_id` AND x.`module_id` = @mod_pos_terminal AND x.`deleted_at` IS NULL
  );

INSERT INTO `permissions` (`permission_name`, `action`, `role_id`, `module_id`)
SELECT p.`permission_name`, p.`action`, p.`role_id`, @mod_pos_terminal
FROM `permissions` p
INNER JOIN `modules` m ON m.`id` = p.`module_id` AND m.`module_name` = 'POS' AND m.`deleted_at` IS NULL
WHERE p.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `permissions` p2
    WHERE p2.`role_id` = p.`role_id` AND p2.`module_id` = @mod_pos_terminal
      AND p2.`action` = p.`action` AND p2.`deleted_at` IS NULL
  );

INSERT INTO `pos_outlets` (`outlet_name`, `location`, `city`, `status`, `tenant_id`)
SELECT 'Main Outlet', 'Store front', NULL, 'active', t.`id`
FROM `wh_tenants` t
WHERE t.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `pos_outlets` o WHERE o.`tenant_id` = t.`id` AND o.`deleted_at` IS NULL
  );

INSERT INTO `pos_terminals` (`terminal_name`, `device_code`, `status`, `outlet_id`, `tenant_id`)
SELECT 'Terminal 1', '1', 'active', o.`id`, o.`tenant_id`
FROM `pos_outlets` o
WHERE o.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `pos_terminals` pt
    WHERE pt.`outlet_id` = o.`id` AND pt.`tenant_id` = o.`tenant_id` AND pt.`deleted_at` IS NULL
  );

-- -----------------------------------------------------------------------------
-- 012 — Enable POS Terminal for all active tenants + Super Admin permissions
-- -----------------------------------------------------------------------------
SET @mod_pos_terminal = (
  SELECT `id` FROM `modules` WHERE `module_name` = 'POS Terminal' AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1
);

INSERT INTO `wh_tenant_modules` (`is_enabled`, `enabled_at`, `module_id`, `tenant_id`)
SELECT 1, NOW(), @mod_pos_terminal, t.`id`
FROM `wh_tenants` t
WHERE t.`deleted_at` IS NULL AND t.`status` = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM `wh_tenant_modules` tm
    WHERE tm.`tenant_id` = t.`id` AND tm.`module_id` = @mod_pos_terminal AND tm.`deleted_at` IS NULL
  );

INSERT INTO `permissions` (`permission_name`, `action`, `role_id`, `module_id`)
SELECT 'full_access', a.`action`, r.`id`, @mod_pos_terminal
FROM `roles` r
CROSS JOIN (
  SELECT 'view' AS action UNION ALL SELECT 'create' UNION ALL SELECT 'edit' UNION ALL SELECT 'delete' UNION ALL SELECT 'manage'
) a
WHERE r.`role_name` = 'Super Admin' AND r.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `permissions` p
    WHERE p.`role_id` = r.`id` AND p.`module_id` = @mod_pos_terminal
      AND p.`action` = a.`action` AND p.`deleted_at` IS NULL
  );

-- -----------------------------------------------------------------------------
-- 013 — POS outlet store open/close times (drawer reset at open time)
-- -----------------------------------------------------------------------------
CALL _wh_add_column_if_missing('pos_outlets', 'store_open_time', 'TIME NULL DEFAULT NULL AFTER `status`');
CALL _wh_add_column_if_missing('pos_outlets', 'store_close_time', 'TIME NULL DEFAULT NULL AFTER `store_open_time`');
CALL _wh_add_column_if_missing('pos_outlets', 'opening_balance', 'DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER `store_close_time`');

-- Optional: default hours for outlets that have none yet
-- UPDATE `pos_outlets`
-- SET `store_open_time` = '09:00:00', `store_close_time` = '21:00:00'
-- WHERE `deleted_at` IS NULL AND `store_open_time` IS NULL;

DROP PROCEDURE IF EXISTS _wh_add_column_if_missing;

-- -----------------------------------------------------------------------------
-- Done
-- -----------------------------------------------------------------------------
