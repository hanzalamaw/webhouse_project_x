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
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatPKR } from "../../../../../utils/currency";
import { formatDate } from "../../../../../utils/dateTime";
import { MODULE_BASE, PAYMENT_METHOD_LABELS, labelFor } from "../constants";

const TOOLBAR_FILTERS = [
  { key: "expense_title", label: "Title" },
  { key: "category_name", label: "Category" },
  { key: "payment_method", label: "Method" },
];

export default function Expenses() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("finance");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "expense_date", filters: TOOLBAR_FILTERS });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/finance/expenses", authFetch));
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
      await apiFetch(`/finance/expenses/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "expense_date", label: "Date", format: formatDate },
    { key: "expense_title", label: "Title" },
    { key: "category_name", label: "Category" },
    { key: "sub_category_name", label: "Sub-category", format: (v) => v || "—" },
    { key: "payment_method", label: "Method", format: (v) => labelFor(PAYMENT_METHOD_LABELS, v) },
    { key: "amount", label: "Amount", format: (v) => formatPKR(v) },
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" disabled={!canEdit} onClick={() => navigate(`${MODULE_BASE}/expenses/edit/${row.id}`)}>Edit</Button>
          <Button variant="secondary" className="wh-btn--sm" disabled={!canDelete} onClick={() => setDeleteRow(row)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Expenses" description="Operational expenses — salaries, rent, utilities, and more." actions={<Button onClick={() => navigate(`${MODULE_BASE}/expenses/create`)} disabled={!canCreate}>Add expense</Button>} />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="expense_date" filters={TOOLBAR_FILTERS} searchPlaceholder="Search expenses…" layout="stacked" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} onRowClick={(row) => navigate(`${MODULE_BASE}/expenses/view/${row.id}`)} />
          </>
        )}
      </Card>
      <ConfirmDeleteModal open={Boolean(deleteRow)} onClose={() => setDeleteRow(null)} onConfirm={confirmDelete} loading={deleting} entityLabel="expense" />
    </div>
  );
}
