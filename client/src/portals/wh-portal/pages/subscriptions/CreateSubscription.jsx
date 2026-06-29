import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { LoginPortalSelect } from "../../../../components/LoginPortalSelect";
import { FormBlock } from "../../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../components/FormPageLayout";
import { UnsavedChangesDialog } from "../../../../components/UnsavedChangesDialog";
import { useAuth } from "../../../../context/AuthContext";
import { useUnsavedChangesGuard } from "../../../../hooks/useUnsavedChangesGuard";
import { apiFetch } from "../../../../api/client";

function moduleCreateUrl(resume, returnTo) {
  const params = new URLSearchParams({ resume });
  if (returnTo) params.set("returnTo", returnTo);
  return `/webhouse-portal/modules/create?${params.toString()}`;
}

function serializeForm(form) {
  return JSON.stringify(form);
}

const EMPTY_FORM = { plan_name: "", plan_price: "", login_portal: "", module_ids: [] };

export default function CreateSubscription() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const { planId } = useParams();
  const isEdit = Boolean(planId);
  const [searchParams, setSearchParams] = useSearchParams();
  const resume = searchParams.get("resume");
  const returnTo = searchParams.get("returnTo");
  const returnPath =
    returnTo ||
    (resume === "create-tenant"
      ? "/webhouse-portal/subscriptions/create?resume=create-tenant"
      : null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(null);
  const [modules, setModules] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);

  const isDirty = useMemo(
    () => (isEdit ? baseline !== null && serializeForm(form) !== baseline : serializeForm(form) !== serializeForm(EMPTY_FORM)),
    [baseline, form, isEdit]
  );
  const { dialogOpen, stayOnPage, leavePage } = useUnsavedChangesGuard(isDirty, { enabled: isEdit || isDirty });

  const loadModules = useCallback(async () => {
    const res = await apiFetch("/modules/all", {}, authFetch);
    setModules(res.data || []);
  }, [authFetch]);

  useEffect(() => {
    loadModules().catch(() => {});
  }, [loadModules]);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setPageLoading(true);
    apiFetch(`/subscriptions/${planId}`, {}, authFetch)
      .then((detail) => {
        if (!active) return;
        const next = {
          plan_name: detail.plan_name || "",
          plan_price: String(detail.plan_price ?? ""),
          login_portal: detail.login_portal || "",
          module_ids: (detail.modules || []).map((m) => m.id),
        };
        setForm(next);
        setBaseline(serializeForm(next));
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load plan");
      })
      .finally(() => {
        if (active) setPageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isEdit, planId, authFetch]);

  useEffect(() => {
    if (searchParams.get("resumed") !== "1") return;
    const moduleId = Number(searchParams.get("moduleId"));
    loadModules()
      .then(() => {
        if (moduleId) {
          setForm((f) => ({
            ...f,
            module_ids: f.module_ids.includes(moduleId) ? f.module_ids : [...f.module_ids, moduleId],
          }));
        }
      })
      .catch(() => {});
    const next = resume === "create-tenant" ? { resume: "create-tenant" } : {};
    setSearchParams(next, { replace: true });
  }, [searchParams, loadModules, setSearchParams, resume]);

  const toggle = (id) => {
    setForm((f) => ({
      ...f,
      module_ids: f.module_ids.includes(id) ? f.module_ids.filter((x) => x !== id) : [...f.module_ids, id],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.plan_name.trim()) {
      setError("Please enter a plan name.");
      return;
    }
    if (form.plan_price === "" || Number.isNaN(Number(form.plan_price)) || Number(form.plan_price) < 0) {
      setError("Please enter a valid monthly price.");
      return;
    }
    if (!form.login_portal) {
      setError("Please select which ERP login page tenants will use.");
      return;
    }
    if (form.module_ids.length === 0) {
      setError("Please select at least one module for this plan.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        plan_name: form.plan_name.trim(),
        plan_price: Number(form.plan_price),
        login_portal: form.login_portal,
        module_ids: form.module_ids,
      };
      if (isEdit) {
        await apiFetch(`/subscriptions/${planId}`, { method: "PUT", body: JSON.stringify(payload) }, authFetch);
        setBaseline(serializeForm(form));
        navigate("/webhouse-portal/subscriptions/manage");
        return;
      }
      const created = await apiFetch("/subscriptions", { method: "POST", body: JSON.stringify(payload) }, authFetch);
      if (returnTo) {
        const url = new URL(returnTo, window.location.origin);
        url.searchParams.set("resumed", "1");
        url.searchParams.set("planId", String(created.id));
        navigate(`${url.pathname}${url.search}`, { replace: true });
      } else if (resume === "create-tenant") {
        navigate(`/webhouse-portal/tenants/create?resumed=1&planId=${created.id}`, { replace: true });
      } else {
        setForm(EMPTY_FORM);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <p className="wh-muted">Loading plan…</p>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={isEdit ? "Edit Subscription" : "Create Subscription"}
          description="Monthly price, ERP portal, and included modules."
          actions={
            isEdit ? (
              <Button type="button" variant="secondary" onClick={() => navigate("/webhouse-portal/subscriptions/manage")}>
                Back to plans
              </Button>
            ) : null
          }
        />
        <form onSubmit={handleSubmit} className="wh-form-stack">
          <FormPageAlerts error={error} />
          <FormBlock title="Plan details" description="Name, price, and which ERP login page tenants use.">
            <div className="wh-form-grid">
              <FormField
                id="plan_name"
                label="Plan name"
                value={form.plan_name}
                onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value }))}
                required
              />
              <FormField
                id="plan_price"
                label="Monthly price (Rs.)"
                type="number"
                step="0.01"
                min="0"
                value={form.plan_price}
                onChange={(e) => setForm((f) => ({ ...f, plan_price: e.target.value }))}
                required
              />
            </div>
            <div className="wh-field">
              <span className="wh-field__label">ERP login portal</span>
              <LoginPortalSelect value={form.login_portal} onChange={(v) => setForm((f) => ({ ...f, login_portal: v }))} />
            </div>
          </FormBlock>
          <FormBlock title="Included modules" description="Choose which modules are part of this subscription plan.">
            {modules.length === 0 ? (
              <p className="wh-muted">No modules available yet. Create a module first.</p>
            ) : (
              <div className="wh-checkbox-grid">
                {modules.map((m) => (
                  <label key={m.id} className="wh-checkbox-item">
                    <input type="checkbox" checked={form.module_ids.includes(m.id)} onChange={() => toggle(m.id)} />
                    {m.module_name}
                  </label>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(moduleCreateUrl(resume || "create-subscription", returnPath))}
              >
                Create new module
              </Button>
            </div>
          </FormBlock>
          <FormActions>
            {resume === "create-tenant" && !isEdit && (
              <Button type="button" variant="secondary" onClick={() => navigate("/webhouse-portal/tenants/create")}>
                Back to walkthrough
              </Button>
            )}
            {isEdit && (
              <Button type="button" variant="secondary" onClick={() => navigate("/webhouse-portal/subscriptions/manage")}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : isEdit ? "Save plan" : "Create plan"}
            </Button>
          </FormActions>
        </form>
      </FormPageLayout>
      <UnsavedChangesDialog open={dialogOpen} onStay={stayOnPage} onDiscard={leavePage} />
    </div>
  );
}
