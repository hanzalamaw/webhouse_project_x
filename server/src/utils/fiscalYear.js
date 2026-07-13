/** Parse fiscal year start from storage (YYYY-MM-DD reference date or Date object). */
export function parseFiscalStart(fiscalYearStart) {
  if (!fiscalYearStart) return { month: 1, day: 1 };

  if (fiscalYearStart instanceof Date && !Number.isNaN(fiscalYearStart.getTime())) {
    return { month: fiscalYearStart.getMonth() + 1, day: fiscalYearStart.getDate() };
  }

  const raw = String(fiscalYearStart).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { month: Number(iso[2]) || 1, day: Number(iso[3]) || 1 };
  }

  return { month: 1, day: 1 };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Inclusive SQL datetime bounds for a fiscal year label (matches client fiscal year labels). */
export function getFiscalYearSqlBounds(yearLabel, fiscalYearStart) {
  const { month, day } = parseFiscalStart(fiscalYearStart);
  const y = Number(yearLabel);
  const start = `${y}-${pad(month)}-${pad(day)} 00:00:00`;
  const nextStart = new Date(y, month - 1, day);
  nextStart.setFullYear(nextStart.getFullYear() + 1);
  nextStart.setDate(nextStart.getDate() - 1);
  const end = `${nextStart.getFullYear()}-${pad(nextStart.getMonth() + 1)}-${pad(nextStart.getDate())} 23:59:59`;
  return { start, end };
}

/** Date-only bounds for DATE() comparisons (avoids TIMESTAMP edge cases). */
export function getFiscalYearDateBounds(yearLabel, fiscalYearStart) {
  const { month, day } = parseFiscalStart(fiscalYearStart);
  const y = Number(yearLabel);
  const start = `${y}-${pad(month)}-${pad(day)}`;
  const nextStart = new Date(y, month - 1, day);
  nextStart.setFullYear(nextStart.getFullYear() + 1);
  nextStart.setDate(nextStart.getDate() - 1);
  const end = `${nextStart.getFullYear()}-${pad(nextStart.getMonth() + 1)}-${pad(nextStart.getDate())}`;
  return { start, end };
}
