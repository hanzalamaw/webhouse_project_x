import { useMemo } from "react";
import { getYearsFromRows } from "../utils/tableFilters";
import { getFiscalYearsFromRows } from "../utils/fiscalYearFilter";
import { useFiscalYear } from "../context/FiscalYearContext";
import { EMPTY_DASHBOARD_FILTER } from "../utils/dashboardFilter";

export function DashboardFilter({
  rows = [],
  dateField = "created_at",
  value,
  onChange,
}) {
  const fiscalYearStart = useFiscalYear();
  const filter = value || EMPTY_DASHBOARD_FILTER;

  const years = useMemo(() => {
    if (fiscalYearStart) {
      return getFiscalYearsFromRows(rows, dateField, fiscalYearStart) || [];
    }
    return getYearsFromRows(rows, dateField);
  }, [rows, dateField, fiscalYearStart]);

  const set = (patch) => onChange({ ...filter, ...patch });

  const datesDisabled = filter.allTime && !filter.year;

  return (
    <div className="wh-dash-filter">
      <label className="wh-dash-filter__label">
        <input
          type="checkbox"
          checked={filter.allTime}
          onChange={(e) => set({ allTime: e.target.checked, year: e.target.checked ? "" : filter.year })}
        />
        All time
      </label>
      <select
        className="wh-dash-filter__year"
        value={filter.year || ""}
        onChange={(e) => set({ year: e.target.value, allTime: e.target.value ? false : filter.allTime })}
        aria-label="Filter by year"
        disabled={filter.allTime && !filter.year}
      >
        <option value="">All years</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {fiscalYearStart ? `FY ${y}` : y}
          </option>
        ))}
      </select>
      <div className="wh-dash-filter__dates">
        <input
          type="date"
          value={filter.dateFrom || ""}
          disabled={datesDisabled}
          onChange={(e) => set({ dateFrom: e.target.value, allTime: false })}
          aria-label="From date"
        />
        <span className="wh-dash-filter__sep">to</span>
        <input
          type="date"
          value={filter.dateTo || ""}
          disabled={datesDisabled}
          onChange={(e) => set({ dateTo: e.target.value, allTime: false })}
          aria-label="To date"
        />
      </div>
    </div>
  );
}
