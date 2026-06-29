import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";
import { FormBlock } from "../../../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../../components/FormPageLayout";
import { SearchableSelect } from "../../../../../components/SearchableSelect";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { useReferenceData, DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "../../../../../hooks/useReferenceData";
import { apiFetch } from "../../../../../api/client";
import { useUnsavedChangesGuard } from "../../../../../hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "../../../../../components/UnsavedChangesDialog";
import {
  fiscalToStorage,
  fiscalFromStorage,
  calcFiscalYearEnd,
} from "../../../../../utils/billing";

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

function MonthDayFields({ month, day, onChange, idPrefix, disabled = false }) {
  const daysInMonth = new Date(2000, month, 0).getDate();
  return (
    <div className="wh-month-day-row">
      <FormField
        id={`${idPrefix}_month`}
        as="select"
        value={month}
        onChange={(e) => onChange(Number(e.target.value), day)}
        aria-label="Month"
        disabled={disabled}
      >
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </FormField>
      <FormField
        id={`${idPrefix}_day`}
        as="select"
        value={day}
        onChange={(e) => onChange(month, Number(e.target.value))}
        aria-label="Day"
        disabled={disabled}
      >
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </FormField>
    </div>
  );
}

const EMPTY_FORM = {
  company_name: "",
  logo_url: "",
  timezone: DEFAULT_TIMEZONE,
  currency: DEFAULT_CURRENCY,
  language: "en",
  fiscal_year_start: fiscalToStorage(1, 1),
  fiscal_year_end: fiscalToStorage(12, 31),
};

export default function OrganizationSettings() {
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("admin");
  const { currencies, timezones, loading: refLoading } = useReferenceData();
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return apiFetch("/tenant/organization-settings", {}, authFetch)
      .then((res) => {
        const data = res.data || {};
        const next = {
          company_name: data.company_name || "",
          logo_url: data.logo_url || "",
          timezone: data.timezone || DEFAULT_TIMEZONE,
          currency: data.currency || DEFAULT_CURRENCY,
          language: data.language || "en",
          fiscal_year_start: data.fiscal_year_start || fiscalToStorage(1, 1),
          fiscal_year_end: data.fiscal_year_end || fiscalToStorage(12, 31),
        };
        setForm(next);
        setBaseline(JSON.stringify(next));
      })
      .catch((err) => setError(err.message || "Failed to load settings"))
      .finally(() => setLoading(false));
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const setFiscalStart = (month, day) => {
    const start = fiscalToStorage(month, day);
    setForm((f) => ({
      ...f,
      fiscal_year_start: start,
      fiscal_year_end: calcFiscalYearEnd(start),
    }));
  };

  const isDirty = useMemo(
    () => baseline !== null && JSON.stringify(form) !== baseline,
    [baseline, form]
  );
  const { dialogOpen, stayOnPage, leavePage } = useUnsavedChangesGuard(isDirty, { enabled: !loading });

  const save = async () => {
    if (!form.company_name.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(
        "/tenant/organization-settings",
        {
          method: "PUT",
          body: JSON.stringify({
            company_name: form.company_name.trim(),
            logo_url: form.logo_url.trim() || null,
            timezone: form.timezone || DEFAULT_TIMEZONE,
            currency: form.currency || DEFAULT_CURRENCY,
            language: form.language || "en",
            fiscal_year_start: form.fiscal_year_start,
            fiscal_year_end: form.fiscal_year_end,
          }),
        },
        authFetch
      );
      setMessage("Organization settings saved.");
      setBaseline(JSON.stringify(form));
      window.dispatchEvent(new CustomEvent("tenant-org-updated"));
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wh-page">
      <FormPageLayout wide>
        <PageHeader
          title="Organization Settings"
          description="Company profile, logo, timezone, currency, language, and fiscal year."
        />
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <form
            className="wh-form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <FormPageAlerts error={error} message={message} />
            <FormBlock title="Company profile" description="How your organization appears across the system.">
              <div className="wh-form-grid">
                <FormField
                  id="company_name"
                  label="Company name"
                  value={form.company_name}
                  onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                  required
                  disabled={!canEdit}
                />
                <FormField
                  id="logo_url"
                  label="Logo URL"
                  value={form.logo_url}
                  onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                  placeholder="https://example.com/logo.png"
                  disabled={!canEdit}
                />
                {form.logo_url && (
                  <div className="wh-logo-preview wh-form-grid__full">
                    <span className="wh-field__label">Logo preview</span>
                    <img
                      src={form.logo_url}
                      alt="Organization logo"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  </div>
                )}
                <SearchableSelect
                  id="timezone"
                  label="Timezone"
                  value={form.timezone}
                  onChange={(v) => setForm((f) => ({ ...f, timezone: v || DEFAULT_TIMEZONE }))}
                  options={timezones}
                  loading={refLoading}
                  disabled={!canEdit}
                />
                <SearchableSelect
                  id="currency"
                  label="Currency"
                  value={form.currency}
                  onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                  options={currencies}
                  loading={refLoading}
                  disabled={!canEdit}
                />
                <FormField
                  id="language"
                  label="Language"
                  as="select"
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  disabled={!canEdit}
                >
                  <option value="en">English</option>
                </FormField>
              </div>
            </FormBlock>
            <FormBlock title="Fiscal year" description="Used for reporting and billing periods.">
              <div className="wh-form-grid">
                <div className="wh-field">
                  <span className="wh-field__label">Fiscal year start</span>
                  <MonthDayFields
                    idPrefix="fys"
                    {...fiscalFromStorage(form.fiscal_year_start)}
                    onChange={setFiscalStart}
                    disabled={!canEdit}
                  />
                </div>
                <div className="wh-field">
                  <span className="wh-field__label">Fiscal year end</span>
                  <MonthDayFields
                    idPrefix="fye"
                    {...fiscalFromStorage(form.fiscal_year_end)}
                    onChange={() => {}}
                    disabled
                  />
                  <p className="wh-muted" style={{ marginTop: 6 }}>
                    Calculated automatically from the fiscal year start.
                  </p>
                </div>
              </div>
            </FormBlock>
            <FormActions>
              <Button type="submit" disabled={!canEdit || saving}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </FormActions>
          </form>
        )}
      </FormPageLayout>
      <UnsavedChangesDialog open={dialogOpen} onStay={stayOnPage} onDiscard={leavePage} />
    </div>
  );
}
