import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { useAuth } from "../../../../context/AuthContext";
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
  const [searchParams] = useSearchParams();
  const resume = searchParams.get("resume");
  const returnTo = searchParams.get("returnTo");
  const [moduleName, setModuleName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (returnTo) {
      setMessage("After saving, you will return to your walkthrough with this module selected.");
    } else if (resume === "create-tenant") {
      setMessage("After saving, you will return to Create Tenant with this module selected.");
    } else if (resume === "create-subscription") {
      setMessage("After saving, you will return to Create Subscription with this module selected.");
    }
  }, [resume, returnTo]);

  const goBack = () => {
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

  const returnAfterSave = (moduleId) => {
    if (returnTo) {
      navigate(appendResumeParams(returnTo, moduleId), { replace: true });
      return;
    }
    if (resume === "create-tenant") {
      navigate(`/webhouse-portal/tenants/create?resumed=1&moduleId=${moduleId}`, { replace: true });
      return;
    }
    if (resume === "create-subscription") {
      navigate(`/webhouse-portal/subscriptions/create?resumed=1&moduleId=${moduleId}`, { replace: true });
      return;
    }
    setMessage("Module created successfully.");
    setModuleName("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!moduleName.trim()) {
      setError("Module name is required.");
      return;
    }
    setLoading(true);
    try {
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

  return (
    <div className="wh-page">
      <PageHeader title="Create Module" description="Add a new application module to the platform." />
      <Card>
        <form className="wh-form" onSubmit={handleSubmit}>
          <FormField
            id="module_name"
            label="Module Name"
            value={moduleName}
            onChange={(e) => setModuleName(e.target.value)}
            placeholder="Inventory"
            error={error}
            required
          />
          {message && <p className="wh-form-message">{message}</p>}
          <div className="wh-action-btns">
            {(resume || returnTo) && (
              <Button type="button" variant="secondary" onClick={goBack}>
                Back without saving
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Create Module"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
