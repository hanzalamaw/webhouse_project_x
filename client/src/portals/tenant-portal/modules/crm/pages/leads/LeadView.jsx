import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { RecordViewSummary, DetailGrid, DetailValue } from "../../../../../../components/RecordView";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE, LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from "../../constants";

export default function LeadView() {
  const { leadId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("crm");
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLead(await apiFetch(`/crm/leads/${leadId}`, {}, authFetch));
    } catch (e) {
      setLead(null);
      setError(e.message || "Lead not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, leadId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Lead not found"}</div>
          <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/leads/manage`)}>Back to leads</Button>
        </FormPageLayout>
      </div>
    );
  }

  const sourceLabel = LEAD_SOURCE_LABELS[lead.source] || lead.source;

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Lead details"
          description="Read-only view of this lead record."
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/leads/manage`)}>All leads</Button>
              {canEdit && lead.status !== "converted" && (
                <Button onClick={() => navigate(`${MODULE_BASE}/leads/edit/${leadId}`)}>Edit lead</Button>
              )}
            </div>
          }
        />

        <div className="wh-form-stack">
          <RecordViewSummary
            title={lead.lead_name}
            subtitle={[lead.company_name, sourceLabel].filter(Boolean).join(" · ")}
            status={lead.status}
            chips={[
              { label: "Assigned", value: lead.assigned_to_name || "Unassigned" },
              { label: "Created", value: formatDateTime(lead.created_at) },
            ]}
          />

          <FormBlock title="Contact information" description="Who is this lead and how can you reach them?">
            <DetailGrid>
              <DetailValue label="Lead name" highlight>{lead.lead_name}</DetailValue>
              <DetailValue label="Company">{lead.company_name}</DetailValue>
              <DetailValue label="Phone">{lead.phone}</DetailValue>
              <DetailValue label="Email">{lead.email}</DetailValue>
            </DetailGrid>
          </FormBlock>

          <FormBlock title="Lead details" description="Source, pipeline status, assignment, and notes.">
            <DetailGrid>
              <DetailValue label="Source">{sourceLabel}</DetailValue>
              <DetailValue label="Status">
                <StatusBadge status={lead.status} /> {LEAD_STATUS_LABELS[lead.status] || ""}
              </DetailValue>
              <DetailValue label="Assigned to">{lead.assigned_to_name}</DetailValue>
              <DetailValue label="Last updated">{formatDateTime(lead.updated_at)}</DetailValue>
              <DetailValue label="Notes" fullWidth multiline>{lead.notes}</DetailValue>
            </DetailGrid>
          </FormBlock>

          {(lead.converted_customer_id || lead.status === "converted") && (
            <FormBlock title="Conversion" description="Customer created from this lead.">
              <DetailGrid>
                {lead.converted_customer_id ? (
                  <DetailValue label="Customer profile" fullWidth highlight>
                    <Link to={`${MODULE_BASE}/customers/${lead.converted_customer_id}`}>
                      Open customer record →
                    </Link>
                  </DetailValue>
                ) : (
                  <DetailValue label="Customer profile" fullWidth>Converted</DetailValue>
                )}
              </DetailGrid>
            </FormBlock>
          )}

          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/leads/manage`)}>
              Back to leads
            </Button>
            {canEdit && lead.status !== "converted" && (
              <Button type="button" onClick={() => navigate(`${MODULE_BASE}/leads/edit/${leadId}`)}>
                Edit lead
              </Button>
            )}
          </FormActions>
        </div>
      </FormPageLayout>
    </div>
  );
}
