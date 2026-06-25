import { readDb, writeDb } from "../database/db.js";

export const organizationSettingsRepository = {
  async getByTenant(tenantId) {
    const [rows] = await readDb.query(
      `SELECT company_name, logo_url, timezone, currency, language, fiscal_year_start, fiscal_year_end
       FROM organization_settings
       WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [tenantId]
    );
    return rows[0] || null;
  },

  async upsert(tenantId, data) {
    await writeDb.query(
      `INSERT INTO organization_settings
       (company_name, logo_url, timezone, currency, language, fiscal_year_start, fiscal_year_end, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         company_name = VALUES(company_name),
         logo_url = VALUES(logo_url),
         timezone = VALUES(timezone),
         currency = VALUES(currency),
         language = VALUES(language),
         fiscal_year_start = VALUES(fiscal_year_start),
         fiscal_year_end = VALUES(fiscal_year_end),
         deleted_at = NULL`,
      [
        data.company_name,
        data.logo_url || null,
        data.timezone || "Asia/Karachi",
        data.currency || null,
        data.language || "en",
        data.fiscal_year_start || null,
        data.fiscal_year_end || null,
        tenantId,
      ]
    );
  },
};
