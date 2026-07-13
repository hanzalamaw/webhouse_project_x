import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { UnsavedChangesDialog } from "../../../../../../components/UnsavedChangesDialog";
import { useUnsavedChangesGuard } from "../../../../../../hooks/useUnsavedChangesGuard";
import { PRODUCT_STATUS } from "../../constants";
import { useEcomSyncLink } from "../../../ecommerce/hooks/useShopifySyncLink";
import { useConnectedEcomStores } from "../../../ecommerce/hooks/useConnectedEcomStores";
import { IntegrationDestinationField } from "../../../ecommerce/components/IntegrationDestinationField";
import { INTEGRATION_DESTINATIONS } from "../../../ecommerce/constants";
import { resolveIntegrationSave, resolveLinkedEditSave } from "../../../ecommerce/utils/integrationDestination";
import {
  validateWarehouseForErp,
  validateWarehouseForShopify,
  syncValidationSummary,
  scrollToFirstFieldError,
} from "../../../ecommerce/utils/syncFieldValidation";

const EMPTY = { warehouse_name: "", location: "", city: "", status: "active" };

function serializeForm(form) {
  return JSON.stringify(form);
}

export default function CreateWarehouse() {
  const { warehouseId } = useParams();
  const isEdit = Boolean(warehouseId);
  const { authFetch } = useAuth();
  const { canDelete } = useModulePermission("inventory-procurement");
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState("");
  const [baseline, setBaseline] = useState(null);
  const [createBaseline, setCreateBaseline] = useState(null);
  const [saveDestination, setSaveDestination] = useState(INTEGRATION_DESTINATIONS.ERP);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const createBaselineSerialized = useMemo(() => serializeForm(EMPTY), []);

  const { link: ecomLink, loading: linkLoading, isLinked: isStoreLinked } = useEcomSyncLink(
    "warehouse",
    warehouseId,
    { enabled: isEdit },
  );
  const {
    shopifyConnected,
    shopifyStoreName,
    loading: storesLoading,
  } = useConnectedEcomStores();
  const formBusy = loading || linkLoading || saving || storesLoading || deleting;

  const backPath = "/app/m/inventory-procurement/warehouses";

  const isDirty = useMemo(() => {
    if (isEdit) return baseline !== null && serializeForm(form) !== baseline;
    return serializeForm(form) !== createBaselineSerialized;
  }, [baseline, createBaselineSerialized, form, isEdit]);

  const { dialogOpen, stayOnPage, leavePage, reloadPending, navigateSafely } = useUnsavedChangesGuard(isDirty, {
    enabled: isEdit ? baseline !== null && !loading : true,
    mode: isEdit ? "edit" : "create",
  });

  const confirmDelete = async () => {
    if (!isEdit || !warehouseId) return;
    setDeleting(true);
    setError("");
    try {
      await apiFetch(`/inventory/warehouses/${warehouseId}`, { method: "DELETE" }, authFetch);
      setDeleteOpen(false);
      navigateSafely(backPath);
    } catch (e) {
      setError(e.message);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    setLoading(true);
    setBaseline(null);
    apiFetch(`/inventory/warehouses/${warehouseId}`, {}, authFetch)
      .then((row) => {
        if (!active) return;
        const next = {
          warehouse_name: row.warehouse_name || "",
          location: row.location || "",
          city: row.city || "",
          status: row.status || "active",
        };
        setForm(next);
        setBaseline(serializeForm(next));
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isEdit, warehouseId, authFetch]);

  const saveWarehouse = async (payload, { syncToShopify = false, info = "" } = {}) => {
    const body = { ...payload, syncToShopify };
    if (isEdit) {
      await apiFetch(`/inventory/warehouses/${warehouseId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
      setBaseline(serializeForm(payload));
      setMessage(syncToShopify ? "Warehouse updated and synced to Shopify." : (info || "Warehouse updated successfully."));
    } else {
      await apiFetch("/inventory/warehouses", { method: "POST", body: JSON.stringify(body) }, authFetch);
      navigateSafely(backPath);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = { ...form };

    const resolved = isEdit && isStoreLinked
      ? resolveLinkedEditSave(ecomLink)
      : resolveIntegrationSave(saveDestination, { shopifyConnected, darazConnected: false });
    if (!resolved || resolved.error) {
      setFieldErrors({ saveDestination: resolved?.error || "Could not resolve save destination." });
      setError(resolved?.error || "Could not resolve save destination.");
      scrollToFirstFieldError();
      return;
    }

    const syncErrors = resolved.syncToShopify
      ? validateWarehouseForShopify({ form })
      : validateWarehouseForErp({ form });
    if (Object.keys(syncErrors).length) {
      setFieldErrors(syncErrors);
      setError(syncValidationSummary(syncErrors));
      scrollToFirstFieldError();
      return;
    }
    setFieldErrors({});

    setSaving(true);
    setError("");
    try {
      await saveWarehouse(payload, {
        syncToShopify: resolved.syncToShopify,
        info: resolved.info,
      });
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
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(backPath)}>Back to warehouses</Button>
              {isEdit && canDelete && (
                <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)} disabled={deleting}>
                  Delete
                </Button>
              )}
            </div>
          }
        />
        <form onSubmit={submit} className="wh-form-stack">
          <IntegrationDestinationField
            value={saveDestination}
            onChange={(v) => {
              setFieldErrors((prev) => {
                if (!prev.saveDestination) return prev;
                const next = { ...prev };
                delete next.saveDestination;
                return next;
              });
              setSaveDestination(v);
            }}
            disabled={formBusy}
            shopifyConnected={shopifyConnected}
            darazConnected={false}
            shopifyStoreName={shopifyStoreName}
            showDaraz={false}
            lockedPlatform={isEdit && isStoreLinked ? ecomLink.platform : null}
            lockedStoreName={ecomLink?.storeName || shopifyStoreName}
            error={fieldErrors.saveDestination}
          />

          <FormBlock title="Warehouse details" description="Name, location, city, and status.">
            <div className="wh-form-grid">
              <FormField
                id="warehouse_name"
                label="Warehouse name"
                value={form.warehouse_name}
                onChange={(e) => {
                  setFieldErrors((prev) => {
                    if (!prev.warehouse_name) return prev;
                    const next = { ...prev };
                    delete next.warehouse_name;
                    return next;
                  });
                  setForm((f) => ({ ...f, warehouse_name: e.target.value }));
                }}
                required
                error={fieldErrors.warehouse_name}
              />
              <FormField
                id="city"
                label="City"
                value={form.city}
                onChange={(e) => {
                  setFieldErrors((prev) => {
                    if (!prev.city) return prev;
                    const next = { ...prev };
                    delete next.city;
                    return next;
                  });
                  setForm((f) => ({ ...f, city: e.target.value }));
                }}
                error={fieldErrors.city}
              />
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {PRODUCT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
              <div className="wh-form-grid__full">
                <FormField
                  id="location"
                  label="Location"
                  as="textarea"
                  rows={3}
                  value={form.location}
                  onChange={(e) => {
                    setFieldErrors((prev) => {
                      if (!prev.location) return prev;
                      const next = { ...prev };
                      delete next.location;
                      return next;
                    });
                    setForm((f) => ({ ...f, location: e.target.value }));
                  }}
                  error={fieldErrors.location}
                />
              </div>
            </div>
          </FormBlock>

          {error && <p className="wh-field__error">{error}</p>}
          {message && <p className="wh-form-message">{message}</p>}
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(backPath)}>Cancel</Button>
            <Button type="submit" disabled={formBusy}>{saving ? "Saving…" : isEdit ? "Save Warehouse" : "Create Warehouse"}</Button>
          </FormActions>
        </form>
      </FormPageLayout>

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Delete warehouse"
        recordName={form.warehouse_name || "this warehouse"}
        onConfirm={confirmDelete}
        onClose={() => setDeleteOpen(false)}
        loading={deleting}
      />

      <UnsavedChangesDialog
        open={dialogOpen}
        onStay={stayOnPage}
        onDiscard={leavePage}
        reloadPending={reloadPending}
      />
    </div>
  );
}
