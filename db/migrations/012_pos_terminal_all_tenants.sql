-- Enable POS Terminal for all active tenants (cashiers may use it without POS admin module)

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
