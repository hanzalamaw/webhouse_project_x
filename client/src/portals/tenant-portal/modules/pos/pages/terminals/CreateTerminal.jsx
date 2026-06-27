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
import { MODULE_BASE, TERMINAL_STATUSES } from "../../constants";

const EMPTY = { terminal_name: "", device_code: "", outlet_id: "", status: "active" };

export default function CreateTerminal() {
  const { terminalId } = useParams();
  const isEdit = Boolean(terminalId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit, readOnly } = useModulePermission("pos");
  const navigate = useNavigate();
  const [outlets, setOutlets] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disabled = readOnly || (isEdit ? !canEdit : !canCreate);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const outletRes = await apiFetch("/pos/outlets", {}, authFetch);
        const outletRows = outletRes.data || outletRes || [];
        setOutlets(outletRows);
        if (isEdit) {
          const all = await fetchAllTableRows("/pos/terminals", authFetch);
          const row = all.find((t) => String(t.id) === String(terminalId));
          if (!row) throw new Error("Terminal not found");
          setForm({
            terminal_name: row.terminal_name || "",
            device_code: row.device_code || "",
            outlet_id: String(row.outlet_id),
            status: row.status || "active",
          });
        } else if (outletRows.length === 1) {
          setForm((f) => ({ ...f, outlet_id: String(outletRows[0].id) }));
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })().catch(() => {});
  }, [isEdit, terminalId, authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const body = { ...form, outlet_id: Number(form.outlet_id) };
      if (isEdit) {
        await apiFetch(`/pos/terminals/${terminalId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
      } else {
        await apiFetch("/pos/terminals", { method: "POST", body: JSON.stringify(body) }, authFetch);
      }
      navigate(`${MODULE_BASE}/terminals`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={isEdit ? "Edit Terminal" : "Create Terminal"}
          description={isEdit ? "Update device name, machine code, and outlet." : "Register a checkout device. Cashiers pair using the machine code in POS Terminal."}
          actions={<Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/terminals`)}>Back to terminals</Button>}
        />

        {!outlets.length && (
          <p className="wh-field__error">Create an outlet first before adding terminals.</p>
        )}

        <form onSubmit={submit} className="wh-form-stack">
          <FormBlock title="Terminal details" description="Device name, machine code, outlet, and status.">
            <div className="wh-form-grid wh-form-grid--3">
              <FormField id="terminal_name" label="Terminal name" value={form.terminal_name} onChange={(e) => setForm((f) => ({ ...f, terminal_name: e.target.value }))} disabled={disabled} required />
              <FormField id="device_code" label="Machine code" value={form.device_code} onChange={(e) => setForm((f) => ({ ...f, device_code: e.target.value }))} disabled={disabled} required />
              <FormField id="outlet_id" label="Outlet" as="select" value={form.outlet_id} onChange={(e) => setForm((f) => ({ ...f, outlet_id: e.target.value }))} disabled={disabled || !outlets.length} required>
                <option value="">Select outlet</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </FormField>
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={disabled}>
                {TERMINAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
            </div>
          </FormBlock>

          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/terminals`)}>Cancel</Button>
            {!disabled && (
              <Button type="submit" disabled={saving || !outlets.length}>
                {saving ? "Saving…" : isEdit ? "Save Terminal" : "Create Terminal"}
              </Button>
            )}
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
