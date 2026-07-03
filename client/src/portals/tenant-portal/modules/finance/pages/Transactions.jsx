import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { Modal } from "../../../../../components/Modal";
import { Button } from "../../../../../components/Button";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import { PAYMENT_METHOD_LABELS, TRANSACTION_TYPE_LABELS, CUSTOMER_PAYMENT_SOURCE_LABELS, labelFor } from "../constants";

function SummaryGrid({ items }) {
  return (
    <div className="wh-tx-summary-grid">
      {items.map(({ label, value, accent }) => (
        <div key={label} className="wh-tx-summary-item">
          <span className="wh-tx-summary-item__label">{label}</span>
          <span className={`wh-tx-summary-item__value${accent ? " wh-tx-summary-item__value--accent" : ""}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

const TOOLBAR_FILTERS = [
  { key: "transaction_type", label: "Type" },
  { key: "payment_method", label: "Method" },
  { key: "reference", label: "Reference" },
];

export default function Transactions() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const filteredRows = useToolbarFilteredRows(rows, toolbar, {
    dateField: "transaction_at",
    filters: TOOLBAR_FILTERS,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/finance/transactions", authFetch));
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { setPage(1); }, [toolbar]);

  const openDetail = (row) => {
    setSelected(row);
    setDetailOpen(true);
  };

  const columns = [
    { key: "transaction_at", label: "Date", format: formatDateTime },
    { key: "transaction_type", label: "Type", format: (v) => labelFor(TRANSACTION_TYPE_LABELS, v) },
    { key: "amount", label: "Amount", format: (v) => formatPKR(v) },
    { key: "payment_method", label: "Method", format: (v) => labelFor(PAYMENT_METHOD_LABELS, v) },
    { key: "reference", label: "Reference", format: (v) => v || "—" },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Transactions" description="Complete financial transaction history." />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="transaction_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search transactions…" layout="stacked" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} onRowClick={openDetail} />
          </>
        )}
      </Card>

      <Modal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelected(null); }}
        title="Transaction details"
        className="wh-modal--transaction wh-modal--transaction-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>Close</Button>
            {selected?.order_id && (
              <Button onClick={() => navigate(`/app/m/order-management/orders/view/${selected.order_id}`)}>
                View order
              </Button>
            )}
          </>
        }
      >
        {selected && (
          <div className="wh-tx-panel">
            <h4 className="wh-tx-panel__title">What happened</h4>
            <SummaryGrid
              items={[
                { label: "Type", value: labelFor(TRANSACTION_TYPE_LABELS, selected.transaction_type) },
                { label: "Amount", value: formatPKR(selected.amount), accent: true },
                { label: "Method", value: labelFor(PAYMENT_METHOD_LABELS, selected.payment_method) },
                { label: "Reference", value: selected.reference || "—" },
                { label: "When", value: selected.transaction_at ? formatDateTime(selected.transaction_at) : "—" },
                ...(selected.source ? [{ label: "Source", value: labelFor(CUSTOMER_PAYMENT_SOURCE_LABELS, selected.source) }] : []),
                ...(selected.customer_name ? [{ label: "Customer", value: selected.customer_name }] : []),
                ...(selected.outlet_name ? [{ label: "POS outlet", value: selected.outlet_name }] : []),
                ...(selected.payment_status ? [{ label: "Payment status", value: selected.payment_status }] : []),
                { label: "Notes", value: selected.notes || "—" },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
