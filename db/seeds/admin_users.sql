-- Example WebHouse admin users (passwords encrypted with WARSI cipher)
-- REQUIRED: run migrations 002 and 003 BEFORE this seed.
--   002_user_sessions.sql
--   003_password_column_widen.sql  (password must be VARCHAR(255) or encrypted hash gets truncated!)
-- Or run: cd server && npm run setup:db
USE `webhouse_project_x`;

-- w.admin / admin123
INSERT INTO `wh_admin_users` (`name`, `email`, `password`, `status`, `created_at`, `updated_at`)
VALUES (
  'John Admin',
  'w.admin',
  '76127fdcf2c2d2b6692f9bd1a67f609a:3cb365a161ee8e299d8c78db11277f8f',
  'active',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  `password` = VALUES(`password`),
  `name` = VALUES(`name`),
  `status` = 'active',
  `updated_at` = NOW();

-- w.sarah / password1
INSERT INTO `wh_admin_users` (`name`, `email`, `password`, `status`, `created_at`, `updated_at`)
VALUES (
  'Sarah Ops',
  'w.sarah',
  '869f039f4bdbfa707f8d231390b248ba:f8013c501f2cf2efd2fcea8a7dc933dd',
  'active',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  `password` = VALUES(`password`),
  `name` = VALUES(`name`),
  `status` = 'active',
  `updated_at` = NOW();

-- w.support / webhouse
INSERT INTO `wh_admin_users` (`name`, `email`, `password`, `status`, `created_at`, `updated_at`)
VALUES (
  'Support Lead',
  'w.support',
  'bc780a5bbb292edde07f05ee295c8254:9858fbc7ea8a9e71b9a7b8f0922fda4d',
  'active',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  `password` = VALUES(`password`),
  `name` = VALUES(`name`),
  `status` = 'active',
  `updated_at` = NOW();
