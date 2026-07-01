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
import { StatusBadge } from "../../../../../../components/Badge";
import { EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE, EXCHANGE_STATUSES } from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "exchange_status", label: "Status", options: EXCHANGE_STATUSES },
  { key: "order_no", label: "Order #" },
  { key: "customer_name", label: "Customer" },
];

export default function ManageExchanges() {
  const { authFetch } = useAuth();
  const { canCreate } = useModulePermission("order-management");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, exchange_status: "", order_no: "", customer_name: "" });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "created_at", filters: TOOLBAR_FILTERS });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAllTableRows("/orders/exchanges/list", authFetch));
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
    { key: "old_product_name", label: "Old Product" },
    { key: "new_product_name", label: "New Product" },
    { key: "exchange_status", label: "Status", render: (r) => <StatusBadge status={r.exchange_status} /> },
    { key: "created_at", label: "Created", format: formatDateTime },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Exchange Management"
        description="View exchanged orders and add new exchange requests."
        actions={<Button onClick={() => navigate(`${MODULE_BASE}/exchanges/create`)} disabled={!canCreate}>Add New Exchange</Button>}
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="created_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search exchanges…" layout="stacked" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
