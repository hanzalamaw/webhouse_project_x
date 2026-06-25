-- =============================================================================
-- Sample / demo data for webhouse_project_x  (safe to re-run)
-- =============================================================================
-- Run in MySQL:
--   mysql -u root -p webhouse_project_x < db/seeds/sample_data.sql
--
-- Prereqs: schema + login_portal on wh_tenants (004) + WH admins seeded
--
-- Tenant logins (password for all: tenan 123)
--   admin@acme.com      → /erp1
--   admin@betastore.com → /erp2
--   admin@gammacorp.com → /erp3
-- =============================================================================

USE `webhouse_project_x`;

-- -----------------------------------------------------------------------------
-- Cleanup previous sample rows (re-run safe)
-- -----------------------------------------------------------------------------
DELETE FROM `wh_tenants`
WHERE `company_name` IN ('Acme Corporation', 'Beta Store LLC', 'Gamma Industries');

DELETE FROM `wh_subscription_plans`
WHERE `plan_name` IN ('Starter', 'Professional', 'Enterprise');

DELETE FROM `modules`
WHERE `module_name` IN (
  'Inventory',
  'CRM',
  'Orders',
  'POS',
  'Logistics',
  'Admin',
  'Logistics Partners',
  'Order Management',
  'E-Commerce Integration',
  'Finance & Accounting',
  'Inventory & Procurement'
);

-- -----------------------------------------------------------------------------
-- Modules (canonical tenant portal names)
-- -----------------------------------------------------------------------------
INSERT INTO `modules` (`module_name`) VALUES
  ('Admin'),
  ('Logistics Partners'),
  ('Order Management'),
  ('POS'),
  ('CRM'),
  ('E-Commerce Integration'),
  ('Finance & Accounting'),
  ('Inventory & Procurement');

SET @mod_admin      = (SELECT `id` FROM `modules` WHERE `module_name` = 'Admin'                         AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);
SET @mod_logistics  = (SELECT `id` FROM `modules` WHERE `module_name` = 'Logistics Partners' AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);
SET @mod_orders     = (SELECT `id` FROM `modules` WHERE `module_name` = 'Order Management'              AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);
SET @mod_pos        = (SELECT `id` FROM `modules` WHERE `module_name` = 'POS'                          AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);
SET @mod_crm        = (SELECT `id` FROM `modules` WHERE `module_name` = 'CRM'                          AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);
SET @mod_ecommerce  = (SELECT `id` FROM `modules` WHERE `module_name` = 'E-Commerce Integration'       AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);
SET @mod_finance    = (SELECT `id` FROM `modules` WHERE `module_name` = 'Finance & Accounting'         AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);
SET @mod_inventory  = (SELECT `id` FROM `modules` WHERE `module_name` = 'Inventory & Procurement'      AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);

-- -----------------------------------------------------------------------------
-- Subscription plans
-- -----------------------------------------------------------------------------
INSERT INTO `wh_subscription_plans` (`plan_name`, `plan_price`, `login_portal`) VALUES
  ('Starter',      49.00, 'erp1'),
  ('Professional', 99.00, 'erp2'),
  ('Enterprise',  199.00, 'erp3');

SET @plan_starter      = (SELECT `id` FROM `wh_subscription_plans` WHERE `plan_name` = 'Starter'      AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);
SET @plan_professional = (SELECT `id` FROM `wh_subscription_plans` WHERE `plan_name` = 'Professional' AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);
SET @plan_enterprise   = (SELECT `id` FROM `wh_subscription_plans` WHERE `plan_name` = 'Enterprise'   AND `deleted_at` IS NULL ORDER BY `id` LIMIT 1);

-- Plan ↔ module bundles
INSERT IGNORE INTO `wh_subscription_module` (`subscription_plan_id`, `module_id`) VALUES
  (@plan_starter,      @mod_inventory),
  (@plan_starter,      @mod_orders),
  (@plan_professional, @mod_inventory),
  (@plan_professional, @mod_crm),
  (@plan_professional, @mod_orders),
  (@plan_enterprise,   @mod_inventory),
  (@plan_enterprise,   @mod_crm),
  (@plan_enterprise,   @mod_orders),
  (@plan_enterprise,   @mod_pos),
  (@plan_enterprise,   @mod_logistics);

-- -----------------------------------------------------------------------------
-- Tenants (one login portal each)
-- -----------------------------------------------------------------------------
INSERT INTO `wh_tenants`
  (`company_name`, `owner_name`, `owner_email`, `owner_phone`, `industry`, `status`, `login_portal`)
VALUES
  ('Acme Corporation',  'Jane Smith',  'jane@acme.com',      '+1 555 0101', 'Retail',       'active', 'erp1'),
  ('Beta Store LLC',    'Bob Jones',   'bob@betastore.com',  '+1 555 0102', 'E-Commerce',   'active', 'erp2'),
  ('Gamma Industries',  'Ali Rahman',  'ali@gammacorp.com',  '+1 555 0103', 'Manufacturing','active', 'erp3');

SET @tenant_acme  = (SELECT `id` FROM `wh_tenants` WHERE `company_name` = 'Acme Corporation' AND `deleted_at` IS NULL LIMIT 1);
SET @tenant_beta  = (SELECT `id` FROM `wh_tenants` WHERE `company_name` = 'Beta Store LLC'   AND `deleted_at` IS NULL LIMIT 1);
SET @tenant_gamma = (SELECT `id` FROM `wh_tenants` WHERE `company_name` = 'Gamma Industries' AND `deleted_at` IS NULL LIMIT 1);

-- -----------------------------------------------------------------------------
-- Tenant limits
-- -----------------------------------------------------------------------------
INSERT INTO `wh_tenant_limits`
  (`max_users`, `max_warehouses`, `max_stores`, `max_orders_per_month`, `tenant_id`)
VALUES
  (25,  2, 3,  5000,  @tenant_acme),
  (10,  1, 1,  1000,  @tenant_beta),
  (100, 5, 10, 50000, @tenant_gamma);

-- -----------------------------------------------------------------------------
-- Tenant subscriptions
-- -----------------------------------------------------------------------------
INSERT INTO `wh_tenant_subscriptions`
  (`billing_cycle`, `start_date`, `renewal_date`, `status`, `total_amount`, `amount_due`, `tenant_id`, `subscription_plan_id`)
VALUES
  ('monthly',   '2026-01-01', '2026-07-01', 'active', 99.00,  0.00,  @tenant_acme,  @plan_professional),
  ('monthly',   '2026-02-01', '2026-08-01', 'active', 49.00,  49.00, @tenant_beta,  @plan_starter),
  ('quarterly', '2026-01-01', '2026-04-01', 'active', 199.00, 0.00,  @tenant_gamma, @plan_enterprise);

-- -----------------------------------------------------------------------------
-- Tenant payments (Beta has outstanding balance reflected above)
-- -----------------------------------------------------------------------------
INSERT INTO `wh_tenant_payments`
  (`bank`, `cash`, `total_received`, `received_at`, `tenant_id`)
VALUES
  (99.00,  0.00,  99.00,  '2026-01-05 10:00:00', @tenant_acme),
  (0.00,   0.00,   0.00,  NULL,                  @tenant_beta),
  (150.00, 50.00, 200.00, '2026-01-02 14:30:00', @tenant_gamma);

-- -----------------------------------------------------------------------------
-- Enabled modules per tenant (matches their plan bundles)
-- -----------------------------------------------------------------------------
INSERT INTO `wh_tenant_modules` (`is_enabled`, `enabled_at`, `module_id`, `tenant_id`) VALUES
  (1, NOW(), @mod_inventory, @tenant_acme),
  (1, NOW(), @mod_crm,       @tenant_acme),
  (1, NOW(), @mod_orders,    @tenant_acme),
  (1, NOW(), @mod_inventory, @tenant_beta),
  (1, NOW(), @mod_orders,    @tenant_beta),
  (1, NOW(), @mod_inventory, @tenant_gamma),
  (1, NOW(), @mod_crm,       @tenant_gamma),
  (1, NOW(), @mod_orders,    @tenant_gamma),
  (1, NOW(), @mod_pos,       @tenant_gamma),
  (1, NOW(), @mod_logistics, @tenant_gamma);

-- -----------------------------------------------------------------------------
-- Organization settings
-- -----------------------------------------------------------------------------
INSERT INTO `organization_settings`
  (`company_name`, `logo_url`, `timezone`, `currency`, `language`, `fiscal_year_start`, `fiscal_year_end`, `tenant_id`)
VALUES
  ('Acme Corporation',  NULL, 'America/New_York',    'USD', 'en', '2026-01-01', '2026-12-31', @tenant_acme),
  ('Beta Store LLC',    NULL, 'America/Los_Angeles', 'USD', 'en', '2026-01-01', '2026-12-31', @tenant_beta),
  ('Gamma Industries',  NULL, 'Asia/Karachi',        'PKR', 'en', '2026-07-01', '2027-06-30', @tenant_gamma);

-- -----------------------------------------------------------------------------
-- Super Admin roles (one per tenant)
-- -----------------------------------------------------------------------------
INSERT INTO `roles` (`role_name`, `description`, `status`, `tenant_id`) VALUES
  ('Super Admin', 'Full access to all enabled modules', 'active', @tenant_acme),
  ('Super Admin', 'Full access to all enabled modules', 'active', @tenant_beta),
  ('Super Admin', 'Full access to all enabled modules', 'active', @tenant_gamma);

SET @role_acme  = (SELECT `id` FROM `roles` WHERE `tenant_id` = @tenant_acme  AND `role_name` = 'Super Admin' AND `deleted_at` IS NULL LIMIT 1);
SET @role_beta  = (SELECT `id` FROM `roles` WHERE `tenant_id` = @tenant_beta  AND `role_name` = 'Super Admin' AND `deleted_at` IS NULL LIMIT 1);
SET @role_gamma = (SELECT `id` FROM `roles` WHERE `tenant_id` = @tenant_gamma AND `role_name` = 'Super Admin' AND `deleted_at` IS NULL LIMIT 1);

-- Password: tenant123 (WARSI cipher — same as server encrypt())
SET @pwd_tenant = 'f018dee4bfe767e14841b96afd2cdb30:b6df070649c1488e4920386fb97f7162';

INSERT INTO `users` (`tenant_id`, `name`, `email`, `password`, `phone`, `status`, `role_id`) VALUES
  (@tenant_acme,  'Acme Admin',  'admin@acme.com',      @pwd_tenant, '+1 555 1001', 'active', @role_acme),
  (@tenant_beta,  'Beta Admin',  'admin@betastore.com', @pwd_tenant, '+1 555 1002', 'active', @role_beta),
  (@tenant_gamma, 'Gamma Admin', 'admin@gammacorp.com', @pwd_tenant, '+1 555 1003', 'active', @role_gamma);

SET @user_acme  = (SELECT `id` FROM `users` WHERE `email` = 'admin@acme.com'      AND `deleted_at` IS NULL LIMIT 1);
SET @user_beta  = (SELECT `id` FROM `users` WHERE `email` = 'admin@betastore.com' AND `deleted_at` IS NULL LIMIT 1);
SET @user_gamma = (SELECT `id` FROM `users` WHERE `email` = 'admin@gammacorp.com' AND `deleted_at` IS NULL LIMIT 1);

-- -----------------------------------------------------------------------------
-- Permissions (view, create, edit, delete, manage) per module per Super Admin
-- -----------------------------------------------------------------------------
INSERT INTO `permissions` (`permission_name`, `action`, `role_id`, `module_id`)
SELECT 'full_access', a.action, r.role_id, r.module_id
FROM (
  SELECT @role_acme AS role_id, @mod_inventory AS module_id UNION ALL
  SELECT @role_acme, @mod_crm UNION ALL
  SELECT @role_acme, @mod_orders UNION ALL
  SELECT @role_beta, @mod_inventory UNION ALL
  SELECT @role_beta, @mod_orders UNION ALL
  SELECT @role_gamma, @mod_inventory UNION ALL
  SELECT @role_gamma, @mod_crm UNION ALL
  SELECT @role_gamma, @mod_orders UNION ALL
  SELECT @role_gamma, @mod_pos UNION ALL
  SELECT @role_gamma, @mod_logistics
) AS r
CROSS JOIN (
  SELECT 'view'   AS action UNION ALL
  SELECT 'create' UNION ALL
  SELECT 'edit'   UNION ALL
  SELECT 'delete' UNION ALL
  SELECT 'manage'
) AS a;

-- -----------------------------------------------------------------------------
-- Sample support tickets
-- -----------------------------------------------------------------------------
INSERT INTO `wh_support_tickets` (`subject`, `description`, `status`, `tenant_id`) VALUES
  ('Billing question', 'Please confirm our renewal date for Q3.', 'open',     @tenant_acme),
  ('Module access',    'Need POS module enabled on our account.', 'resolved', @tenant_beta);

-- -----------------------------------------------------------------------------
-- Sample WH audit logs (requires wh_admin_users id 1 = w.admin)
-- -----------------------------------------------------------------------------
INSERT INTO `wh_audit_logs` (`action`, `old_value`, `new_value`, `ip_address`, `admin_user_id`) VALUES
  (
    'seed_data',
    NULL,
    JSON_OBJECT('note', 'Sample data applied'),
    '127.0.0.1',
    (SELECT `id` FROM `wh_admin_users` WHERE `email` = 'w.admin' AND `deleted_at` IS NULL LIMIT 1)
  );

-- -----------------------------------------------------------------------------
-- Sample tenant audit logs
-- -----------------------------------------------------------------------------
INSERT INTO `audit_logs`
  (`action`, `old_value`, `new_value`, `ip_address`, `device_info`, `tenant_id`, `module_id`, `user_id`)
VALUES
  (
    'login',
    NULL,
    JSON_OBJECT('email', 'admin@acme.com'),
    '192.168.1.10',
    'Chrome / Windows',
    @tenant_acme,
    @mod_inventory,
    @user_acme
  ),
  (
    'order_create',
    JSON_OBJECT('status', 'draft'),
    JSON_OBJECT('status', 'confirmed', 'order_id', 'ORD-1001'),
    '192.168.1.20',
    'Safari / macOS',
    @tenant_beta,
    @mod_orders,
    @user_beta
  );

-- -----------------------------------------------------------------------------
-- Sample active sessions (log in via ERP UI to create real ones; these are static demos)
-- -----------------------------------------------------------------------------
INSERT INTO `sessions`
  (`session_token`, `ip_address`, `device_info`, `login_at`, `is_active`, `tenant_id`, `user_id`)
VALUES
  (
    'sample_session_token_acme_demo_only',
    '192.168.1.10',
    'Chrome 120 / Windows 10',
    NOW(),
    1,
    @tenant_acme,
    @user_acme
  ),
  (
    'sample_session_token_gamma_demo_only',
    '10.0.0.55',
    'Firefox 121 / Linux',
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    1,
    @tenant_gamma,
    @user_gamma
  );

-- -----------------------------------------------------------------------------
-- Done
-- -----------------------------------------------------------------------------
SELECT 'Sample data loaded.' AS message;
SELECT `company_name`, `login_portal`, `owner_email` FROM `wh_tenants` WHERE `deleted_at` IS NULL;
SELECT `plan_name`, `plan_price` FROM `wh_subscription_plans` WHERE `deleted_at` IS NULL;
SELECT `module_name` FROM `modules` WHERE `deleted_at` IS NULL;
