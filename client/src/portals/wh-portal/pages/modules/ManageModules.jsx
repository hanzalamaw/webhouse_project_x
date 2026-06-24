import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { TableToolbar } from "../../../../components/TableToolbar";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { Modal } from "../../../../components/Modal";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../utils/tableFilters";
import { formatDateTime } from "../../../../utils/dateTime";

export default function ManageModules() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editName, setEditName] = useState("");
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });

  const filteredRows = useMemo(
    () => applyToolbarFilters(rows, toolbar, { dateField: "created_at" }),
    [rows, toolbar]
  );

  useEffect(() => {
    setPage(1);
  }, [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllTableRows("/modules", authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

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

  const createModule = async (e) => {
    e.preventDefault();
    setCreateError("");
    if (!createName.trim()) {
      setCreateError("Module name is required.");
      return;
    }
    setCreating(true);
    try {
      await apiFetch(
        "/modules",
        { method: "POST", body: JSON.stringify({ module_name: createName.trim() }) },
        authFetch
      );
      setShowCreate(false);
      setCreateName("");
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
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
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
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
      <PageHeader
        title="Modules"
        description="View, create, edit, and remove platform modules."
        actions={
          <Button onClick={() => { setShowCreate(true); setCreateError(""); setCreateName(""); }}>
            Add Module
          </Button>
        }
      />
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="created_at"
              searchPlaceholder="Search modules…"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              filterRows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Module"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" form="create-module-form" disabled={creating}>
              {creating ? "Saving…" : "Create Module"}
            </Button>
          </>
        }
      >
        <form id="create-module-form" className="wh-form" onSubmit={createModule}>
          <FormField
            id="new_module_name"
            label="Module Name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            error={createError}
            required
          />
        </form>
      </Modal>

      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title="Edit Module"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </>
        }
      >
        <FormField id="edit_name" label="Module Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
      </Modal>

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
