-- ERP login portal on subscription plans (copied to wh_tenants on tenant create)
USE `webhouse_project_x`;

ALTER TABLE `wh_subscription_plans`
  ADD COLUMN `login_portal` VARCHAR(20) NOT NULL DEFAULT 'erp1' AFTER `plan_price`;
