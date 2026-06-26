-- Migrate data from extra CRM tables, then drop them (use crm_customers + audit_logs instead).

UPDATE `crm_customers` c
SET c.tags = (
  SELECT GROUP_CONCAT(DISTINCT t.tag_name ORDER BY t.tag_name SEPARATOR ', ')
  FROM `crm_customer_tags` ct
  INNER JOIN `crm_tags` t ON t.id = ct.tag_id AND t.deleted_at IS NULL
  WHERE ct.customer_id = c.id AND ct.tenant_id = c.tenant_id AND ct.deleted_at IS NULL
)
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'crm_customer_tags'
)
AND EXISTS (
  SELECT 1 FROM `crm_customer_tags` ct
  WHERE ct.customer_id = c.id AND ct.deleted_at IS NULL
);

UPDATE `crm_customers` c
SET c.note = TRIM(CONCAT(
  COALESCE(c.note, ''),
  CASE WHEN c.note IS NOT NULL AND c.note != '' THEN '\n\n' ELSE '' END,
  (
    SELECT GROUP_CONCAT(
      CONCAT('[', n.note_type, '] ', COALESCE(u.name, 'User'), ' — ', DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i'), '\n', n.body)
      ORDER BY n.created_at ASC SEPARATOR '\n\n'
    )
    FROM `crm_customer_notes` n
    LEFT JOIN `users` u ON u.id = n.user_id
    WHERE n.customer_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
  )
))
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'crm_customer_notes'
)
AND EXISTS (
  SELECT 1 FROM `crm_customer_notes` n
  WHERE n.customer_id = c.id AND n.deleted_at IS NULL
);

DROP TABLE IF EXISTS `crm_customer_tags`;
DROP TABLE IF EXISTS `crm_tags`;
DROP TABLE IF EXISTS `crm_customer_notes`;
DROP TABLE IF EXISTS `crm_activities`;
