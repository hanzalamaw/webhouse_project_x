-- POS Terminal module + default outlet/terminal (device code 1) for POS-enabled tenants

INSERT INTO `modules` (`module_name`)
SELECT 'POS Terminal'
WHERE NOT EXISTS (
  SELECT 1 FROM `modules` WHERE `module_name` = 'POS Terminal' AND `deleted_at` IS NULL
);

SET @mod_pos_terminal = (
  SELECT `id` FROM `modules` WHERE `module_name` = 'POS Terminal' AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1
);

-- Enable POS Terminal for tenants that already have POS
INSERT INTO `wh_tenant_modules` (`is_enabled`, `enabled_at`, `module_id`, `tenant_id`)
SELECT 1, NOW(), @mod_pos_terminal, tm.`tenant_id`
FROM `wh_tenant_modules` tm
INNER JOIN `modules` m ON m.`id` = tm.`module_id` AND m.`module_name` = 'POS' AND m.`deleted_at` IS NULL
WHERE tm.`is_enabled` = 1 AND tm.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `wh_tenant_modules` x
    WHERE x.`tenant_id` = tm.`tenant_id` AND x.`module_id` = @mod_pos_terminal AND x.`deleted_at` IS NULL
  );

-- Mirror POS permissions to POS Terminal for existing role/module pairs
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

-- Default outlet per tenant (if none)
INSERT INTO `pos_outlets` (`outlet_name`, `location`, `city`, `status`, `tenant_id`)
SELECT 'Main Outlet', 'Store front', NULL, 'active', t.`id`
FROM `wh_tenants` t
WHERE t.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `pos_outlets` o WHERE o.`tenant_id` = t.`id` AND o.`deleted_at` IS NULL
  );

-- Default terminal device code 1 per outlet (if none)
INSERT INTO `pos_terminals` (`terminal_name`, `device_code`, `status`, `outlet_id`, `tenant_id`)
SELECT 'Terminal 1', '1', 'active', o.`id`, o.`tenant_id`
FROM `pos_outlets` o
WHERE o.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `pos_terminals` pt
    WHERE pt.`outlet_id` = o.`id` AND pt.`tenant_id` = o.`tenant_id` AND pt.`deleted_at` IS NULL
  );
