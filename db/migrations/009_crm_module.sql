-- CRM module extensions (columns on existing tables only)

ALTER TABLE `crm_customers`
  ADD COLUMN `customer_type` VARCHAR(45) NOT NULL DEFAULT 'retailer' AFTER `company_name`;

ALTER TABLE `crm_customers`
  ADD COLUMN `tags` VARCHAR(500) NULL DEFAULT NULL AFTER `customer_type`;

ALTER TABLE `crm_leads`
  ADD COLUMN `company_name` VARCHAR(100) NULL DEFAULT NULL AFTER `email`;

ALTER TABLE `crm_leads`
  ADD COLUMN `converted_customer_id` INT NULL DEFAULT NULL AFTER `assigned_to`,
  ADD COLUMN `converted_at` TIMESTAMP NULL DEFAULT NULL AFTER `converted_customer_id`,
  ADD INDEX `fk_crm_leads_converted_customer_idx` (`converted_customer_id` ASC),
  ADD CONSTRAINT `fk_crm_leads_converted_customer`
    FOREIGN KEY (`converted_customer_id`)
    REFERENCES `crm_customers` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `crm_customer_complaints`
  ADD COLUMN `issue_type` VARCHAR(45) NOT NULL DEFAULT 'complaint' AFTER `priority`;

ALTER TABLE `crm_customer_complaints`
  ADD COLUMN `assigned_to` INT NULL DEFAULT NULL AFTER `user_id`,
  ADD COLUMN `resolution_note` TEXT NULL DEFAULT NULL AFTER `resolved_at`,
  ADD INDEX `fk_crm_customer_complaints_assigned_idx` (`assigned_to` ASC),
  ADD CONSTRAINT `fk_crm_customer_complaints_assigned`
    FOREIGN KEY (`assigned_to`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
