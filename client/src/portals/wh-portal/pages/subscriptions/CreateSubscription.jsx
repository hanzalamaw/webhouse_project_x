import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { LoginPortalSelect } from "../../../../components/LoginPortalSelect";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch } from "../../../../api/client";

function moduleCreateUrl(resume, returnTo) {
  const params = new URLSearchParams({ resume });
  if (returnTo) params.set("returnTo", returnTo);
  return `/webhouse-portal/modules/create?${params.toString()}`;
}

export default function CreateSubscription() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const resume = searchParams.get("resume");
  const returnTo = searchParams.get("returnTo");
  const returnPath =
    returnTo ||
    (resume === "create-tenant"
      ? "/webhouse-portal/subscriptions/create?resume=create-tenant"
      : null);

  const [planName, setPlanName] = useState("");
  const [planPrice, setPlanPrice] = useState("");
  const [loginPortal, setLoginPortal] = useState("");
  const [modules, setModules] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadModules = useCallback(async () => {
    const res = await apiFetch("/modules/all", {}, authFetch);
    setModules(res.data || []);
  }, [authFetch]);

  useEffect(() => {
    loadModules().catch(() => {});
  }, [loadModules]);

  useEffect(() => {
    if (searchParams.get("resumed") !== "1") return;
    const moduleId = Number(searchParams.get("moduleId"));
    loadModules()
      .then(() => {
        if (moduleId) setSelected((prev) => (prev.includes(moduleId) ? prev : [...prev, moduleId]));
      })
      .catch(() => {});
    const next = resume === "create-tenant" ? { resume: "create-tenant" } : {};
    setSearchParams(next, { replace: true });
  }, [searchParams, loadModules, setSearchParams, resume]);

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!planName.trim()) {
      setError("Plan name is required.");
      return;
    }
    if (planPrice === "" || Number.isNaN(Number(planPrice)) || Number(planPrice) < 0) {
      setError("A valid monthly plan price is required.");
      return;
    }
    if (!loginPortal) {
      setError("Select an ERP login portal for this plan.");
      return;
    }
    if (selected.length === 0) {
      setError("Select at least one module.");
      return;
    }
    setLoading(true);
    try {
      const created = await apiFetch(
        "/subscriptions",
        {
          method: "POST",
          body: JSON.stringify({
            plan_name: planName.trim(),
            plan_price: Number(planPrice),
            login_portal: loginPortal,
            module_ids: selected,
          }),
        },
        authFetch
      );
      if (returnTo) {
        const url = new URL(returnTo, window.location.origin);
        url.searchParams.set("resumed", "1");
        url.searchParams.set("planId", String(created.id));
        navigate(`${url.pathname}${url.search}`, { replace: true });
      } else if (resume === "create-tenant") {
        navigate(`/webhouse-portal/tenants/create?resumed=1&planId=${created.id}`, { replace: true });
      } else {
        setPlanName("");
        setPlanPrice("");
        setLoginPortal("");
        setSelected([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wh-page">
      <PageHeader title="Create Subscription" description="Monthly price, ERP portal, and included modules." />
      <Card>
        <form className="wh-form" onSubmit={handleSubmit}>
          <div className="wh-form-grid">
            <FormField id="plan_name" label="Plan Name" value={planName} onChange={(e) => setPlanName(e.target.value)} required />
            <FormField
              id="plan_price"
              label="Monthly Price (Rs.)"
              type="number"
              step="0.01"
              min="0"
              value={planPrice}
              onChange={(e) => setPlanPrice(e.target.value)}
              required
            />
          </div>
          <div className="wh-field">
            <span className="wh-field__label">ERP Login Portal</span>
            <LoginPortalSelect value={loginPortal} onChange={setLoginPortal} />
          </div>
          <p className="wh-field__label">Included Modules</p>
          {modules.length === 0 ? null : (
            <div className="wh-checkbox-grid">
              {modules.map((m) => (
                <label key={m.id} className="wh-checkbox-item">
                  <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
                  {m.module_name}
                </label>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            style={{ marginTop: 12 }}
            onClick={() => navigate(moduleCreateUrl(resume || "create-subscription", returnPath))}
          >
            Create new module
          </Button>
          {error && <span className="wh-field__error">{error}</span>}
          <div className="wh-action-btns" style={{ marginTop: 16 }}>
            {resume === "create-tenant" && (
              <Button type="button" variant="secondary" onClick={() => navigate("/webhouse-portal/tenants/create")}>
                Back to walkthrough
              </Button>
            )}
            <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Create Plan"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
