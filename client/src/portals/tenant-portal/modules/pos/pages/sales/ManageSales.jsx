import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { TableToolbar } from "../../../../../../components/TableToolbar";
import { Modal } from "../../../../../../components/Modal";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../../hooks/useToolbarFilteredRows";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { PAYMENT_STATUSES } from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "payment_status", label: "Payment", options: PAYMENT_STATUSES },
  { key: "outlet_name", label: "Store" },
  { key: "terminal_name", label: "Terminal" },
];

export default function ManageSales() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, payment_status: "" });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "created_at", filters: TOOLBAR_FILTERS });

  useEffect(() => setPage(1), [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/pos/sales", authFetch));
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const openDetail = async (row) => {
    setDetailLoading(true);
    setDetail({ id: row.id, sale_no: row.sale_no });
    try {
      const sale = await apiFetch(`/pos/sales/${row.id}`, {}, authFetch);
      setDetail(sale);
    } catch (err) {
      setError(err.message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = [
    { key: "sale_no", label: "Sale #" },
    { key: "outlet_name", label: "Store" },
    { key: "terminal_name", label: "Terminal" },
    { key: "cashier_name", label: "Cashier" },
    { key: "payable_amount", label: "Amount", format: (v) => formatPKR(v) },
    { key: "payment_status", label: "Payment", render: (r) => <StatusBadge status={r.payment_status} /> },
    { key: "created_at", label: "Date", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (r) => (
        <Button variant="secondary" className="wh-btn--sm" onClick={() => openDetail(r)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader title="Sales" description="All POS transactions across outlets and terminals." />
      {error && <p className="wh-field__error">{error}</p>}

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">All sales</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="created_at"
              filters={TOOLBAR_FILTERS}
              searchPlaceholder="Search sales…"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              emptyMessage="No sales yet."
            />
          </>
        )}
      </Card>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.sale_no ? `Sale ${detail.sale_no}` : "Sale details"}
        wide
      >
        {detailLoading ? (
          <p className="wh-muted">Loading…</p>
        ) : detail ? (
          <>
            <div className="wh-grid-2 wh-inv-expand-grid" style={{ marginBottom: 16 }}>
              <div><span className="wh-muted">Store</span><p>{detail.outlet_name}</p></div>
              <div><span className="wh-muted">Terminal</span><p>{detail.terminal_name}</p></div>
              <div><span className="wh-muted">Cashier</span><p>{detail.cashier_name}</p></div>
              <div><span className="wh-muted">Customer</span><p>{detail.customer_name || "Walk-in"}</p></div>
              <div><span className="wh-muted">Subtotal</span><p>{formatPKR(detail.total_amount)}</p></div>
              <div><span className="wh-muted">Payable</span><p>{formatPKR(detail.payable_amount)}</p></div>
              <div><span className="wh-muted">Payment</span><p><StatusBadge status={detail.payment_status} /></p></div>
              <div><span className="wh-muted">Date</span><p>{formatDateTime(detail.created_at)}</p></div>
            </div>
            <h4 className="wh-card__title">Line items</h4>
            <div className="wh-mini-list">
              {(detail.items || []).map((item) => (
                <div className="wh-mini-row" key={item.id}>
                  <div className="wh-mini-row__main">
                    <div className="wh-mini-row__title">{item.product_name}</div>
                    <div className="wh-mini-row__sub">
                      {item.sku} · {item.quantity} × {formatPKR(item.unit_price)}
                    </div>
                  </div>
                  <span className="wh-mini-row__value">{formatPKR(item.total_price)}</span>
                </div>
              ))}
              {!detail.items?.length && <p className="wh-muted">No line items.</p>}
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
