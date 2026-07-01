import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { TableToolbar } from "../../../../../../components/TableToolbar";
import { Button } from "../../../../../../components/Button";
import { EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE } from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "order_no", label: "Order #" },
  { key: "customer_name", label: "Customer" },
  { key: "cancelled_by_name", label: "Cancelled By" },
];

export default function ManageCancellations() {
  const { authFetch } = useAuth();
  const { canCreate } = useModulePermission("order-management");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, order_no: "", customer_name: "", cancelled_by_name: "" });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "cancelled_at", filters: TOOLBAR_FILTERS });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAllTableRows("/orders/cancellations/list", authFetch));
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const columns = [
    { key: "order_no", label: "Order #" },
    { key: "customer_name", label: "Customer", format: (v) => v || "—" },
    { key: "reason", label: "Reason", format: (v) => v || "—" },
    { key: "cancelled_by_name", label: "Cancelled By" },
    { key: "cancelled_at", label: "Cancelled", format: formatDateTime },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Cancellation Management"
        description="View cancelled orders and record new cancellations."
        actions={<Button onClick={() => navigate(`${MODULE_BASE}/cancellations/create`)} disabled={!canCreate}>Add New Cancellation</Button>}
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="cancelled_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search cancellations…" layout="stacked" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
