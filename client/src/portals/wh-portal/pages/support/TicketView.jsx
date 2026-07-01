import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch } from "../../../../api/client";
import { PageHeader } from "../../../../components/PageHeader";
import { Button } from "../../../../components/Button";
import { StatusBadge } from "../../../../components/Badge";
import { FormPageLayout } from "../../../../components/FormPageLayout";
import { DetailGrid, DetailValue, RecordViewSummary } from "../../../../components/RecordView";
import { formatDateTime } from "../../../../utils/dateTime";

export default function TicketView() {
  const { ticketId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTicket(await apiFetch(`/support-tickets/${ticketId}`, {}, authFetch));
    } catch (e) {
      setTicket(null);
      setError(e.message || "Ticket not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, ticketId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return <div className="wh-page"><FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout></div>;
  }

  if (!ticket) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Ticket not found"}</div>
          <Button variant="secondary" onClick={() => navigate("/webhouse-portal/support/manage")}>Back</Button>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Support ticket"
          actions={
            <>
              <Button variant="secondary" onClick={() => navigate("/webhouse-portal/support/manage")}>Back</Button>
              <Button onClick={() => navigate(`/webhouse-portal/support/edit/${ticketId}`)}>Edit ticket</Button>
            </>
          }
        />
        <RecordViewSummary title={ticket.subject} subtitle={ticket.company_name} status={ticket.status} />
        <DetailGrid>
          <DetailValue label="Tenant">{ticket.company_name || "—"}</DetailValue>
          <DetailValue label="Status"><StatusBadge status={ticket.status} /></DetailValue>
          <DetailValue label="Created">{formatDateTime(ticket.created_at)}</DetailValue>
          <DetailValue label="Description" fullWidth multiline>{ticket.description || "—"}</DetailValue>
        </DetailGrid>
      </FormPageLayout>
    </div>
  );
}
