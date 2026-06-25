import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../../../../context/AuthContext";
import { fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { TableToolbar } from "../../../../../../components/TableToolbar";
import { StatusBadge } from "../../../../../../components/Badge";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MOVEMENT_LABELS, MOVEMENT_TYPES } from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "movement_type", label: "Type" },
  { key: "warehouse_name", label: "Warehouse" },
  { key: "product_name", label: "Product" },
];

export default function MovementHistory() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [toolbar, setToolbar] = useState({
    ...EMPTY_TOOLBAR,
    movement_type: "",
    warehouse_name: "",
    product_name: "",
  });

  const filteredRows = useMemo(
    () =>
      applyToolbarFilters(rows, toolbar, {
        dateField: "created_at",
        filters: TOOLBAR_FILTERS,
      }),
    [rows, toolbar]
  );

  useEffect(() => setPage(1), [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllTableRows("/inventory/stock-movements", authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const columns = [
    { key: "created_at", label: "Date", format: formatDateTime },
    { key: "movement_type", label: "Type", render: (r) => <StatusBadge status={MOVEMENT_LABELS[r.movement_type] || r.movement_type} /> },
    { key: "product_name", label: "Product" },
    { key: "sku", label: "SKU" },
    { key: "warehouse_name", label: "Warehouse" },
    { key: "qty", label: "Qty" },
    { key: "notes", label: "Notes", format: (v) => v || "—" },
    { key: "created_by_name", label: "Created by", format: (v) => v || "—" },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Stock Movement History"
        description="Complete audit trail of all inventory movements including initial stock, stock in/out, and transfers."
      />

      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="created_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search movements…" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </Card>

      <p className="wh-muted">Movement types: {MOVEMENT_TYPES.map((t) => MOVEMENT_LABELS[t] || t).join(" · ")}</p>
    </div>
  );
}
