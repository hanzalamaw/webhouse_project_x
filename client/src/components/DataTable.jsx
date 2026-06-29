import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Pagination } from "./Pagination";
import { getMonthName } from "../utils/dateTime";

const PANEL_WIDTH = 300;
const PANEL_EST_HEIGHT = 360;
const VIEWPORT_PAD = 12;
const DATE_KEY_PATTERN = /_(at|date)$/i;

function getColumnValue(row, col) {
  if (col.getValue) return col.getValue(row);
  return row[col.key];
}

function getDisplayText(row, col) {
  const raw = getColumnValue(row, col);
  if (col.format) return col.format(raw, row);
  if (raw == null || raw === "") return "—";
  return String(raw);
}

function isFilterable(col) {
  return col.key && col.filter !== false;
}

function isDateColumn(col) {
  if (col.filterType === "date") return true;
  if (col.filterType === "text") return false;
  return Boolean(col.key && DATE_KEY_PATTERN.test(col.key));
}

function parseRowDate(row, col) {
  const raw = getColumnValue(row, col);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildDateFilterTree(baseRows, col) {
  const tree = new Map();

  for (const row of baseRows) {
    const date = parseRowDate(row, col);
    if (!date) continue;

    const year = date.getFullYear();
    const month = date.getMonth();
    const dayKey = `${year}-${month}-${date.getDate()}`;
    const display = getDisplayText(row, col);
    const dayLabel = date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    if (!tree.has(year)) tree.set(year, new Map());
    const yearMap = tree.get(year);
    if (!yearMap.has(month)) yearMap.set(month, new Map());
    const monthMap = yearMap.get(month);
    if (!monthMap.has(dayKey)) monthMap.set(dayKey, { dayLabel, displays: new Set() });
    monthMap.get(dayKey).displays.add(display);
  }

  return tree;
}

function getYearLeaves(yearMap) {
  const leaves = [];
  for (const monthMap of yearMap.values()) {
    for (const dayNode of monthMap.values()) {
      leaves.push(...dayNode.displays);
    }
  }
  return leaves;
}

function getMonthLeaves(monthMap) {
  const leaves = [];
  for (const dayNode of monthMap.values()) {
    leaves.push(...dayNode.displays);
  }
  return leaves;
}

function getTreeLeaves(tree) {
  const leaves = [];
  for (const yearMap of tree.values()) {
    leaves.push(...getYearLeaves(yearMap));
  }
  return leaves;
}

function inclusionState(leaves, excludedSet) {
  if (!leaves.length) return "none";
  let included = 0;
  for (const value of leaves) {
    if (!excludedSet?.has(value)) included += 1;
  }
  if (included === 0) return "none";
  if (included === leaves.length) return "all";
  return "partial";
}

function filterDateTree(tree, query) {
  if (!query) return tree;

  const q = query.toLowerCase();
  const filtered = new Map();

  for (const [year, yearMap] of tree) {
    const yearStr = String(year);
    if (yearStr.includes(q)) {
      filtered.set(year, yearMap);
      continue;
    }

    const filteredMonths = new Map();
    for (const [month, monthMap] of yearMap) {
      const monthName = getMonthName(month).toLowerCase();
      const monthShort = new Date(2000, month, 1)
        .toLocaleDateString("en-US", { month: "short" })
        .toLowerCase();

      if (
        monthName.includes(q) ||
        monthShort.includes(q) ||
        `${monthName} ${year}`.includes(q) ||
        `${monthShort} ${year}`.includes(q)
      ) {
        filteredMonths.set(month, monthMap);
        continue;
      }

      const filteredDays = new Map();
      for (const [dayKey, dayNode] of monthMap) {
        if (dayNode.dayLabel.toLowerCase().includes(q)) {
          filteredDays.set(dayKey, dayNode);
        }
      }
      if (filteredDays.size) filteredMonths.set(month, filteredDays);
    }

    if (filteredMonths.size) filtered.set(year, filteredMonths);
  }

  return filtered;
}

function IndeterminateCheckbox({ state, onChange }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = state === "partial";
    }
  }, [state]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={state === "all"}
      onChange={onChange}
    />
  );
}

function DateFilterTree({
  tree,
  colKey,
  excluded,
  expandedNodes,
  onToggleExpand,
  onToggleLeaves,
  forceExpand,
}) {
  const excludedSet = excluded[colKey];
  const sortedYears = [...tree.keys()].sort((a, b) => b - a);

  if (!sortedYears.length) {
    return <p className="wh-table-filter__empty">No matching values</p>;
  }

  return sortedYears.map((year) => {
    const yearMap = tree.get(year);
    const yearLeaves = getYearLeaves(yearMap);
    const yearNodeId = `y:${year}`;
    const yearExpanded = forceExpand || expandedNodes.has(yearNodeId);
    const yearState = inclusionState(yearLeaves, excludedSet);
    const sortedMonths = [...yearMap.keys()].sort((a, b) => a - b);

    return (
      <div key={year} className="wh-table-filter-date__group">
        <div className="wh-table-filter-date__row">
          <button
            type="button"
            className="wh-table-filter-date__expand"
            onClick={() => onToggleExpand(yearNodeId)}
            aria-expanded={yearExpanded}
            aria-label={yearExpanded ? `Collapse ${year}` : `Expand ${year}`}
          >
            {yearExpanded ? "−" : "+"}
          </button>
          <label className="wh-table-filter__item wh-table-filter-date__item">
            <IndeterminateCheckbox
              state={yearState}
              onChange={() => onToggleLeaves(colKey, yearLeaves, yearState !== "all")}
            />
            <span>{year}</span>
          </label>
        </div>

        {yearExpanded &&
          sortedMonths.map((month) => {
            const monthMap = yearMap.get(month);
            const monthLeaves = getMonthLeaves(monthMap);
            const monthNodeId = `y:${year}:m:${month}`;
            const monthExpanded = forceExpand || expandedNodes.has(monthNodeId);
            const monthState = inclusionState(monthLeaves, excludedSet);
            const monthLabel = getMonthName(month);
            const sortedDays = [...monthMap.entries()].sort((a, b) =>
              a[1].dayLabel.localeCompare(b[1].dayLabel, undefined, {
                numeric: true,
                sensitivity: "base",
              })
            );

            return (
              <div key={monthNodeId} className="wh-table-filter-date__group wh-table-filter-date__group--month">
                <div className="wh-table-filter-date__row">
                  <button
                    type="button"
                    className="wh-table-filter-date__expand"
                    onClick={() => onToggleExpand(monthNodeId)}
                    aria-expanded={monthExpanded}
                    aria-label={monthExpanded ? `Collapse ${monthLabel}` : `Expand ${monthLabel}`}
                  >
                    {monthExpanded ? "−" : "+"}
                  </button>
                  <label className="wh-table-filter__item wh-table-filter-date__item">
                    <IndeterminateCheckbox
                      state={monthState}
                      onChange={() => onToggleLeaves(colKey, monthLeaves, monthState !== "all")}
                    />
                    <span>{monthLabel}</span>
                  </label>
                </div>

                {monthExpanded &&
                  sortedDays.map(([dayKey, dayNode]) => {
                    const dayLeaves = [...dayNode.displays];
                    const dayState = inclusionState(dayLeaves, excludedSet);

                    return (
                      <div
                        key={dayKey}
                        className="wh-table-filter-date__row wh-table-filter-date__row--day"
                      >
                        <span className="wh-table-filter-date__spacer" aria-hidden="true" />
                        <label className="wh-table-filter__item wh-table-filter-date__item">
                          <IndeterminateCheckbox
                            state={dayState}
                            onChange={() => onToggleLeaves(colKey, dayLeaves, dayState !== "all")}
                          />
                          <span>{dayNode.dayLabel}</span>
                        </label>
                      </div>
                    );
                  })}
              </div>
            );
          })}
      </div>
    );
  });
}

function computePanelStyle(anchorRect) {
  let left = anchorRect.left;
  let top = anchorRect.bottom + 6;

  if (left + PANEL_WIDTH > window.innerWidth - VIEWPORT_PAD) {
    left = window.innerWidth - PANEL_WIDTH - VIEWPORT_PAD;
  }
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

  const spaceBelow = window.innerHeight - top - VIEWPORT_PAD;
  const spaceAbove = anchorRect.top - VIEWPORT_PAD;
  let maxHeight = PANEL_EST_HEIGHT;

  if (spaceBelow < 180 && spaceAbove > spaceBelow) {
    maxHeight = Math.min(PANEL_EST_HEIGHT, spaceAbove - 6);
    top = anchorRect.top - maxHeight - 6;
  } else {
    maxHeight = Math.min(PANEL_EST_HEIGHT, spaceBelow);
  }

  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;

  return {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    width: `${PANEL_WIDTH}px`,
    maxHeight: `${maxHeight}px`,
    zIndex: 10000,
  };
}

export function DataTable({
  columns,
  rows,
  filterRows,
  rowKey = "id",
  emptyMessage = "No records found.",
  page,
  pageSize,
  onPageChange,
  onRowClick,
}) {
  const [excluded, setExcluded] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [expandedDateNodes, setExpandedDateNodes] = useState(() => new Set());
  const [panelStyle, setPanelStyle] = useState(null);
  const filterPanelRef = useRef(null);
  const anchorRef = useRef(null);

  const filterableColumns = useMemo(() => columns.filter(isFilterable), [columns]);

  const openColumn = useMemo(
    () => filterableColumns.find((c) => (c.key || c.label) === openFilter) || null,
    [filterableColumns, openFilter]
  );

  const openColumnIsDate = openColumn ? isDateColumn(openColumn) : false;

  const updatePanelPosition = useCallback(() => {
    if (!anchorRef.current) return;
    setPanelStyle(computePanelStyle(anchorRef.current.getBoundingClientRect()));
  }, []);

  const openFilterPanel = (colId, btn) => {
    anchorRef.current = btn;
    setFilterSearch("");
    setExpandedDateNodes(new Set());
    setOpenFilter(colId);
    setPanelStyle(computePanelStyle(btn.getBoundingClientRect()));
  };

  const closeFilterPanel = () => {
    setOpenFilter(null);
    setPanelStyle(null);
    anchorRef.current = null;
  };

  const toggleDateExpand = (nodeId) => {
    setExpandedDateNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  useEffect(() => {
    if (!openFilter) return;
    const onScrollOrResize = () => updatePanelPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [openFilter, updatePanelPosition]);

  useEffect(() => {
    if (!openFilter) return;
    const handler = (e) => {
      if (filterPanelRef.current?.contains(e.target)) return;
      if (e.target.closest?.(".wh-table-filter__btn")) return;
      closeFilterPanel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openFilter]);

  const sourceRows = filterRows ?? rows;

  const applyRowFilters = useCallback(
    (data) => {
      if (!data?.length) return [];
      return data.filter((row) =>
        filterableColumns.every((col) => {
          const excludedSet = excluded[col.key];
          if (!excludedSet || excludedSet.size === 0) return true;
          return !excludedSet.has(getDisplayText(row, col));
        })
      );
    },
    [excluded, filterableColumns]
  );

  const filteredRows = useMemo(
    () => applyRowFilters(sourceRows),
    [sourceRows, applyRowFilters]
  );

  const displayRows = useMemo(() => {
    if (!pageSize) return filteredRows;
    const p = page || 1;
    const start = (p - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const baseRowsForOpenColumn = useMemo(() => {
    if (!openColumn) return [];
    const otherFilters = filterableColumns.filter((c) => c.key !== openColumn.key);
    return (sourceRows || []).filter((row) =>
      otherFilters.every((oc) => {
        const excludedSet = excluded[oc.key];
        if (!excludedSet || excludedSet.size === 0) return true;
        return !excludedSet.has(getDisplayText(row, oc));
      })
    );
  }, [sourceRows, excluded, filterableColumns, openColumn]);

  const columnOptions = useMemo(() => {
    const options = {};
    for (const col of filterableColumns) {
      if (isDateColumn(col)) continue;
      const otherFilters = filterableColumns.filter((c) => c.key !== col.key);
      const baseRows = (sourceRows || []).filter((row) =>
        otherFilters.every((oc) => {
          const excludedSet = excluded[oc.key];
          if (!excludedSet || excludedSet.size === 0) return true;
          return !excludedSet.has(getDisplayText(row, oc));
        })
      );
      options[col.key] = [
        ...new Set(baseRows.map((row) => getDisplayText(row, col))),
      ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    }
    return options;
  }, [sourceRows, excluded, filterableColumns]);

  const dateFilterTree = useMemo(() => {
    if (!openColumn || !openColumnIsDate) return new Map();
    return buildDateFilterTree(baseRowsForOpenColumn, openColumn);
  }, [openColumn, openColumnIsDate, baseRowsForOpenColumn]);

  const filteredDateTree = useMemo(() => {
    if (!openColumnIsDate) return new Map();
    return filterDateTree(dateFilterTree, filterSearch.trim());
  }, [openColumnIsDate, dateFilterTree, filterSearch]);

  const visibleOptions = useMemo(() => {
    if (!openColumn || openColumnIsDate) return [];
    const all = columnOptions[openColumn.key] || [];
    const q = filterSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((v) => v.toLowerCase().includes(q));
  }, [openColumn, openColumnIsDate, columnOptions, filterSearch]);

  const visibleLeafValues = useMemo(() => {
    if (!openColumn) return [];
    if (openColumnIsDate) return getTreeLeaves(filteredDateTree);
    return visibleOptions;
  }, [openColumn, openColumnIsDate, filteredDateTree, visibleOptions]);

  const bumpPageToFirst = () => {
    if (onPageChange) onPageChange(1);
  };

  const toggleFilterValue = (colKey, value) => {
    setExcluded((prev) => {
      const current = new Set(prev[colKey] || []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      const next = { ...prev };
      if (current.size) next[colKey] = current;
      else delete next[colKey];
      return next;
    });
    bumpPageToFirst();
  };

  const toggleLeavesInclusion = (colKey, leaves, include) => {
    setExcluded((prev) => {
      const current = new Set(prev[colKey] || []);
      for (const value of leaves) {
        if (include) current.delete(value);
        else current.add(value);
      }
      const next = { ...prev };
      if (current.size) next[colKey] = current;
      else delete next[colKey];
      return next;
    });
    bumpPageToFirst();
  };

  const clearVisibleSelections = () => {
    if (!openColumn || visibleLeafValues.length === 0) return;
    setExcluded((prev) => {
      const current = new Set(prev[openColumn.key] || []);
      for (const value of visibleLeafValues) current.add(value);
      return { ...prev, [openColumn.key]: current };
    });
    bumpPageToFirst();
  };

  const selectAllVisible = () => {
    if (!openColumn || visibleLeafValues.length === 0) return;
    setExcluded((prev) => {
      const current = new Set(prev[openColumn.key] || []);
      for (const value of visibleLeafValues) current.delete(value);
      const next = { ...prev };
      if (current.size) next[openColumn.key] = current;
      else delete next[openColumn.key];
      return next;
    });
    bumpPageToFirst();
  };

  const renderCell = (row, col) => {
    if (col.render) return col.render(row);
    if (col.format) return col.format(getColumnValue(row, col), row);
    const val = getColumnValue(row, col);
    return val ?? "—";
  };

  const activeFilterCount = (colKey) => excluded[colKey]?.size || 0;

  const allVisibleExcluded =
    openColumn &&
    visibleLeafValues.length > 0 &&
    visibleLeafValues.every((v) => excluded[openColumn.key]?.has(v));

  const searchActive = Boolean(filterSearch.trim());

  const filterPanel =
    openColumn && panelStyle
      ? createPortal(
          <div
            className="wh-table-filter-overlay"
            ref={filterPanelRef}
            style={panelStyle}
            role="dialog"
            aria-label={`Filter ${openColumn.label}`}
          >
            <div className="wh-table-filter-overlay__header">
              <span className="wh-table-filter-overlay__title">Filter: {openColumn.label}</span>
              <div className="wh-table-filter-overlay__actions">
                <button
                  type="button"
                  className="wh-table-filter__clear"
                  onClick={clearVisibleSelections}
                  disabled={!visibleLeafValues.length || allVisibleExcluded}
                >
                  Clear
                </button>
                {visibleLeafValues.length > 0 && (
                  <button
                    type="button"
                    className="wh-table-filter__select-all"
                    onClick={selectAllVisible}
                  >
                    Select all
                  </button>
                )}
                <button
                  type="button"
                  className="wh-table-filter-overlay__close"
                  onClick={closeFilterPanel}
                  aria-label="Close filter"
                >
                  ×
                </button>
              </div>
            </div>
            <input
              type="search"
              className="wh-table-filter-overlay__search"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
            />
            <div className="wh-table-filter-overlay__list">
              {openColumnIsDate ? (
                <DateFilterTree
                  tree={filteredDateTree}
                  colKey={openColumn.key}
                  excluded={excluded}
                  expandedNodes={expandedDateNodes}
                  onToggleExpand={toggleDateExpand}
                  onToggleLeaves={toggleLeavesInclusion}
                  forceExpand={searchActive}
                />
              ) : visibleOptions.length === 0 ? (
                <p className="wh-table-filter__empty">No matching values</p>
              ) : (
                visibleOptions.map((value) => (
                  <label key={value} className="wh-table-filter__item">
                    <input
                      type="checkbox"
                      checked={!excluded[openColumn.key]?.has(value)}
                      onChange={() => toggleFilterValue(openColumn.key, value)}
                    />
                    <span>{value}</span>
                  </label>
                ))
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="wh-table-container">
      {filterPanel}
      <div className={`wh-table-wrap${onRowClick ? " wh-table-wrap--clickable" : ""}`}>
        <table className="wh-table">
          <thead>
            <tr>
              {columns.map((col) => {
                const colId = col.key || col.label;
                const filterable = isFilterable(col);
                const isOpen = openFilter === colId;

                return (
                  <th key={colId}>
                    <div className="wh-table-th">
                      <span className="wh-table-th__label">{col.label}</span>
                      {filterable && (
                        <button
                          type="button"
                          className={`wh-table-filter__btn${activeFilterCount(col.key) ? " wh-table-filter__btn--active" : ""}${isOpen ? " wh-table-filter__btn--open" : ""}`}
                          onClick={(e) => {
                            if (isOpen) closeFilterPanel();
                            else openFilterPanel(colId, e.currentTarget);
                          }}
                          aria-label={`Filter ${col.label}`}
                          aria-expanded={isOpen}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!displayRows.length ? (
              <tr>
                <td colSpan={columns.length} className="wh-table-empty">
                  {sourceRows?.length ? "No rows match the current filters." : emptyMessage}
                </td>
              </tr>
            ) : (
              displayRows.map((row) => (
                <tr
                  key={row[rowKey]}
                  className={onRowClick ? "wh-table__row--clickable" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key || col.label}
                      className={col.stopRowClick ? "wh-table__cell--no-row-click" : undefined}
                      onClick={col.stopRowClick ? (e) => e.stopPropagation() : undefined}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageSize && onPageChange && (
        <Pagination
          pagination={{
            page: page || 1,
            totalPages: Math.ceil(filteredRows.length / pageSize) || 1,
            total: filteredRows.length,
          }}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
