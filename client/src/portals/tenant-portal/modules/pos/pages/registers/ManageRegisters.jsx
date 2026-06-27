import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../../../../context/AuthContext";
import { fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { TableToolbar } from "../../../../../../components/TableToolbar";
import { StatusBadge } from "../../../../../../components/Badge";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDateTime } from "../../../../../../utils/dateTime";

const TOOLBAR_FILTERS = [
  { key: "outlet_name", label: "Outlet" },
  { key: "terminal_name", label: "Terminal" },
  { key: "opened_by_name", label: "Opened by" },
];

export default function ManageRegisters() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState(EMPTY_TOOLBAR);

  const enrichedRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        shift_status: r.closed_at ? "closed" : "open",
      })),
    [rows]
  );

  const filteredRows = useMemo(
    () => applyToolbarFilters(enrichedRows, toolbar, { dateField: "opened_at", filters: TOOLBAR_FILTERS }),
    [enrichedRows, toolbar]
  );

  useEffect(() => setPage(1), [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/pos/registers", authFetch));
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const columns = [
    { key: "outlet_name", label: "Outlet" },
    { key: "terminal_name", label: "Terminal" },
    { key: "opened_by_name", label: "Opened by" },
    { key: "opening_balance", label: "Opening", format: (v) => formatPKR(v) },
    { key: "cash_collected", label: "Cash collected", format: (v) => formatPKR(v) },
    {
      key: "closing_balance",
      label: "Closing",
      format: (v, r) => (r.closed_at ? formatPKR(v) : "—"),
    },
    {
      key: "shift_status",
      label: "Shift",
      render: (r) => <StatusBadge status={r.closed_at ? "inactive" : "active"} />,
    },
    { key: "opened_at", label: "Opened", format: formatDateTime },
    { key: "closed_at", label: "Closed", format: (v) => (v ? formatDateTime(v) : "—") },
  ];

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Cash registers"
        description="Shift history per terminal. When a shift ends, the drawer total becomes the next shift opening balance."
      />
      {error && <p className="wh-field__error">{error}</p>}

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">Register shifts</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar
              rows={enrichedRows}
              value={toolbar}
              onChange={setToolbar}
              dateField="opened_at"
              filters={TOOLBAR_FILTERS}
              searchPlaceholder="Search shifts…"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              emptyMessage="No register shifts yet."
            />
          </>
        )}
      </Card>
    </div>
  );
}
