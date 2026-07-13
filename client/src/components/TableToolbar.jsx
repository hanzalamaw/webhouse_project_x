import { useMemo } from "react";
import { getYearsFromRows, getFilterOptions, normalizeToolbarFilterState } from "../utils/tableFilters";
import { getFiscalYearsFromRows } from "../utils/fiscalYearFilter";
import { useFiscalYear } from "../context/FiscalYearContext";

export function TableToolbar({
  rows = [],
  value,
  onChange,
  dateField = "created_at",
  filters = [],
  searchPlaceholder = "Search…",
  layout = "default",
}) {
  const fiscalYearStart = useFiscalYear();
  const years = useMemo(() => {
    if (fiscalYearStart) {
      return getFiscalYearsFromRows(rows, dateField, fiscalYearStart) || [];
    }
    return getYearsFromRows(rows, dateField);
  }, [rows, dateField, fiscalYearStart]);

  const filterOptions = useMemo(() => {
    const opts = {};
    for (const f of filters) {
      opts[f.key] = f.options || getFilterOptions(rows, f.key);
    }
    return opts;
  }, [rows, filters]);

  const set = (patch) => onChange(normalizeToolbarFilterState(value, patch));

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

  const stacked = layout === "stacked";

  // In stacked mode each control gets a visible label for a cleaner, less cramped grid.
  const field = (labelText, control, key) =>
    stacked ? (
      <label key={key} className="wh-table-toolbar__field">
        <span className="wh-table-toolbar__field-label">{labelText}</span>
        {control}
      </label>
    ) : (
      control
    );

  return (
    <div className={`wh-table-toolbar${stacked ? " wh-table-toolbar--stacked" : ""}`}>
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
        {field(
          "Year",
          <select
            className="wh-table-toolbar__select"
            value={value.year || ""}
            onChange={(e) => set({ year: e.target.value })}
            aria-label="Filter by year"
          >
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {fiscalYearStart ? `FY ${y}` : y}
              </option>
            ))}
          </select>,
          "year"
        )}
        {field(
          "From date",
          <input
            type="date"
            className="wh-table-toolbar__date"
            value={value.dateFrom || ""}
            onChange={(e) => set({ dateFrom: e.target.value })}
            aria-label="From date"
            title="From date"
          />,
          "dateFrom"
        )}
        {field(
          "To date",
          <input
            type="date"
            className="wh-table-toolbar__date"
            value={value.dateTo || ""}
            onChange={(e) => set({ dateTo: e.target.value })}
            aria-label="To date"
            title="To date"
          />,
          "dateTo"
        )}
        {filters.map((f) =>
          field(
            f.label,
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
            </select>,
            f.key
          )
        )}
      </div>
      {hasActive && (
        <div className="wh-table-toolbar__actions">
          <button type="button" className="wh-table-toolbar__clear" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
