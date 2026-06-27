import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { PRODUCT_STATUS } from "../../constants";

const EMPTY = { warehouse_name: "", location: "", city: "", status: "active" };

export default function CreateWarehouse() {
  const { warehouseId } = useParams();
  const isEdit = Boolean(warehouseId);
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const backPath = "/app/m/inventory-procurement/warehouses";

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    apiFetch(`/inventory/warehouses/${warehouseId}`, {}, authFetch)
      .then((row) => {
        setForm({
          warehouse_name: row.warehouse_name || "",
          location: row.location || "",
          city: row.city || "",
          status: row.status || "active",
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isEdit, warehouseId, authFetch]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.warehouse_name.trim()) {
      setError("Warehouse name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await apiFetch(`/inventory/warehouses/${warehouseId}`, { method: "PUT", body: JSON.stringify(form) }, authFetch);
      } else {
        await apiFetch("/inventory/warehouses", { method: "POST", body: JSON.stringify(form) }, authFetch);
      }
      navigate(backPath);
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
          title={isEdit ? "Edit Warehouse" : "Create Warehouse"}
          description={isEdit ? "Update warehouse location and status." : "Add a warehouse for inventory storage."}
          actions={<Button variant="secondary" onClick={() => navigate(backPath)}>Back to warehouses</Button>}
        />
        <form onSubmit={submit} className="wh-form-stack">
          <FormBlock title="Warehouse details" description="Name, location, city, and status.">
            <div className="wh-form-grid">
              <FormField id="warehouse_name" label="Warehouse name" value={form.warehouse_name} onChange={(e) => setForm((f) => ({ ...f, warehouse_name: e.target.value }))} required />
              <FormField id="city" label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {PRODUCT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
              <div className="wh-form-grid__full">
                <FormField id="location" label="Location" as="textarea" rows={3} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </div>
            </div>
          </FormBlock>
          {error && <p className="wh-field__error">{error}</p>}
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(backPath)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Warehouse" : "Create Warehouse"}</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
