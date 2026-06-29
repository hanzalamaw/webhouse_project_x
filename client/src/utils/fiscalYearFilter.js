import { fiscalFromStorage } from "./billing";

export function getFiscalYearForDate(date, fiscalYearStart) {
  const { month, day } = fiscalFromStorage(fiscalYearStart);
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const dom = d.getDate();
  if (m < month || (m === month && dom < day)) return y - 1;
  return y;
}

export function getFiscalYearStartDate(fiscalYearLabel, fiscalYearStart) {
  const { month, day } = fiscalFromStorage(fiscalYearStart);
  return new Date(Number(fiscalYearLabel), month - 1, day, 0, 0, 0, 0);
}

export function getFiscalYearEndDate(fiscalYearLabel, fiscalYearStart) {
  const start = getFiscalYearStartDate(fiscalYearLabel, fiscalYearStart);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setMilliseconds(-1);
  return end;
}

/** Filter range for fiscal year label: start of FY through min(now, FY end). */
export function getFiscalYearFilterRange(fiscalYearLabel, fiscalYearStart, asOf = new Date()) {
  const start = getFiscalYearStartDate(fiscalYearLabel, fiscalYearStart);
  const fyEnd = getFiscalYearEndDate(fiscalYearLabel, fiscalYearStart);
  const end = asOf < fyEnd ? new Date(asOf) : fyEnd;
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getFiscalYearsFromRows(rows, dateField, fiscalYearStart) {
  if (!fiscalYearStart) return null;
  const years = new Set();
  for (const row of rows || []) {
    const raw = row[dateField];
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const fy = getFiscalYearForDate(d, fiscalYearStart);
    if (fy != null) years.add(fy);
  }
  return [...years].sort((a, b) => b - a);
}
