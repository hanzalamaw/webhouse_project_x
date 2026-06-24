import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { StatCard } from "../../../../components/StatCard";
import { DataTable } from "../../../../components/DataTable";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { formatPKR } from "../../../../utils/currency";
import { formatDateTime } from "../../../../utils/dateTime";

export default function Transaction() {
  const { authFetch } = useAuth();
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    const data = await apiFetch("/transactions/summary", {}, authFetch);
    setSummary(data);
  }, [authFetch]);

  const loadPayments = useCallback(async () => {
    const data = await fetchAllTableRows("/transactions/payments", authFetch);
    setRows(data);
  }, [authFetch]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadSummary(), loadPayments()])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadSummary, loadPayments]);

  const columns = [
    { key: "company_name", label: "Tenant" },
    { key: "plan_name", label: "Plan", format: (v) => v || "—" },
    { key: "billing_cycle", label: "Cycle" },
    { key: "total_amount", label: "Billed", format: (_, r) => formatPKR(r.total_amount) },
    { key: "total_received", label: "Received", format: (_, r) => formatPKR(r.total_received) },
    { key: "amount_due", label: "Due", format: (_, r) => formatPKR(r.amount_due) },
    { key: "bank", label: "Bank", format: (_, r) => formatPKR(r.bank) },
    { key: "cash", label: "Cash", format: (_, r) => formatPKR(r.cash) },
    { key: "received_at", label: "Received At", format: formatDateTime },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Transaction"
        description="Track tenant payments, outstanding dues, and billing activity."
      />
      <div className="wh-stat-grid wh-stat-grid--3">
        <StatCard
          label="Outstanding Dues"
          value={loading ? "—" : formatPKR(summary?.outstanding_dues)}
          tone="warning"
        />
        <StatCard
          label="Received This Month"
          value={loading ? "—" : formatPKR(summary?.received_this_month)}
          tone="success"
        />
        <StatCard
          label="Underpaid / Discount Gap"
          value={loading ? "—" : formatPKR(summary?.discounts_applied)}
        />
      </div>
      <Card>
        <h3 className="wh-card__title">Payment History</h3>
        {loading ? (
          <p className="wh-muted">Loading transactions…</p>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              filterRows={rows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              emptyMessage="No payment records yet."
            />
          </>
        )}
      </Card>
    </div>
  );
}
