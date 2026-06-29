import { getFiscalYearFilterRange } from "./fiscalYearFilter";

function rowDate(row, field) {
  const raw = row[field];
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function matchesSearch(row, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return Object.values(row).some((v) => {
    if (v == null) return false;
    return String(v).toLowerCase().includes(q);
  });
}

export function getYearsFromRows(rows, dateField) {
  const years = new Set();
  for (const row of rows) {
    const d = rowDate(row, dateField);
    if (d) years.add(d.getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

export function getFilterOptions(rows, key) {
  const values = new Set();
  for (const row of rows) {
    const v = row[key];
    if (v != null && v !== "") values.add(String(v));
  }
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function applyToolbarFilters(rows, toolbar, { dateField = "created_at", filters = [], fiscalYearStart = null } = {}) {
  if (!rows?.length) return [];
  const { search = "", year = "", dateFrom = "", dateTo = "", ...fieldFilters } = toolbar;

  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  if (to) to.setHours(23, 59, 59, 999);

  let fiscalFrom = null;
  let fiscalTo = null;
  if (year && fiscalYearStart) {
    const range = getFiscalYearFilterRange(Number(year), fiscalYearStart);
    fiscalFrom = range.start;
    fiscalTo = range.end;
  }

  return rows.filter((row) => {
    if (!matchesSearch(row, search)) return false;

    for (const { key } of filters) {
      const val = fieldFilters[key];
      if (val && String(row[key] ?? "") !== val) return false;
    }

    const d = rowDate(row, dateField);
    if (year && fiscalYearStart) {
      if (!d) return false;
      if (d < fiscalFrom || d > fiscalTo) return false;
    } else if (year && d && d.getFullYear() !== Number(year)) {
      return false;
    }
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    if ((from || to || year) && !d) return false;

    return true;
  });
}

export const EMPTY_TOOLBAR = {
  search: "",
  year: "",
  dateFrom: "",
  dateTo: "",
};

export function inDateRange(value, { allTime, dateFrom, dateTo }) {
  if (allTime) return true;
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  if (dateFrom) {
    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
    if (d < from) return false;
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    if (d > to) return false;
  }
  return true;
}
