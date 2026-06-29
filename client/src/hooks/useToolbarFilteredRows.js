import { useMemo } from "react";
import { applyToolbarFilters } from "../utils/tableFilters";
import { useFiscalYear } from "../context/FiscalYearContext";

export function useToolbarFilteredRows(rows, toolbar, { dateField = "created_at", filters = [] } = {}) {
  const fiscalYearStart = useFiscalYear();
  return useMemo(
    () => applyToolbarFilters(rows, toolbar, { dateField, filters, fiscalYearStart }),
    [rows, toolbar, dateField, filters, fiscalYearStart]
  );
}
