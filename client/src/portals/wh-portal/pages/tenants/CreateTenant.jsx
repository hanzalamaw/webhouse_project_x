import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { StepWizard, useWizardDraft } from "../../../../components/StepWizard";
import { useAuth } from "../../../../context/AuthContext";
import { useReferenceData, DEFAULT_CURRENCY, DEFAULT_TIMEZONE, formatTimezoneDisplay, formatCurrencyDisplay } from "../../../../hooks/useReferenceData";
import { SearchableSelect } from "../../../../components/SearchableSelect";
import {
  apiFetch,
  WIZARD_DRAFT_KEY,
  TENANT_STATUS,
  SUBSCRIPTION_STATUS,
  BILLING_CYCLES,
} from "../../../../api/client";
import { formatPKR } from "../../../../utils/currency";
import {
  calcBillingTotal,
  calcRenewalDate,
  calcFiscalYearEnd,
  addPaymentReceived,
} from "../../../../utils/billing";

const INITIAL = {
  step: 0,
  company: { company_name: "", owner_name: "", owner_email: "", owner_phone: "", industry: "", status: "active" },
  subscription_plan_id: "",
  module_ids: [],
  limits: { max_users: 10, max_warehouses: 1, max_stores: 1, max_orders_per_month: 1000 },
  billing: { billing_cycle: "monthly", start_date: "", renewal_date: "", status: "active", total_amount: 0, amount_due: 0 },
  payment: { bank: 0, cash: 0, total_received: 0, received_at: "" },
  organization: { company_name: "", logo_url: "", timezone: DEFAULT_TIMEZONE, currency: DEFAULT_CURRENCY, language: "en", fiscal_year_start: "", fiscal_year_end: "" },
  super_admin: { username: "", password: "", name: "" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ReviewBlock({ step, title, children }) {
  return (
    <section className="wh-review-block">
      <header className="wh-review-block__header">
        <span className="wh-review-block__step">{step}</span>
        <h4 className="wh-review-block__title">{title}</h4>
      </header>
      <div className="wh-review-block__body">{children}</div>
    </section>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="wh-review-row">
      <span className="wh-review-row__label">{label}</span>
      <span className="wh-review-row__value">{value ?? "—"}</span>
    </div>
  );
}

function moduleCreateUrl() {
  return "/webhouse-portal/modules/create?resume=create-tenant";
}

export default function CreateTenant() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft, clearDraft] = useWizardDraft(WIZARD_DRAFT_KEY, INITIAL);
  const [plans, setPlans] = useState([]);
  const [planModules, setPlanModules] = useState([]);
  const [extraModules, setExtraModules] = useState([]);
  const [stepError, setStepError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { currencies, timezones, loading: refLoading } = useReferenceData();

  const selectedPlan = useMemo(
    () => plans.find((p) => String(p.id) === String(draft.subscription_plan_id)),
    [plans, draft.subscription_plan_id]
  );

  const loadPlans = useCallback(async () => {
    const r = await apiFetch("/subscriptions?page=1&limit=100", {}, authFetch);
    setPlans(r.data || []);
  }, [authFetch]);

  const loadPlanModules = useCallback(
    async (planId, preserveSelection = true) => {
      if (!planId) {
        setPlanModules([]);
        return;
      }
      const r = await apiFetch(`/subscriptions/${planId}/modules`, {}, authFetch);
      const mods = r.data || [];
      setPlanModules(mods);
      if (!preserveSelection) {
        setDraft((d) => ({ ...d, module_ids: mods.map((m) => m.id) }));
      } else {
        setDraft((d) => {
          const merged = new Set([...d.module_ids, ...mods.map((m) => m.id)]);
          return { ...d, module_ids: [...merged] };
        });
      }
    },
    [authFetch, setDraft]
  );

  const addModuleById = useCallback(
    async (moduleId) => {
      if (!moduleId) return;
      try {
        const mod = await apiFetch(`/modules/${moduleId}`, {}, authFetch);
        setExtraModules((prev) => {
          if (prev.some((m) => m.id === mod.id)) return prev;
          return [...prev, mod];
        });
        setDraft((d) => ({
          ...d,
          module_ids: d.module_ids.includes(mod.id) ? d.module_ids : [...d.module_ids, mod.id],
        }));
      } catch {
        /* module list refresh will pick it up */
      }
    },
    [authFetch, setDraft]
  );

  useEffect(() => {
    loadPlans().catch(() => {});
  }, [loadPlans]);

  useEffect(() => {
    if (searchParams.get("resumed") !== "1") return;

    const planId = searchParams.get("planId");
    const moduleId = searchParams.get("moduleId");

    (async () => {
      await loadPlans().catch(() => {});
      if (planId) {
        setDraft((d) => ({ ...d, subscription_plan_id: planId, step: Math.max(d.step, 1) }));
        await loadPlanModules(planId, false);
      }
      if (moduleId) {
        setDraft((d) => ({ ...d, step: Math.max(d.step, 2) }));
        await addModuleById(Number(moduleId));
      }
    })();

    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, loadPlans, loadPlanModules, addModuleById, setDraft]);

  useEffect(() => {
    if (!draft.subscription_plan_id) {
      setPlanModules([]);
      return;
    }
    loadPlanModules(draft.subscription_plan_id, true).catch(() => {});
  }, [draft.subscription_plan_id, loadPlanModules]);

  useEffect(() => {
    if (!selectedPlan) return;
    const total = calcBillingTotal(selectedPlan.plan_price, draft.billing.billing_cycle);
    setDraft((d) => ({
      ...d,
      billing: { ...d.billing, total_amount: total },
    }));
  }, [selectedPlan, draft.billing.billing_cycle, setDraft]);

  useEffect(() => {
    if (!draft.billing.start_date) return;
    const renewal = calcRenewalDate(draft.billing.start_date);
    setDraft((d) => ({
      ...d,
      billing: { ...d.billing, renewal_date: renewal },
    }));
  }, [draft.billing.start_date, setDraft]);

  useEffect(() => {
    const received = addPaymentReceived(draft.payment.bank, draft.payment.cash);
    const due = Math.max(0, Number(draft.billing.total_amount || 0) - received);
    setDraft((d) => ({
      ...d,
      payment: { ...d.payment, total_received: received },
      billing: { ...d.billing, amount_due: due },
    }));
  }, [draft.payment.bank, draft.payment.cash, draft.billing.total_amount, setDraft]);

  const displayModules = useMemo(() => {
    const map = new Map();
    planModules.forEach((m) => map.set(m.id, m));
    extraModules.forEach((m) => map.set(m.id, m));
    return [...map.values()].sort((a, b) => a.module_name.localeCompare(b.module_name));
  }, [planModules, extraModules]);

  const handleReset = () => {
    if (!window.confirm("Clear this walkthrough and start from the beginning?")) return;
    clearDraft();
    setExtraModules([]);
    setStepError("");
    setError("");
    setSearchParams({}, { replace: true });
  };

  const setStep = (step) => {
    setStepError("");
    setDraft((d) => ({ ...d, step }));
  };

  const update = (section, key) => (e) => {
    setStepError("");
    const val = e.target.value;
    setDraft((d) => ({ ...d, [section]: { ...d[section], [key]: val } }));
  };

  const updateBillingCycle = (e) => {
    setStepError("");
    const cycle = e.target.value;
    setDraft((d) => ({ ...d, billing: { ...d.billing, billing_cycle: cycle } }));
  };

  const updateBillingStart = (e) => {
    setStepError("");
    const start = e.target.value;
    setDraft((d) => ({
      ...d,
      billing: {
        ...d.billing,
        start_date: start,
        renewal_date: calcRenewalDate(start),
      },
    }));
  };

  const updateFiscalStart = (e) => {
    setStepError("");
    const start = e.target.value;
    setDraft((d) => ({
      ...d,
      organization: {
        ...d.organization,
        fiscal_year_start: start,
        fiscal_year_end: calcFiscalYearEnd(start),
      },
    }));
  };

  const toggleModule = (id) => {
    setStepError("");
    setDraft((d) => ({
      ...d,
      module_ids: d.module_ids.includes(id) ? d.module_ids.filter((x) => x !== id) : [...d.module_ids, id],
    }));
  };

  const validateStep = (stepIndex) => {
    const c = draft.company;
    const b = draft.billing;
    const l = draft.limits;
    const o = draft.organization;
    const sa = draft.super_admin;

    switch (stepIndex) {
      case 0:
        if (!c.company_name.trim()) return "Company name is required.";
        if (!c.owner_name.trim()) return "Owner name is required.";
        if (!c.owner_email.trim()) return "Owner email is required.";
        if (!EMAIL_RE.test(c.owner_email.trim())) return "Enter a valid owner email.";
        if (!c.owner_phone.trim()) return "Owner phone is required.";
        if (!c.industry.trim()) return "Industry is required.";
        break;
      case 1:
        if (!draft.subscription_plan_id) return "Select a subscription plan.";
        if (!selectedPlan?.login_portal) return "Selected plan has no ERP portal — set it on the subscription plan.";
        break;
      case 2:
        if (!draft.subscription_plan_id) return "Select a subscription plan first.";
        if (displayModules.length === 0) return "Add at least one module to this plan or create a new module.";
        if (draft.module_ids.length === 0) return "Select at least one module.";
        break;
      case 3:
        if (Number(l.max_users) < 1) return "Max users must be at least 1.";
        if (Number(l.max_warehouses) < 1) return "Max warehouses must be at least 1.";
        if (Number(l.max_stores) < 1) return "Max stores must be at least 1.";
        if (Number(l.max_orders_per_month) < 1) return "Max orders per month must be at least 1.";
        break;
      case 4:
        if (!b.start_date) return "Start date is required.";
        if (!b.renewal_date) return "Renewal date is required.";
        if (b.renewal_date < b.start_date) return "Renewal date must be on or after start date.";
        if (b.total_amount === "" || Number(b.total_amount) < 0) return "Total amount is required.";
        if (b.amount_due === "" || Number(b.amount_due) < 0) return "Amount due is required.";
        break;
      case 5:
        break;
      case 6: {
        const orgName = (o.company_name || c.company_name).trim();
        if (!orgName) return "Organization company name is required.";
        break;
      }
      case 7:
        if (!sa.name.trim()) return "Super admin display name is required.";
        if (!sa.username.trim()) return "Super admin username (email) is required.";
        if (!EMAIL_RE.test(sa.username.trim())) return "Enter a valid super admin email.";
        if (!sa.password || sa.password.length < 6) return "Password is required (min 6 characters).";
        break;
      default:
        break;
    }
    setStepError("");
    return null;
  };

  const handleValidateStep = (stepIndex) => {
    const err = validateStep(stepIndex);
    setStepError(err || "");
    return err;
  };

  const submit = async () => {
    setError("");
    for (let i = 0; i < 8; i++) {
      const err = validateStep(i);
      if (err) {
        setStepError(err);
        setDraft((d) => ({ ...d, step: i }));
        return;
      }
    }
    setLoading(true);
    try {
      const payload = {
        company: draft.company,
        subscription_plan_id: Number(draft.subscription_plan_id),
        module_ids: draft.module_ids,
        limits: {
          ...draft.limits,
          max_users: Number(draft.limits.max_users),
          max_warehouses: Number(draft.limits.max_warehouses),
          max_stores: Number(draft.limits.max_stores),
          max_orders_per_month: Number(draft.limits.max_orders_per_month),
        },
        billing: {
          ...draft.billing,
          total_amount: Number(draft.billing.total_amount),
          amount_due: Number(draft.billing.amount_due),
        },
        payment: {
          bank: Number(draft.payment.bank) || 0,
          cash: Number(draft.payment.cash) || 0,
          total_received: Number(draft.payment.total_received) || 0,
          received_at: draft.payment.received_at || null,
        },
        organization: {
          ...draft.organization,
          company_name: draft.organization.company_name || draft.company.company_name,
        },
        super_admin: draft.super_admin,
      };
      await apiFetch("/tenants", { method: "POST", body: JSON.stringify(payload) }, authFetch);
      clearDraft();
      navigate("/webhouse-portal/tenants/manage");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      id: "company",
      label: "Company",
      content: (
        <div className="wh-form-grid">
          <FormField id="cn" label="Company Name" value={draft.company.company_name} onChange={update("company", "company_name")} required />
          <FormField id="on" label="Owner Name" value={draft.company.owner_name} onChange={update("company", "owner_name")} required />
          <FormField id="oe" label="Owner Email" type="email" value={draft.company.owner_email} onChange={update("company", "owner_email")} required />
          <FormField id="op" label="Owner Phone" value={draft.company.owner_phone} onChange={update("company", "owner_phone")} required />
          <FormField id="ind" label="Industry" value={draft.company.industry} onChange={update("company", "industry")} required />
          <FormField id="st" label="Status" as="select" value={draft.company.status} onChange={update("company", "status")}>
            {TENANT_STATUS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormField>
        </div>
      ),
    },
    {
      id: "plan",
      label: "Subscription",
      content: (
        <>
          <FormField
            id="plan"
            label="Subscription Plan"
            as="select"
            value={draft.subscription_plan_id}
            onChange={(e) => {
              setStepError("");
              const planId = e.target.value;
              setDraft((d) => ({ ...d, subscription_plan_id: planId, module_ids: [] }));
              setExtraModules([]);
            }}
            required
          >
            <option value="">Select plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.plan_name} — {formatPKR(p.plan_price)}/mo
              </option>
            ))}
          </FormField>
          {selectedPlan && (
            <p className="wh-muted">
              ERP portal (from plan): <strong>{selectedPlan.login_portal?.toUpperCase() || "not set"}</strong>
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/webhouse-portal/subscriptions/create?resume=create-tenant")}
          >
            Create new plan
          </Button>
        </>
      ),
    },
    {
      id: "modules",
      label: "Modules",
      content: (
        <>
          {!draft.subscription_plan_id ? (
            <p className="wh-muted">Select a subscription plan in the previous step first.</p>
          ) : displayModules.length === 0 ? (
            <p className="wh-muted">No modules on this plan yet. Create one below.</p>
          ) : (
            <div className="wh-checkbox-grid">
              {displayModules.map((m) => (
                <label key={m.id} className="wh-checkbox-item">
                  <input
                    type="checkbox"
                    checked={draft.module_ids.includes(m.id)}
                    onChange={() => toggleModule(m.id)}
                  />
                  {m.module_name}
                  {!planModules.some((pm) => pm.id === m.id) && (
                    <span className="wh-muted" style={{ marginLeft: 6, fontSize: 12 }}>(new)</span>
                  )}
                </label>
              ))}
            </div>
          )}
          <Button type="button" variant="secondary" style={{ marginTop: 12 }} onClick={() => navigate(moduleCreateUrl())}>
            Create new module
          </Button>
        </>
      ),
    },
    {
      id: "limits",
      label: "Limits",
      content: (
        <div className="wh-form-grid">
          <FormField id="mu" label="Max Users" type="number" min="1" value={draft.limits.max_users} onChange={update("limits", "max_users")} required />
          <FormField id="mw" label="Max Warehouses" type="number" min="1" value={draft.limits.max_warehouses} onChange={update("limits", "max_warehouses")} required />
          <FormField id="ms" label="Max Stores" type="number" min="1" value={draft.limits.max_stores} onChange={update("limits", "max_stores")} required />
          <FormField id="mo" label="Max Orders / Month" type="number" min="1" value={draft.limits.max_orders_per_month} onChange={update("limits", "max_orders_per_month")} required />
        </div>
      ),
    },
    {
      id: "billing",
      label: "Billing",
      content: (
        <>
          <p className="wh-muted" style={{ marginBottom: 12 }}>
            Plan price is monthly. Yearly billing multiplies by 12. Renewal date is the same calendar date next year (editable).
          </p>
          <div className="wh-form-grid">
            <FormField id="bc" label="Billing Cycle" as="select" value={draft.billing.billing_cycle} onChange={updateBillingCycle}>
              {BILLING_CYCLES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </FormField>
            <FormField id="sd" label="Start Date" type="date" value={draft.billing.start_date} onChange={updateBillingStart} required />
            <FormField id="rd" label="Renewal / End Date" type="date" value={draft.billing.renewal_date} onChange={update("billing", "renewal_date")} required />
            <FormField id="bs" label="Status" as="select" value={draft.billing.status} onChange={update("billing", "status")}>
              {SUBSCRIPTION_STATUS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FormField>
            <FormField id="ta" label="Total Amount (Rs.)" type="number" step="0.01" min="0" value={draft.billing.total_amount} onChange={update("billing", "total_amount")} required />
            <FormField id="ad" label="Amount Due (Rs.)" type="number" step="0.01" min="0" value={draft.billing.amount_due} onChange={update("billing", "amount_due")} required />
          </div>
        </>
      ),
    },
    {
      id: "payment",
      label: "Payment",
      content: (
        <div className="wh-form-grid">
          <FormField id="bank" label="Bank (Rs.)" type="number" step="0.01" min="0" value={draft.payment.bank} onChange={update("payment", "bank")} />
          <FormField id="cash" label="Cash (Rs.)" type="number" step="0.01" min="0" value={draft.payment.cash} onChange={update("payment", "cash")} />
          <FormField id="tr" label="Total Received (Rs.)" type="number" step="0.01" min="0" value={draft.payment.total_received} readOnly />
          <FormField id="ra" label="Received At" type="date" value={draft.payment.received_at} onChange={update("payment", "received_at")} />
          <p className="wh-muted">Total received = bank + cash. Amount due updates automatically. Leave at 0 if no payment yet.</p>
        </div>
      ),
    },
    {
      id: "org",
      label: "Organization",
      content: (
        <>
          <p className="wh-muted" style={{ marginBottom: 12 }}>
            Fiscal year end auto-fills to one day before the same date next year (editable).
          </p>
          <div className="wh-form-grid">
            <FormField
              id="ocn"
              label="Company Name"
              value={draft.organization.company_name}
              onChange={update("organization", "company_name")}
              placeholder={draft.company.company_name}
              required
            />
            <FormField id="logo" label="Logo URL" value={draft.organization.logo_url} onChange={update("organization", "logo_url")} />
            <SearchableSelect
              id="tz"
              label="Timezone"
              value={draft.organization.timezone}
              onChange={(v) => {
                setStepError("");
                setDraft((d) => ({ ...d, organization: { ...d.organization, timezone: v } }));
              }}
              options={timezones}
              placeholder="Search timezone…"
              loading={refLoading}
            />
            <SearchableSelect
              id="cur"
              label="Currency"
              value={draft.organization.currency}
              onChange={(v) => {
                setStepError("");
                setDraft((d) => ({ ...d, organization: { ...d.organization, currency: v } }));
              }}
              options={currencies}
              placeholder="Search currency…"
              loading={refLoading}
            />
            <FormField id="lang" label="Language" as="select" value={draft.organization.language} onChange={update("organization", "language")}>
              <option value="en">English</option>
            </FormField>
            <FormField id="fys" label="Fiscal Year Start" type="date" value={draft.organization.fiscal_year_start} onChange={updateFiscalStart} />
            <FormField id="fye" label="Fiscal Year End" type="date" value={draft.organization.fiscal_year_end} onChange={update("organization", "fiscal_year_end")} />
          </div>
        </>
      ),
    },
    {
      id: "admin",
      label: "Super Admin",
      content: (
        <div className="wh-form-grid">
          <FormField id="sa_name" label="Display Name" value={draft.super_admin.name} onChange={update("super_admin", "name")} required />
          <FormField id="sa_user" label="Username (email)" type="email" value={draft.super_admin.username} onChange={update("super_admin", "username")} required />
          <FormField id="sa_pass" label="Password" type="password" value={draft.super_admin.password} onChange={update("super_admin", "password")} required />
        </div>
      ),
    },
    {
      id: "review",
      label: "Review",
      content: (
        <div className="wh-review">
          <p className="wh-review__intro">
            Confirm each section below before creating the tenant. Use <strong>Back</strong> to change anything.
          </p>
          <div className="wh-review-stack">
          <ReviewBlock step={1} title="Company">
            <ReviewRow label="Company" value={draft.company.company_name} />
            <ReviewRow label="Owner" value={draft.company.owner_name} />
            <ReviewRow label="Email" value={draft.company.owner_email} />
            <ReviewRow label="Phone" value={draft.company.owner_phone} />
            <ReviewRow label="Industry" value={draft.company.industry} />
            <ReviewRow label="Status" value={draft.company.status} />
          </ReviewBlock>
          <ReviewBlock step={2} title="Subscription">
            <ReviewRow label="Plan" value={selectedPlan?.plan_name} />
            <ReviewRow label="Monthly price" value={selectedPlan ? formatPKR(selectedPlan.plan_price) : "—"} />
            <ReviewRow label="ERP portal" value={selectedPlan?.login_portal?.toUpperCase()} />
          </ReviewBlock>
          <ReviewBlock step={3} title="Modules">
            <ReviewRow
              label="Selected"
              value={
                displayModules
                  .filter((m) => draft.module_ids.includes(m.id))
                  .map((m) => m.module_name)
                  .join(", ") || "—"
              }
            />
          </ReviewBlock>
          <ReviewBlock step={4} title="Limits">
            <ReviewRow label="Max users" value={draft.limits.max_users} />
            <ReviewRow label="Max warehouses" value={draft.limits.max_warehouses} />
            <ReviewRow label="Max stores" value={draft.limits.max_stores} />
            <ReviewRow label="Max orders / month" value={draft.limits.max_orders_per_month} />
          </ReviewBlock>
          <ReviewBlock step={5} title="Billing">
            <ReviewRow label="Cycle" value={draft.billing.billing_cycle} />
            <ReviewRow label="Start date" value={draft.billing.start_date} />
            <ReviewRow label="Renewal date" value={draft.billing.renewal_date} />
            <ReviewRow label="Status" value={draft.billing.status} />
            <ReviewRow label="Total" value={formatPKR(draft.billing.total_amount)} />
            <ReviewRow label="Amount due" value={formatPKR(draft.billing.amount_due)} />
          </ReviewBlock>
          <ReviewBlock step={6} title="Payment">
            <ReviewRow label="Bank" value={formatPKR(draft.payment.bank)} />
            <ReviewRow label="Cash" value={formatPKR(draft.payment.cash)} />
            <ReviewRow label="Total received" value={formatPKR(draft.payment.total_received)} />
            <ReviewRow label="Received at" value={draft.payment.received_at || "—"} />
          </ReviewBlock>
          <ReviewBlock step={7} title="Organization">
            <ReviewRow label="Company" value={draft.organization.company_name || draft.company.company_name} />
            <ReviewRow label="Logo URL" value={draft.organization.logo_url || "—"} />
            <ReviewRow label="Timezone" value={formatTimezoneDisplay(draft.organization.timezone)} />
            <ReviewRow label="Currency" value={formatCurrencyDisplay(draft.organization.currency, currencies)} />
            <ReviewRow label="Language" value={draft.organization.language === "en" ? "English" : draft.organization.language || "—"} />
            <ReviewRow label="Fiscal year start" value={draft.organization.fiscal_year_start || "—"} />
            <ReviewRow label="Fiscal year end" value={draft.organization.fiscal_year_end || "—"} />
          </ReviewBlock>
          <ReviewBlock step={8} title="Super Admin">
            <ReviewRow label="Name" value={draft.super_admin.name} />
            <ReviewRow label="Email" value={draft.super_admin.username} />
            <ReviewRow label="Password" value={draft.super_admin.password ? "••••••••" : "—"} />
          </ReviewBlock>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Create Tenant"
        description="Step-by-step onboarding for new client accounts."
        actions={
          <Button type="button" variant="secondary" onClick={handleReset}>
            Reset &amp; start over
          </Button>
        }
      />
      <Card>
        {error && <p className="wh-field__error">{error}</p>}
        <StepWizard
          steps={steps}
          currentStep={draft.step}
          onStepChange={setStep}
          onValidateStep={handleValidateStep}
          stepError={stepError}
          onSubmit={submit}
          submitLabel="Create Tenant"
          loading={loading}
        />
      </Card>
    </div>
  );
}
