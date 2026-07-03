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
import { StatusBadge } from "../../../../../components/Badge";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import { CUSTOMER_PAYMENT_SOURCE_LABELS, PAYMENT_METHOD_LABELS, labelFor } from "../constants";

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
  { key: "source", label: "Source", options: ["order", "pos"] },
  { key: "customer_name", label: "Customer" },
  { key: "reference_no", label: "Reference #" },
  { key: "payment_method", label: "Method" },
  { key: "payment_status", label: "Status" },
];

export default function CustomerPayments() {
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
    dateField: "paid_at",
    filters: TOOLBAR_FILTERS,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/finance/customer-payments", authFetch));
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
    { key: "paid_at", label: "Date", format: formatDateTime },
    {
      key: "source",
      label: "Source",
      format: (v) => labelFor(CUSTOMER_PAYMENT_SOURCE_LABELS, v),
    },
    { key: "reference_no", label: "Reference #" },
    { key: "customer_name", label: "Customer", format: (v) => v || "Walk-in" },
    { key: "payment_method", label: "Method", format: (v) => labelFor(PAYMENT_METHOD_LABELS, v) },
    { key: "amount", label: "Amount", format: (v) => formatPKR(v) },
    { key: "payment_status", label: "Status", render: (r) => <StatusBadge status={r.payment_status} /> },
  ];

  const detailTitle = selected
    ? `Payment — ${selected.reference_no || selected.order_no || "—"}`
    : "Payment";

  return (
    <div className="wh-page">
      <PageHeader
        title="Customer Payments"
        description="Payments from Inventory & Procurement orders and POS terminal sales."
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="paid_at"
              filters={TOOLBAR_FILTERS}
              searchPlaceholder="Search payments…"
              layout="stacked"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={openDetail}
            />
          </>
        )}
      </Card>

      <Modal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelected(null); }}
        title={detailTitle}
        className="wh-modal--transaction wh-modal--transaction-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>Close</Button>
            {selected?.source === "order" && selected?.order_id && (
              <Button onClick={() => navigate(`/app/m/order-management/orders/view/${selected.order_id}`)}>
                View order
              </Button>
            )}
          </>
        }
      >
        {selected && (
          <div className="wh-tx-panel">
            <h4 className="wh-tx-panel__title">Payment details</h4>
            <SummaryGrid
              items={[
                { label: "Source", value: labelFor(CUSTOMER_PAYMENT_SOURCE_LABELS, selected.source) },
                { label: "Reference #", value: selected.reference_no || "—" },
                { label: "Customer", value: selected.customer_name || "Walk-in" },
                { label: "Amount", value: formatPKR(selected.amount), accent: true },
                { label: "Method", value: labelFor(PAYMENT_METHOD_LABELS, selected.payment_method) },
                { label: "Payment status", value: selected.payment_status || "—" },
                ...(selected.source === "order"
                  ? [{ label: "Order payment status", value: selected.order_payment_status || "—" }]
                  : []),
                ...(selected.outlet_name ? [{ label: "POS outlet", value: selected.outlet_name }] : []),
                { label: "Total", value: formatPKR(selected.payable_amount) },
                { label: "Paid at", value: selected.paid_at ? formatDateTime(selected.paid_at) : "—" },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
