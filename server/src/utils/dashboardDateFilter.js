import { getFiscalYearDateBounds } from "./fiscalYear.js";

export function isAllTimeDashboardFilter(filter = {}) {
  return (filter.allTime === true || filter.allTime === "true")
    && !filter.year
    && !filter.dateFrom
    && !filter.dateTo;
}

/** Build SQL date filter clause for dashboard aggregates. */
export function buildDashboardDateSql(filter = {}, column = "created_at") {
  const clauses = [];
  const params = [];
  const fiscalYearStart = filter.fiscalYearStart || null;

  if (isAllTimeDashboardFilter(filter)) {
    return { sql: "", params };
  }

  const hasCustomRange = Boolean(filter.dateFrom || filter.dateTo);
  const yearOnly = filter.year && !hasCustomRange;

  if (yearOnly) {
    if (fiscalYearStart) {
      const bounds = getFiscalYearDateBounds(Number(filter.year), fiscalYearStart);
      clauses.push(`DATE(${column}) >= ?`);
      params.push(bounds.start);
      clauses.push(`DATE(${column}) <= ?`);
      params.push(bounds.end);
    } else {
      clauses.push(`YEAR(${column}) = ?`);
      params.push(Number(filter.year));
    }
    return {
      sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
      params,
    };
  }

  // Custom date range takes precedence over year — use DATE() so month charts align with KPIs.
  if (filter.dateFrom) {
    clauses.push(`DATE(${column}) >= ?`);
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    clauses.push(`DATE(${column}) <= ?`);
    params.push(filter.dateTo);
  }

  return {
    sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    params,
  };
}

export function parseDashboardFilterQuery(query = {}) {
  return {
    allTime: query.all_time === "1" || query.all_time === "true",
    year: query.year ? String(query.year) : "",
    dateFrom: query.date_from ? String(query.date_from) : "",
    dateTo: query.date_to ? String(query.date_to) : "",
  };
}
