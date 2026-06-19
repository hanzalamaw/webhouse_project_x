-- Migration: user_sessions for JWT auth + email uniqueness on wh_admin_users

USE `webhouse_project_x`;

ALTER TABLE `wh_admin_users`
  ADD UNIQUE INDEX `uk_wh_admin_users_email` (`email`);

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `session_id` VARCHAR(64) NOT NULL,
  `admin_user_id` INT NOT NULL,
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `user_agent` TEXT NULL DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `refresh_token` VARCHAR(128) NULL DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_activity_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  INDEX `fk_user_sessions_wh_admin_users_idx` (`admin_user_id` ASC),
  CONSTRAINT `fk_user_sessions_wh_admin_users`
    FOREIGN KEY (`admin_user_id`)
    REFERENCES `wh_admin_users` (`id`)
    ON DELETE CASCADE
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
