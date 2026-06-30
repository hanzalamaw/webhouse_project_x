import { getFiscalYearFilterRange } from "./fiscalYearFilter";
import { inDateRange } from "./tableFilters";

export const EMPTY_DASHBOARD_FILTER = {
  allTime: true,
  year: "",
  dateFrom: "",
  dateTo: "",
};

function padDatePart(n) {
  return String(n).padStart(2, "0");
}

/** Default dashboard filter: current calendar month. */
export function createThisMonthDashboardFilter() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    allTime: false,
    year: "",
    dateFrom: `${y}-${padDatePart(m + 1)}-01`,
    dateTo: `${y}-${padDatePart(m + 1)}-${padDatePart(lastDay)}`,
  };
}

export function isAllTimeDashboardFilter(filter) {
  return Boolean(filter.allTime) && !filter.year;
}

export function getEarliestDate(rows, dateField = "created_at") {
  let earliest = null;
  for (const row of rows || []) {
    const raw = row?.[dateField];
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

export function getEarliestDateFromSources(sources, dateField = "created_at") {
  let earliest = null;
  for (const rows of sources) {
    const d = getEarliestDate(rows, dateField);
    if (d && (!earliest || d < earliest)) earliest = d;
  }
  return earliest;
}

export function getComparisonLabel(filter) {
  if (filter.year && !filter.dateFrom && !filter.dateTo) return "last year";
  return "last month";
}

export function getPreviousPeriodFilter(filter, fiscalYearStart = null) {
  if (isAllTimeDashboardFilter(filter)) return null;

  if (filter.year && !filter.dateFrom && !filter.dateTo) {
    const prevYear = String(Number(filter.year) - 1);
    return { allTime: false, year: prevYear, dateFrom: "", dateTo: "" };
  }

  if (filter.dateFrom && filter.dateTo) {
    const from = new Date(`${filter.dateFrom}T00:00:00`);
    const to = new Date(`${filter.dateTo}T00:00:00`);
    const isFullMonth =
      from.getDate() === 1 &&
      to.getDate() === new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate() &&
      from.getMonth() === to.getMonth() &&
      from.getFullYear() === to.getFullYear();

    if (isFullMonth && !filter.year) {
      const prevMonth = new Date(from.getFullYear(), from.getMonth() - 1, 1);
      const prevLastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
      return {
        allTime: false,
        year: "",
        dateFrom: `${prevMonth.getFullYear()}-${padDatePart(prevMonth.getMonth() + 1)}-01`,
        dateTo: `${prevMonth.getFullYear()}-${padDatePart(prevMonth.getMonth() + 1)}-${padDatePart(prevLastDay)}`,
      };
    }

    const msPerDay = 86400000;
    const days = Math.round((to - from) / msPerDay) + 1;
    const prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - days + 1);
    const fmt = (d) =>
      `${d.getFullYear()}-${padDatePart(d.getMonth() + 1)}-${padDatePart(d.getDate())}`;
    return { allTime: false, year: filter.year || "", dateFrom: fmt(prevFrom), dateTo: fmt(prevTo) };
  }

  if (filter.year) {
    return {
      allTime: false,
      year: String(Number(filter.year) - 1),
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    };
  }

  return null;
}

export function formatComparisonHint(current, previous, filter) {
  if (isAllTimeDashboardFilter(filter)) {
    return { text: "All time", tone: "muted" };
  }
  const label = getComparisonLabel(filter);
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0 && cur === 0) {
    return { text: `0% vs ${label}`, tone: "muted" };
  }
  if (prev === 0) {
    return { text: `+100% vs ${label}`, tone: "success" };
  }
  const pct = ((cur - prev) / prev) * 100;
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  const tone = rounded > 0 ? "success" : rounded < 0 ? "danger" : "muted";
  const text = Number.isInteger(rounded) ? `${sign}${rounded}%` : `${sign}${rounded.toFixed(1)}%`;
  return { text: `${text} vs ${label}`, tone };
}

export function countInDashboardFilter(rows, dateField, filter, fiscalYearStart = null) {
  return filterRowsByDashboard(rows, dateField, filter, fiscalYearStart).length;
}

export function sumInDashboardFilter(rows, dateField, valueField, filter, fiscalYearStart = null) {
  return filterRowsByDashboard(rows, dateField, filter, fiscalYearStart).reduce(
    (sum, row) => sum + (Number(row[valueField]) || 0),
    0
  );
}

export function rowMatchesDashboardFilter(value, filter, fiscalYearStart = null) {
  if (filter.allTime && !filter.year) return true;

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
  if (filter.allTime && !filter.year) return rows;
  return rows.filter((row) => rowMatchesDashboardFilter(row[dateField], filter, fiscalYearStart));
}
