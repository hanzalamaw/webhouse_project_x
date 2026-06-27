import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { TableToolbar } from "../../../../../../components/TableToolbar";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { formatPKR } from "../../../../../../utils/currency";
import { formatTotalPrice } from "../../utils/pricing";
import { MODULE_BASE } from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "status", label: "Status" },
  { key: "category_name", label: "Category" },
  { key: "unit", label: "Unit" },
];

export default function ManageProducts() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, status: "", category_name: "", unit: "" });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "created_at", filters: TOOLBAR_FILTERS });

  useEffect(() => setPage(1), [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllTableRows("/inventory/products", authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await apiFetch(`/inventory/products/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "product_name", label: "Product" },
    { key: "sku", label: "SKU" },
    { key: "category_name", label: "Category", format: (v) => v || "—" },
    { key: "unit", label: "Unit" },
    { key: "cost_price", label: "Cost", format: (v) => formatPKR(v) },
    { key: "selling_price", label: "Selling", format: (v) => formatPKR(v) },
    { key: "delivery_charges", label: "Delivery", format: (v) => formatPKR(v) },
    { key: "discount", label: "Discount", format: (v) => formatPKR(v) },
    { key: "tax", label: "Tax", format: (v) => formatPKR(v) },
    {
      key: "total_price",
      label: "Total",
      filter: false,
      format: (_, r) => formatTotalPrice(r.selling_price, r.discount, r.tax),
    },
    { key: "total_available", label: "Available", filter: false },
    { key: "total_reserved", label: "Reserved", filter: false },
    { key: "total_damaged", label: "Damaged", filter: false },
    { key: "total_qty", label: "Total Qty", filter: false },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/products/edit/${row.id}`)}>Edit</Button>
          <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Manage Products"
        description="View and filter all products with stock totals, pricing, and category details."
        actions={<Button onClick={() => navigate(`${MODULE_BASE}/products/create`)}>Create Product</Button>}
      />
      {error && <p className="wh-field__error">{error}</p>}
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="created_at" filters={TOOLBAR_FILTERS} searchPlaceholder="Search products…" />
            <DataTable columns={columns} rows={filteredRows} page={page} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ConfirmDeleteModal
        open={!!deleteRow}
        title="Delete product"
        recordName={deleteRow?.product_name || "this product"}
        onConfirm={confirmDelete}
        onClose={() => setDeleteRow(null)}
        loading={deleting}
      />
    </div>
  );
}
