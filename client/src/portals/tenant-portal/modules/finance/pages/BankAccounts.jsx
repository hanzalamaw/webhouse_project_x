import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { ConfirmDeleteModal } from "../../../../../components/ConfirmDeleteModal";
import { Button } from "../../../../../components/Button";
import { StatusBadge } from "../../../../../components/Badge";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatPKR } from "../../../../../utils/currency";
import { MODULE_BASE, BANK_ACCOUNT_STATUSES } from "../constants";

const TOOLBAR_FILTERS = [
  { key: "bank_name", label: "Bank" },
  { key: "account_title", label: "Account title" },
  { key: "status", label: "Status", options: BANK_ACCOUNT_STATUSES },
];

export default function BankAccounts() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("finance");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, status: "" });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { filters: TOOLBAR_FILTERS });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/finance/bank-accounts", authFetch));
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { setPage(1); }, [toolbar]);

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await apiFetch(`/finance/bank-accounts/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "bank_name", label: "Bank" },
    { key: "account_title", label: "Account title" },
    { key: "account_number", label: "Account #" },
    { key: "current_balance", label: "Balance", format: (v) => formatPKR(v) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" disabled={!canEdit} onClick={() => navigate(`${MODULE_BASE}/bank-accounts/edit/${row.id}`)}>Edit</Button>
          <Button variant="secondary" className="wh-btn--sm" disabled={!canDelete} onClick={() => setDeleteRow(row)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Bank Accounts & Cash" description="Company bank accounts and cash balances." actions={<Button onClick={() => navigate(`${MODULE_BASE}/bank-accounts/create`)} disabled={!canCreate}>Add account</Button>} />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} filters={TOOLBAR_FILTERS} searchPlaceholder="Search accounts…" layout="stacked" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} onRowClick={(row) => navigate(`${MODULE_BASE}/bank-accounts/view/${row.id}`)} />
          </>
        )}
      </Card>
      <ConfirmDeleteModal open={Boolean(deleteRow)} onClose={() => setDeleteRow(null)} onConfirm={confirmDelete} loading={deleting} entityLabel="bank account" />
    </div>
  );
}
