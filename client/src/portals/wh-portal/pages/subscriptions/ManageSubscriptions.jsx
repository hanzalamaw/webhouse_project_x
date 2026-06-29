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
import { formatPKR } from "../../../../utils/currency";

const PLAN_TOOLBAR_FILTERS = [{ key: "login_portal", label: "Portal" }];

export default function ManageSubscriptions() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, login_portal: "" });

  const filteredRows = useMemo(
    () =>
      applyToolbarFilters(rows, toolbar, {
        dateField: "created_at",
        filters: PLAN_TOOLBAR_FILTERS,
      }),
    [rows, toolbar]
  );

  useEffect(() => {
    setPage(1);
  }, [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllTableRows("/subscriptions", authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const columns = [
    { key: "plan_name", label: "Plan" },
    { key: "plan_price", label: "Monthly Price", format: (_, r) => formatPKR(r.plan_price) },
    {
      key: "login_portal",
      label: "ERP Portal",
      format: (v) => (v ? String(v).toUpperCase() : "—"),
    },
    { key: "module_count", label: "Modules" },
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`/webhouse-portal/subscriptions/edit/${row.id}`)}>
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
      <PageHeader title="Manage Subscriptions" description="Edit plans, ERP portal, pricing, and modules." />
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
              filters={PLAN_TOOLBAR_FILTERS}
              searchPlaceholder="Search plans…"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              filterRows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={(row) => navigate(`/webhouse-portal/subscriptions/edit/${row.id}`)}
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
        error={deleteError}
        onConfirm={async () => {
          setDeleting(true);
          setDeleteError("");
          try {
            await apiFetch(`/subscriptions/${deleteRow.id}`, { method: "DELETE" }, authFetch);
            setDeleteRow(null);
            await load();
          } catch (err) {
            setDeleteError(err.message || "Delete failed.");
          } finally {
            setDeleting(false);
          }
        }}
        recordName={deleteRow?.plan_name}
        categoryLabel="subscription plan"
        cascadeItems={[
          "All modules assigned to this subscription plan",
          "Tenants on this plan may lose access to those modules",
        ]}
        loading={deleting}
      />
    </div>
  );
}
