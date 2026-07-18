-- Allow longer audit action codes (e.g. tenant_impersonation:organization_settings_update)

ALTER TABLE `audit_logs`
  MODIFY COLUMN `action` VARCHAR(191) NOT NULL;

ALTER TABLE `wh_audit_logs`
  MODIFY COLUMN `action` VARCHAR(191) NOT NULL;
