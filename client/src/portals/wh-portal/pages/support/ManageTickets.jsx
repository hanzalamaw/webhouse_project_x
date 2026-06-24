import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { formatDateTime } from "../../../../utils/dateTime";

const TICKET_STATUS = ["open", "pending", "resolved"];

export default function ManageTickets() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [form, setForm] = useState({ subject: "", description: "", status: "open" });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllTableRows("/support-tickets", authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  const openEdit = (row) => {
    setEditRow(row);
    setForm({ subject: row.subject, description: row.description, status: row.status });
  };

  const saveEdit = async () => {
    await apiFetch(
      `/support-tickets/${editRow.id}`,
      { method: "PUT", body: JSON.stringify(form) },
      authFetch
    );
    setEditRow(null);
    load();
  };

  const columns = [
    { key: "subject", label: "Subject" },
    { key: "company_name", label: "Tenant" },
    { key: "status", label: "Status" },
    { key: "created_at", label: "Created", format: formatDateTime },
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
      <PageHeader
        title="Manage Support Tickets"
        description="Handle and resolve client issues, requests, complaints, and technical problems."
      />
      <Card>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            filterRows={rows}
            page={page}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setPage}
            emptyMessage="No support tickets yet."
          />
        )}
      </Card>

      {editRow && (
        <div className="wh-modal-overlay" onClick={() => setEditRow(null)}>
          <div className="wh-modal wh-modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="wh-modal__title">Edit Ticket — {editRow.company_name}</h3>
            <FormField id="sub" label="Subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            <FormField id="desc" label="Description" as="textarea" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <FormField id="st" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {TICKET_STATUS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FormField>
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
        error={deleteError}
        onConfirm={async () => {
          setDeleting(true);
          setDeleteError("");
          try {
            await apiFetch(`/support-tickets/${deleteRow.id}`, { method: "DELETE" }, authFetch);
            setDeleteRow(null);
            await load();
          } catch (err) {
            setDeleteError(err.message || "Delete failed.");
          } finally {
            setDeleting(false);
          }
        }}
        recordName={deleteRow?.subject}
        loading={deleting}
      />
    </div>
  );
}
