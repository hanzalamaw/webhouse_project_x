import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { TableToolbar } from "../../../../components/TableToolbar";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { Modal } from "../../../../components/Modal";
import { LoginPortalSelect } from "../../../../components/LoginPortalSelect";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../utils/tableFilters";
import { formatPKR } from "../../../../utils/currency";

const PLAN_TOOLBAR_FILTERS = [{ key: "login_portal", label: "Portal" }];

export default function ManageSubscriptions() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [allModules, setAllModules] = useState([]);
  const [form, setForm] = useState({ plan_name: "", plan_price: "", login_portal: "", module_ids: [] });
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
    apiFetch("/modules/all", {}, authFetch).then((r) => setAllModules(r.data || [])).catch(() => {});
  }, [load, authFetch]);

  const openEdit = async (row) => {
    const detail = await apiFetch(`/subscriptions/${row.id}`, {}, authFetch);
    setEditRow(row);
    setForm({
      plan_name: detail.plan_name,
      plan_price: detail.plan_price,
      login_portal: detail.login_portal || "",
      module_ids: (detail.modules || []).map((m) => m.id),
    });
  };

  const saveEdit = async () => {
    if (!form.login_portal) return;
    await apiFetch(`/subscriptions/${editRow.id}`, {
      method: "PUT",
      body: JSON.stringify({
        plan_name: form.plan_name,
        plan_price: Number(form.plan_price),
        login_portal: form.login_portal,
        module_ids: form.module_ids,
      }),
    }, authFetch);
    setEditRow(null);
    load();
  };

  const toggleModule = (id) => {
    setForm((f) => ({
      ...f,
      module_ids: f.module_ids.includes(id) ? f.module_ids.filter((x) => x !== id) : [...f.module_ids, id],
    }));
  };

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
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" onClick={() => openEdit(row)}>Edit</Button>
          <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>
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
            />
          </>
        )}
      </Card>

      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title="Edit Subscription"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={!form.login_portal}>Save</Button>
          </>
        }
      >
        <div className="wh-form-grid">
          <FormField id="pn" label="Plan Name" value={form.plan_name} onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value }))} />
          <FormField
            id="pp"
            label="Monthly Price (Rs.)"
            type="number"
            step="0.01"
            value={form.plan_price}
            onChange={(e) => setForm((f) => ({ ...f, plan_price: e.target.value }))}
          />
        </div>
        <div className="wh-field">
          <span className="wh-field__label">ERP Login Portal</span>
          <LoginPortalSelect value={form.login_portal} onChange={(v) => setForm((f) => ({ ...f, login_portal: v }))} />
        </div>
        <p className="wh-field__label">Modules</p>
        <div className="wh-checkbox-grid">
          {allModules.map((m) => (
            <label key={m.id} className="wh-checkbox-item">
              <input type="checkbox" checked={form.module_ids.includes(m.id)} onChange={() => toggleModule(m.id)} />
              {m.module_name}
            </label>
          ))}
        </div>
      </Modal>

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
