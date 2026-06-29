import { getFiscalYearFilterRange } from "./fiscalYearFilter";
import { inDateRange } from "./tableFilters";

export const EMPTY_DASHBOARD_FILTER = {
  allTime: true,
  year: "",
  dateFrom: "",
  dateTo: "",
};

export function rowMatchesDashboardFilter(value, filter, fiscalYearStart = null) {
  if (filter.allTime && !filter.year && !filter.dateFrom && !filter.dateTo) return true;

  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return false;

  if (filter.year) {
    if (fiscalYearStart) {
      const range = getFiscalYearFilterRange(Number(filter.year), fiscalYearStart);
      if (d < range.start || d > range.end) return false;
    } else if (d.getFullYear() !== Number(filter.year)) {
      return false;
    }
  }

  return inDateRange(value, {
    allTime: !filter.dateFrom && !filter.dateTo,
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
  });
}

export function filterRowsByDashboard(rows, dateField, filter, fiscalYearStart = null) {
  if (filter.allTime && !filter.year && !filter.dateFrom && !filter.dateTo) return rows;
  return rows.filter((row) => rowMatchesDashboardFilter(row[dateField], filter, fiscalYearStart));
}
