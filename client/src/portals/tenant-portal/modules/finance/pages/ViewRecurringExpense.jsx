import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormPageLayout } from "../../../../../components/FormPageLayout";
import { FormBlock } from "../../../../../components/FormBlock";
import { Button } from "../../../../../components/Button";
import { StatusBadge } from "../../../../../components/Badge";
import { RecordViewSummary, DetailGrid, DetailValue } from "../../../../../components/RecordView";
import { formatPKR } from "../../../../../utils/currency";
import { formatDate } from "../../../../../utils/dateTime";
import { MODULE_BASE } from "../constants";

function frequencyLabel(value) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ViewRecurringExpense() {
  const { recurringId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("finance");
  const navigate = useNavigate();
  const [recurring, setRecurring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRecurring(await apiFetch(`/finance/recurring-expenses/${recurringId}`, {}, authFetch));
    } catch (e) {
      setRecurring(null);
      setError(e.message || "Recurring expense not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, recurringId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!recurring) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Recurring expense not found"}</div>
          <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/recurring-expenses`)}>Back</Button>
        </FormPageLayout>
      </div>
    );
  }

  const bankLabel = recurring.bank_name
    ? `${recurring.bank_name} — ${recurring.account_title}`
    : "—";

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Recurring expense"
          description="Scheduled recurring cost."
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/recurring-expenses`)}>All recurring</Button>
              {canEdit && <Button onClick={() => navigate(`${MODULE_BASE}/recurring-expenses/edit/${recurringId}`)}>Edit</Button>}
            </div>
          }
        />

        <div className="wh-form-stack">
          <RecordViewSummary
            title={recurring.title}
            subtitle={[recurring.category_name, recurring.sub_category_name].filter(Boolean).join(" · ")}
            status={recurring.status}
            chips={[
              { label: "Amount", value: formatPKR(recurring.amount) },
              { label: "Next due", value: formatDate(recurring.next_due_date) },
            ]}
          />

          <FormBlock title="Schedule details">
            <DetailGrid>
              <DetailValue label="Title" highlight>{recurring.title}</DetailValue>
              <DetailValue label="Amount" highlight>{formatPKR(recurring.amount)}</DetailValue>
              <DetailValue label="Frequency">{frequencyLabel(recurring.frequency)}</DetailValue>
              <DetailValue label="Next due date">{formatDate(recurring.next_due_date)}</DetailValue>
              <DetailValue label="Status"><StatusBadge status={recurring.status} /></DetailValue>
              <DetailValue label="Category">{recurring.category_name}</DetailValue>
              <DetailValue label="Sub-category">{recurring.sub_category_name || "—"}</DetailValue>
              <DetailValue label="Bank account">{bankLabel}</DetailValue>
            </DetailGrid>
          </FormBlock>
        </div>
      </FormPageLayout>
    </div>
  );
}
