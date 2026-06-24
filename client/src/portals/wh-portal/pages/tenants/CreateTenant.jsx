import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
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
  fiscalToStorage,
  fiscalFromStorage,
  formatFiscalDisplay,
  toInputDate,
  DEFAULT_FISCAL_START_MONTH,
  DEFAULT_FISCAL_START_DAY,
  DEFAULT_FISCAL_END_MONTH,
  DEFAULT_FISCAL_END_DAY,
} from "../../../../utils/billing";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function buildInitial() {
  return {
    step: 0,
    maxStep: 0,
    tenant_id: null,
    company: { company_name: "", owner_name: "", owner_email: "", owner_phone: "", industry: "", status: "active" },
    subscription_plan_id: "",
    module_ids: [],
    limits: { max_users: 10, max_warehouses: 1, max_stores: 1, max_orders_per_month: 1000 },
    billing: { billing_cycle: "monthly", start_date: "", renewal_date: "", status: "active", total_amount: 0, amount_due: 0 },
    payment: { bank: 0, cash: 0, total_received: 0, received_at: "" },
    organization: {
      company_name: "",
      logo_url: "",
      timezone: DEFAULT_TIMEZONE,
      currency: DEFAULT_CURRENCY,
      language: "en",
      fiscal_year_start: fiscalToStorage(DEFAULT_FISCAL_START_MONTH, DEFAULT_FISCAL_START_DAY),
      fiscal_year_end: fiscalToStorage(DEFAULT_FISCAL_END_MONTH, DEFAULT_FISCAL_END_DAY),
    },
    super_admin: { username: "", email: "", password: "", name: "" },
  };
}

function mapTenantToDraft(t) {
  const moduleIds = (t.modules || []).filter((m) => Number(m.is_enabled) !== 0).map((m) => m.module_id);
  return {
    step: 0,
    maxStep: 8,
    tenant_id: t.id,
    company: {
      company_name: t.company_name || "",
      owner_name: t.owner_name || "",
      owner_email: t.owner_email || "",
      owner_phone: t.owner_phone || "",
      industry: t.industry || "",
      status: t.status || "active",
    },
    subscription_plan_id: String(t.subscription_plan_id || ""),
    module_ids: moduleIds,
    limits: {
      max_users: t.max_users ?? 10,
      max_warehouses: t.max_warehouses ?? 1,
      max_stores: t.max_stores ?? 1,
      max_orders_per_month: t.max_orders_per_month ?? 1000,
    },
    billing: {
      billing_cycle: t.billing_cycle || "monthly",
      start_date: toInputDate(t.start_date),
      renewal_date: toInputDate(t.renewal_date),
      status: t.subscription_status || "active",
      total_amount: t.total_amount ?? 0,
      amount_due: t.amount_due ?? 0,
    },
    payment: {
      bank: t.payment?.bank ?? 0,
      cash: t.payment?.cash ?? 0,
      total_received: t.payment?.total_received ?? 0,
      received_at: toInputDate(t.payment?.received_at),
    },
    organization: {
      company_name: t.organization?.company_name || t.company_name || "",
      logo_url: t.organization?.logo_url || "",
      timezone: t.organization?.timezone || DEFAULT_TIMEZONE,
      currency: t.organization?.currency || DEFAULT_CURRENCY,
      language: t.organization?.language || "en",
      fiscal_year_start: t.organization?.fiscal_year_start || fiscalToStorage(1, 1),
      fiscal_year_end: t.organization?.fiscal_year_end || fiscalToStorage(12, 31),
    },
    super_admin: {
      username: t.super_admin?.username || "",
      email: t.super_admin?.email || "",
      password: "",
      name: t.super_admin?.name || "",
    },
  };
}

function MonthDayFields({ month, day, onChange, idPrefix }) {
  const daysInMonth = new Date(2000, month, 0).getDate();
  return (
    <div className="wh-month-day-row">
      <FormField
        id={`${idPrefix}_month`}
        as="select"
        value={month}
        onChange={(e) => onChange(Number(e.target.value), day)}
        aria-label="Month"
      >
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </FormField>
      <FormField
        id={`${idPrefix}_day`}
        as="select"
        value={day}
        onChange={(e) => onChange(month, Number(e.target.value))}
        aria-label="Day"
      >
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </FormField>
    </div>
  );
}

const INITIAL = buildInitial();

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

function moduleCreateUrl(isEdit, tenantId) {
  if (isEdit) {
    return `/webhouse-portal/modules/create?returnTo=${encodeURIComponent(`/webhouse-portal/tenants/edit/${tenantId}`)}`;
  }
  return "/webhouse-portal/modules/create?resume=create-tenant";
}

function planCreateUrl(isEdit, tenantId) {
  if (isEdit) {
    return `/webhouse-portal/subscriptions/create?returnTo=${encodeURIComponent(`/webhouse-portal/tenants/edit/${tenantId}`)}`;
  }
  return "/webhouse-portal/subscriptions/create?resume=create-tenant";
}

export default function CreateTenant() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const { tenantId: routeTenantId } = useParams();
  const isEdit = Boolean(routeTenantId);
  const draftKey = isEdit ? `wh_edit_tenant_draft_${routeTenantId}` : WIZARD_DRAFT_KEY;
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft, clearDraft] = useWizardDraft(draftKey, buildInitial());
  const [hydrated, setHydrated] = useState(!isEdit);
  const [plans, setPlans] = useState([]);
  const [planModules, setPlanModules] = useState([]);
  const [extraModules, setExtraModules] = useState([]);
  const [stepError, setStepError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { currencies, timezones, loading: refLoading } = useReferenceData();

  useEffect(() => {
    setDraft((d) => {
      const max = d.maxStep ?? 0;
      if (d.step <= max) return d;
      return { ...d, maxStep: d.step };
    });
  }, [draft.step, setDraft]);

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
    if (!isEdit || hydrated) return;
    (async () => {
      try {
        const tenant = await apiFetch(`/tenants/${routeTenantId}`, {}, authFetch);
        setDraft(mapTenantToDraft(tenant));
        setHydrated(true);
      } catch (err) {
        setError(err.message || "Failed to load tenant");
      }
    })();
  }, [isEdit, hydrated, routeTenantId, authFetch, setDraft]);

  useEffect(() => {
    if (searchParams.get("resumed") !== "1") return;

    const planId = searchParams.get("planId");
    const moduleId = searchParams.get("moduleId");

    (async () => {
      await loadPlans().catch(() => {});
      if (planId) {
        setDraft((d) => ({
          ...d,
          subscription_plan_id: planId,
          step: Math.max(d.step, 1),
          maxStep: Math.max(d.maxStep ?? 0, 1),
        }));
        await loadPlanModules(planId, false);
      }
      if (moduleId) {
        setDraft((d) => ({
          ...d,
          step: Math.max(d.step, 2),
          maxStep: Math.max(d.maxStep ?? 0, 2),
        }));
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
    const renewal = calcRenewalDate(draft.billing.start_date, draft.billing.billing_cycle);
    setDraft((d) => ({
      ...d,
      billing: { ...d.billing, renewal_date: renewal },
    }));
  }, [draft.billing.start_date, draft.billing.billing_cycle, setDraft]);

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

  const handleCancel = () => {
    clearDraft();
    setExtraModules([]);
    setStepError("");
    setError("");
    navigate("/webhouse-portal/tenants/manage");
  };

  const handleReset = () => {
    if (!window.confirm("Clear this walkthrough and start from the beginning?")) return;
    clearDraft();
    setExtraModules([]);
    setStepError("");
    setError("");
    setSearchParams({}, { replace: true });
    if (isEdit) setHydrated(false);
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
    setDraft((d) => ({
      ...d,
      billing: {
        ...d.billing,
        billing_cycle: cycle,
        renewal_date: calcRenewalDate(d.billing.start_date, cycle),
      },
    }));
  };

  const updateBillingStart = (e) => {
    setStepError("");
    const start = e.target.value;
    setDraft((d) => ({
      ...d,
      billing: {
        ...d.billing,
        start_date: start,
        renewal_date: calcRenewalDate(start, d.billing.billing_cycle),
      },
    }));
  };

  const setFiscalStart = (month, day) => {
    setStepError("");
    const start = fiscalToStorage(month, day);
    setDraft((d) => ({
      ...d,
      organization: {
        ...d.organization,
        fiscal_year_start: start,
        fiscal_year_end: calcFiscalYearEnd(start),
      },
    }));
  };

  const setFiscalEnd = (month, day) => {
    setStepError("");
    setDraft((d) => ({
      ...d,
      organization: { ...d.organization, fiscal_year_end: fiscalToStorage(month, day) },
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
        if (!sa.username.trim()) return "Super admin username is required.";
        if (/\s/.test(sa.username)) return "Username cannot contain spaces.";
        if (!sa.email.trim()) return "Super admin email is required.";
        if (!EMAIL_RE.test(sa.email.trim())) return "Enter a valid super admin email.";
        if (!isEdit && (!sa.password || sa.password.length < 6)) return "Password is required (min 6 characters).";
        if (isEdit && sa.password && sa.password.length < 6) return "Password must be at least 6 characters if changing.";
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
        super_admin: {
          name: draft.super_admin.name,
          username: draft.super_admin.username.trim().toLowerCase(),
          email: draft.super_admin.email.trim(),
          ...(draft.super_admin.password ? { password: draft.super_admin.password } : {}),
        },
      };
      if (isEdit) {
        await apiFetch(`/tenants/${routeTenantId}/full`, { method: "PUT", body: JSON.stringify(payload) }, authFetch);
      } else {
        await apiFetch("/tenants", { method: "POST", body: JSON.stringify(payload) }, authFetch);
      }
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
            <p>
              ERP portal (from plan): <strong>{selectedPlan.login_portal?.toUpperCase() || "not set"}</strong>
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(planCreateUrl(isEdit, routeTenantId))}
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
          {!draft.subscription_plan_id ? null : displayModules.length === 0 ? null : (
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
                    <span style={{ marginLeft: 6, fontSize: 12 }}>(new)</span>
                  )}
                </label>
              ))}
            </div>
          )}
          <Button type="button" variant="secondary" style={{ marginTop: 12 }} onClick={() => navigate(moduleCreateUrl(isEdit, routeTenantId))}>
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
        </div>
      ),
    },
    {
      id: "org",
      label: "Organization",
      content: (
        <>
          <div className="wh-form-grid">
            <FormField
              id="ocn"
              label="Company Name"
              value={draft.organization.company_name}
              onChange={update("organization", "company_name")}
              required
            />
            <FormField id="logo" label="Logo URL" value={draft.organization.logo_url} onChange={update("organization", "logo_url")} />
            <SearchableSelect
              id="tz"
              label="Timezone"
              value={draft.organization.timezone || DEFAULT_TIMEZONE}
              onChange={(v) => {
                setStepError("");
                setDraft((d) => ({ ...d, organization: { ...d.organization, timezone: v || DEFAULT_TIMEZONE } }));
              }}
              options={timezones}
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
              loading={refLoading}
            />
            <FormField id="lang" label="Language" as="select" value={draft.organization.language} onChange={update("organization", "language")}>
              <option value="en">English</option>
            </FormField>
            <div className="wh-field">
              <span className="wh-field__label">Fiscal Year Start</span>
              <MonthDayFields
                idPrefix="fys"
                {...fiscalFromStorage(draft.organization.fiscal_year_start)}
                onChange={setFiscalStart}
              />
            </div>
            <div className="wh-field">
              <span className="wh-field__label">Fiscal Year End</span>
              <MonthDayFields
                idPrefix="fye"
                {...fiscalFromStorage(draft.organization.fiscal_year_end)}
                onChange={setFiscalEnd}
              />
            </div>
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
          <FormField id="sa_user" label="Username" value={draft.super_admin.username} onChange={update("super_admin", "username")} required />
          <FormField id="sa_email" label="Email" type="email" value={draft.super_admin.email} onChange={update("super_admin", "email")} required />
          <FormField
            id="sa_pass"
            label={isEdit ? "New Password (optional)" : "Password"}
            type="password"
            value={draft.super_admin.password}
            onChange={update("super_admin", "password")}
            required={!isEdit}
          />
        </div>
      ),
    },
    {
      id: "review",
      label: "Review",
      content: (
        <div className="wh-review">
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
            <ReviewRow label="Fiscal year start" value={formatFiscalDisplay(draft.organization.fiscal_year_start)} />
            <ReviewRow label="Fiscal year end" value={formatFiscalDisplay(draft.organization.fiscal_year_end)} />
          </ReviewBlock>
          <ReviewBlock step={8} title="Super Admin">
            <ReviewRow label="Name" value={draft.super_admin.name} />
            <ReviewRow label="Username" value={draft.super_admin.username} />
            <ReviewRow label="Email" value={draft.super_admin.email} />
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
        title={isEdit ? "Edit Tenant" : "Create Tenant"}
        description={isEdit ? "Step-by-step walkthrough to update this client account." : "Step-by-step onboarding for new client accounts."}
        actions={
          <div className="wh-page-header__actions">
            <Button type="button" variant="secondary" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={handleReset}>
              Reset &amp; start over
            </Button>
          </div>
        }
      />
      <Card>
        {!hydrated ? (
          <p className="wh-muted">Loading tenant…</p>
        ) : (
          <>
        {error && <p className="wh-field__error">{error}</p>}
        <StepWizard
          steps={steps}
          currentStep={draft.step}
          onStepChange={setStep}
          onValidateStep={handleValidateStep}
          stepError={stepError}
          onSubmit={submit}
          submitLabel={isEdit ? "Update Tenant" : "Create Tenant"}
          loading={loading}
          freeNavigation={isEdit}
          maxReachableStep={isEdit ? steps.length - 1 : (draft.maxStep ?? draft.step)}
        />
          </>
        )}
      </Card>
    </div>
  );
}
