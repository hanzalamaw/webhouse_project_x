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
import { MODULE_BASE, ISSUE_TYPE_LABELS } from "../../constants";

function formatPriority(priority) {
  if (!priority) return "—";
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export default function ComplaintView() {
  const { complaintId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("crm");
  const navigate = useNavigate();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setComplaint(await apiFetch(`/crm/complaints/${complaintId}`, {}, authFetch));
    } catch (e) {
      setComplaint(null);
      setError(e.message || "Complaint not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, complaintId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Complaint not found"}</div>
          <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/complaints/manage`)}>Back to complaints</Button>
        </FormPageLayout>
      </div>
    );
  }

  const typeLabel = ISSUE_TYPE_LABELS[complaint.issue_type] || complaint.issue_type;

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Complaint details"
          description="Read-only view of this complaint record."
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/complaints/manage`)}>All complaints</Button>
              {canEdit && (
                <Button onClick={() => navigate(`${MODULE_BASE}/complaints/edit/${complaintId}`)}>Edit complaint</Button>
              )}
            </div>
          }
        />

        <div className="wh-form-stack">
          <RecordViewSummary
            title={complaint.subject}
            subtitle={complaint.customer_name ? `Customer: ${complaint.customer_name}` : undefined}
            status={complaint.status}
            chips={[
              { label: "Type", value: typeLabel },
              { label: "Priority", value: formatPriority(complaint.priority) },
              { label: "Reported", value: formatDateTime(complaint.created_at) },
            ]}
          />

          <FormBlock title="Record summary" description="Context for who reported this and when.">
            <DetailGrid>
              <DetailValue label="Customer" highlight>
                {complaint.customer_id ? (
                  <Link to={`${MODULE_BASE}/customers/${complaint.customer_id}`}>{complaint.customer_name}</Link>
                ) : (
                  complaint.customer_name
                )}
              </DetailValue>
              <DetailValue label="Reported by">{complaint.created_by_name}</DetailValue>
              <DetailValue label="Created">{formatDateTime(complaint.created_at)}</DetailValue>
              <DetailValue label="Last updated">{formatDateTime(complaint.updated_at)}</DetailValue>
            </DetailGrid>
          </FormBlock>

          <FormBlock title="Complaint details" description="Issue description, status, and assignment.">
            <DetailGrid>
              <DetailValue label="Type">{typeLabel}</DetailValue>
              <DetailValue label="Priority">{formatPriority(complaint.priority)}</DetailValue>
              <DetailValue label="Status">
                <StatusBadge status={complaint.status} />
              </DetailValue>
              <DetailValue label="Assigned to">{complaint.assigned_to_name}</DetailValue>
              <DetailValue label="Subject" fullWidth highlight>{complaint.subject}</DetailValue>
              <DetailValue label="Description" fullWidth multiline>{complaint.description}</DetailValue>
            </DetailGrid>
          </FormBlock>

          {(complaint.resolution_note || complaint.resolved_at) && (
            <FormBlock title="Resolution" description="How this complaint was closed or handled.">
              <DetailGrid>
                {complaint.resolved_at && (
                  <DetailValue label="Resolved">{formatDateTime(complaint.resolved_at)}</DetailValue>
                )}
                {complaint.resolution_note && (
                  <DetailValue label="Resolution note" fullWidth multiline>{complaint.resolution_note}</DetailValue>
                )}
              </DetailGrid>
            </FormBlock>
          )}

          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/complaints/manage`)}>
              Back to complaints
            </Button>
            {canEdit && (
              <Button type="button" onClick={() => navigate(`${MODULE_BASE}/complaints/edit/${complaintId}`)}>
                Edit complaint
              </Button>
            )}
          </FormActions>
        </div>
      </FormPageLayout>
    </div>
  );
}
