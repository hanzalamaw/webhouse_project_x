import { useEffect, useMemo, useState } from "react";
import { getYearsFromRows } from "../utils/tableFilters";
import { getFiscalYearsFromRows } from "../utils/fiscalYearFilter";
import { useFiscalYear } from "../context/FiscalYearContext";
import {
  EMPTY_DASHBOARD_FILTER,
  dashboardFiltersEqual,
  normalizeDashboardFilterState,
} from "../utils/dashboardFilter";

export function DashboardFilter({
  rows = [],
  dateField = "created_at",
  value,
  onChange,
  defaultFilter = EMPTY_DASHBOARD_FILTER,
}) {
  const fiscalYearStart = useFiscalYear();
  const applied = useMemo(
    () => ({
      allTime: value?.allTime ?? defaultFilter.allTime,
      year: value?.year ?? defaultFilter.year ?? "",
      dateFrom: value?.dateFrom ?? defaultFilter.dateFrom ?? "",
      dateTo: value?.dateTo ?? defaultFilter.dateTo ?? "",
    }),
    [value, defaultFilter],
  );
  const [draft, setDraft] = useState(applied);

  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  const years = useMemo(() => {
    if (fiscalYearStart) {
      return getFiscalYearsFromRows(rows, dateField, fiscalYearStart) || [];
    }
    return getYearsFromRows(rows, dateField);
  }, [rows, dateField, fiscalYearStart]);

  const set = (patch) => setDraft((prev) => normalizeDashboardFilterState(prev, patch));

  const datesDisabled = draft.allTime;
  const isDirty = !dashboardFiltersEqual(draft, applied);

  const apply = () => onChange({ ...draft });
  const reset = () => {
    const next = { ...defaultFilter };
    setDraft(next);
    onChange(next);
  };

  return (
    <div className="wh-dash-filter">
      <label className="wh-dash-filter__label">
        <input
          type="checkbox"
          checked={draft.allTime}
          onChange={(e) => set({ allTime: e.target.checked })}
        />
        All time
      </label>
      <select
        className="wh-dash-filter__year"
        value={draft.year || ""}
        onChange={(e) => set({ year: e.target.value })}
        aria-label="Filter by year"
        disabled={draft.allTime}
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
          value={draft.dateFrom || ""}
          disabled={datesDisabled}
          onChange={(e) => set({ dateFrom: e.target.value })}
          aria-label="From date"
        />
        <span className="wh-dash-filter__sep">to</span>
        <input
          type="date"
          value={draft.dateTo || ""}
          disabled={datesDisabled}
          onChange={(e) => set({ dateTo: e.target.value })}
          aria-label="To date"
        />
      </div>
      <div className="wh-dash-filter__actions">
        <button
          type="button"
          className="wh-dash-filter__btn"
          onClick={apply}
          disabled={!isDirty}
        >
          Apply
        </button>
        <button
          type="button"
          className="wh-dash-filter__btn wh-dash-filter__btn--ghost"
          onClick={reset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
