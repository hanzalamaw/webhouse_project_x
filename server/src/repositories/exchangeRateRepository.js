import { readDb, writeDb } from "../database/db.js";

export const exchangeRateRepository = {
  async upsertMany(rows) {
    if (!rows?.length) return 0;
    let n = 0;
    for (const row of rows) {
      await writeDb.query(
        `INSERT INTO wh_exchange_rates
           (base_currency, target_currency, rate, rate_date, source, fetched_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           rate = VALUES(rate),
           rate_date = VALUES(rate_date),
           source = VALUES(source),
           fetched_at = NOW(),
           deleted_at = NULL`,
        [
          row.base_currency || "PKR",
          String(row.target_currency).toUpperCase(),
          row.rate,
          row.rate_date || null,
          row.source || null,
        ]
      );
      n += 1;
    }
    return n;
  },

  async getRate(baseCurrency, targetCurrency) {
    const base = String(baseCurrency || "PKR").toUpperCase();
    const target = String(targetCurrency || "PKR").toUpperCase();
    if (base === target) {
      return { base_currency: base, target_currency: target, rate: 1, rate_date: null, source: "identity" };
    }
    const [rows] = await readDb.query(
      `SELECT base_currency, target_currency, rate, rate_date, source, fetched_at
       FROM wh_exchange_rates
       WHERE base_currency = ? AND target_currency = ? AND deleted_at IS NULL
       LIMIT 1`,
      [base, target]
    );
    return rows[0] || null;
  },
};
