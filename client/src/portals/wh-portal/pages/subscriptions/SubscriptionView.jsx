import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch } from "../../../../api/client";
import { PageHeader } from "../../../../components/PageHeader";
import { Button } from "../../../../components/Button";
import { FormPageLayout } from "../../../../components/FormPageLayout";
import { DetailGrid, DetailValue, RecordViewSummary } from "../../../../components/RecordView";
import { formatPKR } from "../../../../utils/currency";
import { formatDateTime } from "../../../../utils/dateTime";

export default function SubscriptionView() {
  const { planId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPlan(await apiFetch(`/subscriptions/${planId}`, {}, authFetch));
    } catch (e) {
      setPlan(null);
      setError(e.message || "Plan not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, planId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return <div className="wh-page"><FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout></div>;
  }

  if (!plan) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Plan not found"}</div>
          <Button variant="secondary" onClick={() => navigate("/webhouse-portal/subscriptions/manage")}>Back</Button>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Subscription plan"
          actions={
            <>
              <Button variant="secondary" onClick={() => navigate("/webhouse-portal/subscriptions/manage")}>Back</Button>
              <Button onClick={() => navigate(`/webhouse-portal/subscriptions/edit/${planId}`)}>Edit plan</Button>
            </>
          }
        />
        <RecordViewSummary title={plan.plan_name} subtitle={plan.billing_cycle} status={plan.status} />
        <DetailGrid>
          <DetailValue label="Monthly price">{formatPKR(plan.monthly_price)}</DetailValue>
          <DetailValue label="Yearly price">{formatPKR(plan.yearly_price)}</DetailValue>
          <DetailValue label="Max users">{plan.max_users ?? "—"}</DetailValue>
          <DetailValue label="Max warehouses">{plan.max_warehouses ?? "—"}</DetailValue>
          <DetailValue label="Max stores">{plan.max_stores ?? "—"}</DetailValue>
          <DetailValue label="Created">{formatDateTime(plan.created_at)}</DetailValue>
          <DetailValue label="Description" fullWidth multiline>{plan.description || "—"}</DetailValue>
        </DetailGrid>
      </FormPageLayout>
    </div>
  );
}
