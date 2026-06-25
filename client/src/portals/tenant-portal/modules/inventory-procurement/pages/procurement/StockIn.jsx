import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MOVEMENT_LABELS, MODULE_BASE } from "../../constants";

export default function StockIn() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllTableRows("/inventory/stock-movements?movement_type=stock_in", authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const columns = [
    { key: "product_name", label: "Product" },
    { key: "sku", label: "SKU" },
    { key: "warehouse_name", label: "Warehouse" },
    { key: "qty", label: "Qty" },
    { key: "notes", label: "Notes", format: (v) => v || "—" },
    { key: "created_by_name", label: "By", format: (v) => v || "—" },
    { key: "created_at", label: "Date", format: formatDateTime },
    { key: "movement_type", label: "Type", render: (r) => <StatusBadge status={MOVEMENT_LABELS[r.movement_type] || r.movement_type} /> },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Stock In"
        description="View stock-in history. Record new stock from the create page."
        actions={<Button onClick={() => navigate(`${MODULE_BASE}/procurement/stock-in/create`)}>Record Stock In</Button>}
      />
      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">Stock in history</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable columns={columns} rows={rows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
        )}
      </Card>
    </div>
  );
}
