USE `webhouse_project_x`;

ALTER TABLE `wh_admin_users`
  MODIFY COLUMN `password` VARCHAR(255) NOT NULL;
