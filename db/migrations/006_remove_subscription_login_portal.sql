-- Login portal belongs on wh_tenants only (not subscription plans)
USE `webhouse_project_x`;

ALTER TABLE `wh_subscription_plans`
  DROP COLUMN `login_portal`;
