import { useMemo } from "react";
import { getYearsFromRows, getFilterOptions } from "../utils/tableFilters";

export function TableToolbar({
  rows = [],
  value,
  onChange,
  dateField = "created_at",
  filters = [],
  searchPlaceholder = "Search…",
}) {
  const years = useMemo(() => getYearsFromRows(rows, dateField), [rows, dateField]);

  const filterOptions = useMemo(() => {
    const opts = {};
    for (const f of filters) {
      opts[f.key] = f.options || getFilterOptions(rows, f.key);
    }
    return opts;
  }, [rows, filters]);

  const set = (patch) => onChange({ ...value, ...patch });

  const clear = () => {
    const cleared = { search: "", year: "", dateFrom: "", dateTo: "" };
    for (const f of filters) cleared[f.key] = "";
    onChange(cleared);
  };

  const hasActive =
    value.search ||
    value.year ||
    value.dateFrom ||
    value.dateTo ||
    filters.some((f) => value[f.key]);

  return (
    <div className="wh-table-toolbar">
      <div className="wh-table-toolbar__search">
        <svg className="wh-table-toolbar__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className="wh-table-toolbar__input"
          placeholder={searchPlaceholder}
          value={value.search || ""}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>
      <div className="wh-table-toolbar__filters">
        <select
          className="wh-table-toolbar__select"
          value={value.year || ""}
          onChange={(e) => set({ year: e.target.value })}
          aria-label="Filter by year"
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <input
          type="date"
          className="wh-table-toolbar__date"
          value={value.dateFrom || ""}
          onChange={(e) => set({ dateFrom: e.target.value })}
          aria-label="From date"
          title="From date"
        />
        <input
          type="date"
          className="wh-table-toolbar__date"
          value={value.dateTo || ""}
          onChange={(e) => set({ dateTo: e.target.value })}
          aria-label="To date"
          title="To date"
        />
        {filters.map((f) => (
          <select
            key={f.key}
            className="wh-table-toolbar__select"
            value={value[f.key] || ""}
            onChange={(e) => set({ [f.key]: e.target.value })}
            aria-label={f.label}
          >
            <option value="">All {f.label.toLowerCase()}</option>
            {(filterOptions[f.key] || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ))}
        {hasActive && (
          <button type="button" className="wh-table-toolbar__clear" onClick={clear}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
