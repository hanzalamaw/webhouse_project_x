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
import { MODULE_BASE } from "../constants";

export default function ViewBankAccount() {
  const { accountId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("finance");
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAccount(await apiFetch(`/finance/bank-accounts/${accountId}`, {}, authFetch));
    } catch (e) {
      setAccount(null);
      setError(e.message || "Account not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, accountId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Account not found"}</div>
          <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/bank-accounts`)}>Back</Button>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Bank account"
          description="Company bank account or cash balance."
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/bank-accounts`)}>All accounts</Button>
              {canEdit && <Button onClick={() => navigate(`${MODULE_BASE}/bank-accounts/edit/${accountId}`)}>Edit</Button>}
            </div>
          }
        />

        <div className="wh-form-stack">
          <RecordViewSummary
            title={account.bank_name}
            subtitle={account.account_title}
            status={account.status}
            chips={[
              { label: "Balance", value: formatPKR(account.current_balance) },
              { label: "Account #", value: account.account_number || "—" },
            ]}
          />

          <FormBlock title="Account details">
            <DetailGrid>
              <DetailValue label="Bank" highlight>{account.bank_name}</DetailValue>
              <DetailValue label="Account title">{account.account_title}</DetailValue>
              <DetailValue label="Account number">{account.account_number}</DetailValue>
              <DetailValue label="Current balance" highlight>{formatPKR(account.current_balance)}</DetailValue>
              <DetailValue label="Status"><StatusBadge status={account.status} /></DetailValue>
            </DetailGrid>
          </FormBlock>
        </div>
      </FormPageLayout>
    </div>
  );
}
