import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { TableToolbar } from "../../../../components/TableToolbar";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { Button } from "../../../../components/Button";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../utils/tableFilters";
import { formatDateTime } from "../../../../utils/dateTime";

export default function ManageModules() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteRow, setDeleteRow] = useState(null);
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
      stopRowClick: true,
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`/webhouse-portal/modules/edit/${row.id}`)}>
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
        actions={<Button onClick={() => navigate("/webhouse-portal/modules/create")}>Add Module</Button>}
      />
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
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
              onRowClick={(row) => navigate(`/webhouse-portal/modules/edit/${row.id}`)}
            />
          </>
        )}
      </Card>

      <ConfirmDeleteModal
        open={!!deleteRow}
        onClose={() => {
          setDeleteRow(null);
          setDeleteError("");
        }}
        onConfirm={confirmDelete}
        error={deleteError}
        recordName={deleteRow?.module_name}
        categoryLabel="module"
        cascadeItems={[
          "This module will be removed from all subscription plans",
          "Tenant module assignments that include this module",
        ]}
        loading={deleting}
      />
    </div>
  );
}
