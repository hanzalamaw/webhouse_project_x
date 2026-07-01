import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { DataTable } from "../../../../../../components/DataTable";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { Modal } from "../../../../../../components/Modal";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { StatusBadge } from "../../../../../../components/Badge";
import { PRODUCT_STATUS, MODULE_BASE } from "../../constants";
import { useInventoryReference } from "../../hooks/useInventoryReference";
import CreateCategoryModal from "../../components/CreateCategoryModal";
import ProductPicker from "../../components/ProductPicker";

export default function Categories() {
  const { authFetch } = useAuth();
  const { products, reload: reloadRef } = useInventoryReference();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [editSearch, setEditSearch] = useState("");
  const [editCategoryFilter, setEditCategoryFilter] = useState("");
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllTableRows("/inventory/categories", authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const closeCreate = () => {
    setCreateOpen(false);
    setError("");
  };

  const openDetail = async (row) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    try {
      const data = await apiFetch(`/inventory/categories/${row.id}`, {}, authFetch);
      setExpandedId(row.id);
      setDetail(data);
    } catch {
      setDetail(null);
    }
  };

  const toggleProduct = (id) => {
    const sid = String(id);
    setEditRow((r) => ({
      ...r,
      product_ids: r.product_ids.includes(sid)
        ? r.product_ids.filter((x) => x !== sid)
        : [...r.product_ids, sid],
    }));
  };

  const openEdit = async (row) => {
    try {
      const data = await apiFetch(`/inventory/categories/${row.id}`, {}, authFetch);
      setEditRow({
        id: row.id,
        category_name: data.category_name,
        status: data.status,
        product_ids: (data.products || []).map((p) => String(p.id)),
      });
      setEditSearch("");
      setEditCategoryFilter("");
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      await apiFetch(
        `/inventory/categories/${editRow.id}`,
        { method: "PUT", body: JSON.stringify({ category_name: editRow.category_name, status: editRow.status, product_ids: editRow.product_ids.map(Number) }) },
        authFetch
      );
      const editedId = editRow.id;
      setEditRow(null);
      await load();
      await reloadRef();
      if (expandedId === editedId) {
        const data = await apiFetch(`/inventory/categories/${editedId}`, {}, authFetch);
        setDetail(data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await apiFetch(`/inventory/categories/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      if (expandedId === deleteRow.id) {
        setExpandedId(null);
        setDetail(null);
      }
      await load();
      await reloadRef();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const openViewTab = (row) => {
    window.open(`${MODULE_BASE}/products/categories/view/${row.id}`, "_blank", "noopener,noreferrer");
  };

  const columns = [
    { key: "category_name", label: "Category" },
    { key: "product_count", label: "Products", filter: false },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" onClick={() => openViewTab(row)}>View</Button>
          <Button variant="secondary" className="wh-btn--sm" onClick={() => openEdit(row)}>Edit</Button>
          <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Categories"
        description="Manage product categories and assign products."
        actions={<Button onClick={() => setCreateOpen(true)}>Create Category</Button>}
      />

      <Card className="wh-card--table">
        <div className="wh-card-table__head"><h3 className="wh-card__title">All categories</h3></div>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            page={page}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setPage}
            onRowClick={openViewTab}
          />
        )}
        {expandedId && detail && (
          <div className="wh-inv-expand-panel">
            <h4 className="wh-inv-expand-panel__title">Products in {detail.category_name}</h4>
            <div className="wh-inv-expand-grid">
              <div>
                <p className="wh-inv-expand-panel__subtitle">Assigned ({detail.products?.length || 0})</p>
                <ul className="wh-list">
                  {(detail.products || []).map((p) => (
                    <li key={p.id}>{p.product_name} — {p.sku}</li>
                  ))}
                  {!detail.products?.length && <li className="wh-muted">No products assigned</li>}
                </ul>
              </div>
              <div>
                <p className="wh-inv-expand-panel__subtitle">Other products</p>
                <ul className="wh-list">
                  {(detail.all_products || []).filter((p) => p.category_id !== detail.id).map((p) => (
                    <li key={p.id}>{p.product_name} — {p.sku} {p.category_name ? `(${p.category_name})` : ""}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Card>

      <CreateCategoryModal
        open={createOpen}
        onClose={closeCreate}
        authFetch={authFetch}
        products={products}
        showProductPicker
        onCreated={async () => {
          await load();
          await reloadRef();
        }}
      />

      {editRow && (
        <Modal open title="Edit category" onClose={() => setEditRow(null)} wide className="wh-modal--category">
          <FormField id="edit_cat_name" label="Category name" value={editRow.category_name} onChange={(e) => setEditRow((r) => ({ ...r, category_name: e.target.value }))} />
          <FormField id="edit_cat_status" label="Status" as="select" value={editRow.status} onChange={(e) => setEditRow((r) => ({ ...r, status: e.target.value }))}>
            {PRODUCT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </FormField>
          <ProductPicker
            products={products}
            selectedIds={editRow.product_ids}
            onToggle={toggleProduct}
            search={editSearch}
            onSearchChange={setEditSearch}
            categoryFilter={editCategoryFilter}
            onCategoryFilterChange={setEditCategoryFilter}
            showCategoryFilter
            showWarning
            showCategoryTag
            description="Assign products (optional). Products already in another category will be moved."
          />
          {error && <p className="wh-field__error">{error}</p>}
          <div className="wh-modal__actions">
            <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>Save</Button>
          </div>
        </Modal>
      )}

      <ConfirmDeleteModal open={!!deleteRow} title="Delete category" recordName={deleteRow?.category_name || "this category"} onConfirm={confirmDelete} onClose={() => setDeleteRow(null)} loading={deleting} />
    </div>
  );
}
