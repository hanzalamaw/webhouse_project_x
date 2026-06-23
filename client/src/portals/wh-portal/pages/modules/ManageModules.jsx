import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { Pagination } from "../../../../components/Pagination";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch } from "../../../../api/client";

export default function ManageModules() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/modules?page=${page}&limit=10`, {}, authFetch);
      setRows(res.data);
      setPagination(res.pagination);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch, page]);

  useEffect(() => {
    load();
  }, [load]);

  const saveEdit = async () => {
    await apiFetch(`/modules/${editRow.id}`, {
      method: "PUT",
      body: JSON.stringify({ module_name: editName }),
    }, authFetch);
    setEditRow(null);
    load();
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/modules/${deleteRow.id}`, { method: "DELETE" }, authFetch);
      setDeleteRow(null);
      await load();
    } catch (err) {
      setDeleteError(err.message || "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "module_name", label: "Module" },
    { key: "created_at", label: "Created" },
    {
      label: "Actions",
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" onClick={() => { setEditRow(row); setEditName(row.module_name); }}>
            Edit
          </Button>
          <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Manage Modules" description="View, edit, and remove platform modules." />
      <Card>
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <DataTable columns={columns} rows={rows} />
            <Pagination pagination={pagination} onPageChange={setPage} />
          </>
        )}
      </Card>

      {editRow && (
        <div className="wh-modal-overlay" onClick={() => setEditRow(null)}>
          <div className="wh-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="wh-modal__title">Edit Module</h3>
            <FormField id="edit_name" label="Module Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <div className="wh-modal__actions">
              <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button onClick={saveEdit}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={!!deleteRow}
        onClose={() => {
          setDeleteRow(null);
          setDeleteError("");
        }}
        onConfirm={confirmDelete}
        error={deleteError}
        recordName={deleteRow?.module_name}
        loading={deleting}
      />
    </div>
  );
}
