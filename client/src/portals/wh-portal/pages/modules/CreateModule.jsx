import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { FormBlock } from "../../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../components/FormPageLayout";
import { UnsavedChangesDialog } from "../../../../components/UnsavedChangesDialog";
import { useAuth } from "../../../../context/AuthContext";
import { useUnsavedChangesGuard } from "../../../../hooks/useUnsavedChangesGuard";
import { apiFetch } from "../../../../api/client";

function appendResumeParams(baseUrl, moduleId) {
  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set("resumed", "1");
  url.searchParams.set("moduleId", String(moduleId));
  return `${url.pathname}${url.search}`;
}

export default function CreateModule() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const { moduleId } = useParams();
  const isEdit = Boolean(moduleId);
  const [searchParams] = useSearchParams();
  const resume = searchParams.get("resume");
  const returnTo = searchParams.get("returnTo");
  const [moduleName, setModuleName] = useState("");
  const [baseline, setBaseline] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);

  const isDirty = useMemo(
    () => (isEdit ? baseline !== null && moduleName !== baseline : moduleName.trim() !== ""),
    [baseline, moduleName, isEdit]
  );
  const { dialogOpen, stayOnPage, leavePage } = useUnsavedChangesGuard(isDirty, { enabled: isEdit || isDirty });

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setPageLoading(true);
    apiFetch(`/modules/${moduleId}`, {}, authFetch)
      .then((row) => {
        if (!active) return;
        const name = row.module_name || "";
        setModuleName(name);
        setBaseline(name);
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load module");
      })
      .finally(() => {
        if (active) setPageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isEdit, moduleId, authFetch]);

  useEffect(() => {
    if (isEdit) return;
    if (returnTo) {
      setMessage("After saving, you will return to your walkthrough with this module selected.");
    } else if (resume === "create-tenant") {
      setMessage("After saving, you will return to Create Tenant with this module selected.");
    } else if (resume === "create-subscription") {
      setMessage("After saving, you will return to Create Subscription with this module selected.");
    }
  }, [resume, returnTo, isEdit]);

  const goBack = () => {
    if (isEdit) {
      navigate("/webhouse-portal/modules");
      return;
    }
    if (returnTo) {
      navigate(returnTo, { replace: true });
      return;
    }
    if (resume === "create-tenant") {
      navigate("/webhouse-portal/tenants/create", { replace: true });
      return;
    }
    if (resume === "create-subscription") {
      navigate("/webhouse-portal/subscriptions/create?resume=create-tenant", { replace: true });
      return;
    }
    navigate(-1);
  };

  const returnAfterSave = (id) => {
    if (returnTo) {
      navigate(appendResumeParams(returnTo, id), { replace: true });
      return;
    }
    if (resume === "create-tenant") {
      navigate(`/webhouse-portal/tenants/create?resumed=1&moduleId=${id}`, { replace: true });
      return;
    }
    if (resume === "create-subscription") {
      navigate(`/webhouse-portal/subscriptions/create?resumed=1&moduleId=${id}`, { replace: true });
      return;
    }
    if (isEdit) {
      navigate("/webhouse-portal/modules");
      return;
    }
    setMessage("Module created successfully.");
    setModuleName("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!moduleName.trim()) {
      setError("Please enter a module name.");
      return;
    }
    setLoading(true);
    try {
      if (isEdit) {
        await apiFetch(
          `/modules/${moduleId}`,
          { method: "PUT", body: JSON.stringify({ module_name: moduleName.trim() }) },
          authFetch
        );
        setBaseline(moduleName.trim());
        navigate("/webhouse-portal/modules");
        return;
      }
      const created = await apiFetch(
        "/modules",
        { method: "POST", body: JSON.stringify({ module_name: moduleName.trim() }) },
        authFetch
      );
      if (resume || returnTo) {
        returnAfterSave(created.id);
      } else {
        setMessage("Module created successfully.");
        setModuleName("");
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
          <p className="wh-muted">Loading module…</p>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={isEdit ? "Edit Module" : "Create Module"}
          description="Add or update an application module on the platform."
          actions={
            <Button type="button" variant="secondary" onClick={goBack}>
              {isEdit ? "Back to modules" : resume || returnTo ? "Back without saving" : "Back"}
            </Button>
          }
        />
        <form onSubmit={handleSubmit} className="wh-form-stack">
          <FormPageAlerts error={error} message={message} />
          <FormBlock title="Module details" description="Enter the name shown to tenants when this module is enabled.">
            <FormField
              id="module_name"
              label="Module name"
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              required
            />
          </FormBlock>
          <FormActions>
            {isEdit && (
              <Button type="button" variant="secondary" onClick={() => navigate("/webhouse-portal/modules")}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : isEdit ? "Save module" : "Create module"}
            </Button>
          </FormActions>
        </form>
      </FormPageLayout>
      <UnsavedChangesDialog open={dialogOpen} onStay={stayOnPage} onDiscard={leavePage} />
    </div>
  );
}
