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
import { formatPKR } from "../../../../../../utils/currency";
import { MODULE_BASE, REFUND_STATUSES } from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "refund_status", label: "Status", options: REFUND_STATUSES },
  { key: "order_no", label: "Order #" },
  { key: "customer_name", label: "Customer" },
];

export default function ManageRefunds() {
  const { authFetch } = useAuth();
  const { canCreate } = useModulePermission("order-management");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, refund_status: "", order_no: "", customer_name: "" });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "refunded_at", filters: TOOLBAR_FILTERS });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAllTableRows("/orders/refunds/list", authFetch));
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
    { key: "refund_amount", label: "Amount", format: (v) => formatPKR(v) },
    { key: "refund_method", label: "Method" },
    { key: "refund_status", label: "Status", render: (r) => <StatusBadge status={r.refund_status} /> },
    { key: "refunded_at", label: "Refunded", format: (v) => (v ? formatDateTime(v) : "—") },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Refund Management"
        description="View refunded orders and record new refunds."
        actions={<Button onClick={() => navigate(`${MODULE_BASE}/refunds/create`)} disabled={!canCreate}>Add New Refunds</Button>}
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="refunded_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search refunds…" layout="stacked" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
