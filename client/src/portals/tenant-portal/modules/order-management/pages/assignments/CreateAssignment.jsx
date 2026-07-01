import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { useOrderReference } from "../../hooks/useOrderReference";
import { MODULE_BASE, ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES } from "../../constants";

const EMPTY = { order_id: "", assigned_to: "", assignment_type: "staff", status: "pending" };

export default function CreateAssignment() {
  const { assignmentId } = useParams();
  const isEdit = Boolean(assignmentId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit, readOnly } = useModulePermission("order-management");
  const { order_users, loading: refLoading } = useOrderReference();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || (isEdit ? !canEdit : !canCreate);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const orderRows = await fetchAllTableRows("/orders", authFetch);
        setOrders(orderRows);
        if (isEdit) {
          const rows = await fetchAllTableRows("/orders/assignments/list", authFetch);
          const row = rows.find((r) => String(r.id) === String(assignmentId));
          if (row) {
            setForm({
              order_id: String(row.order_id),
              assigned_to: String(row.assigned_to),
              assignment_type: row.assignment_type,
              status: row.status,
            });
          }
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })().catch(() => {});
  }, [isEdit, assignmentId, authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        order_id: Number(form.order_id),
        assigned_to: Number(form.assigned_to),
      };
      if (isEdit) {
        await apiFetch(`/orders/assignments/${assignmentId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
      } else {
        await apiFetch("/orders/assignments", { method: "POST", body: JSON.stringify(body) }, authFetch);
      }
      navigate(`${MODULE_BASE}/assignments/manage`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || refLoading) {
    return <div className="wh-page"><p className="wh-muted">Loading…</p></div>;
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader title={isEdit ? "Edit Assignment" : "New Assignment"} description="Assign an order to a team member." />
        <form className="wh-form-stack" onSubmit={submit}>
          <FormBlock title="Assignment">
            <div className="wh-form-grid wh-form-grid--2">
              <FormField
                id="assignment-order"
                label="Order"
                as="select"
                value={form.order_id}
                onChange={(e) => set("order_id", e.target.value)}
                disabled={disabled || isEdit}
              >
                <option value="">Select order…</option>
                {orders.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.order_no} — {o.customer_name || "No customer"}
                  </option>
                ))}
              </FormField>
              <FormField
                id="assignment-user"
                label="Assign to"
                as="select"
                value={form.assigned_to}
                onChange={(e) => set("assigned_to", e.target.value)}
                disabled={disabled}
              >
                <option value="">Select user…</option>
                {order_users.map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
              </FormField>
              <FormField
                id="assignment-type"
                label="Assignment type"
                as="select"
                value={form.assignment_type}
                onChange={(e) => set("assignment_type", e.target.value)}
                disabled={disabled}
              >
                {ASSIGNMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </FormField>
              <FormField
                id="assignment-status"
                label="Status"
                as="select"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                disabled={disabled}
              >
                {ASSIGNMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
            </div>
          </FormBlock>
          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/assignments/manage`)}>Cancel</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
