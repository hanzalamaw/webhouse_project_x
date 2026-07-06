import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormPageLayout } from "../../../../../components/FormPageLayout";
import { FormBlock } from "../../../../../components/FormBlock";
import { Button } from "../../../../../components/Button";
import { RecordViewSummary, DetailGrid, DetailValue } from "../../../../../components/RecordView";
import { formatPKR } from "../../../../../utils/currency";
import { formatDate } from "../../../../../utils/dateTime";
import { MODULE_BASE, PAYMENT_METHOD_LABELS, labelFor } from "../constants";

export default function ViewExpense() {
  const { expenseId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("finance");
  const navigate = useNavigate();
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setExpense(await apiFetch(`/finance/expenses/${expenseId}`, {}, authFetch));
    } catch (e) {
      setExpense(null);
      setError(e.message || "Expense not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, expenseId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Expense not found"}</div>
          <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/expenses`)}>Back</Button>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Expense"
          description="Operational expense record."
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/expenses`)}>All expenses</Button>
              {canEdit && <Button onClick={() => navigate(`${MODULE_BASE}/expenses/edit/${expenseId}`)}>Edit</Button>}
            </div>
          }
        />

        <div className="wh-form-stack">
          <RecordViewSummary
            title={expense.expense_title}
            subtitle={[expense.category_name, expense.sub_category_name].filter(Boolean).join(" · ")}
            chips={[
              { label: "Amount", value: formatPKR(expense.amount) },
              { label: "Date", value: formatDate(expense.expense_date) },
            ]}
          />

          <FormBlock title="Expense details">
            <DetailGrid>
              <DetailValue label="Title" highlight>{expense.expense_title}</DetailValue>
              <DetailValue label="Amount" highlight>{formatPKR(expense.amount)}</DetailValue>
              <DetailValue label="Date">{formatDate(expense.expense_date)}</DetailValue>
              <DetailValue label="Category">{expense.category_name}</DetailValue>
              <DetailValue label="Sub-category">{expense.sub_category_name || "—"}</DetailValue>
              <DetailValue label="Payment method">{labelFor(PAYMENT_METHOD_LABELS, expense.payment_method)}</DetailValue>
              <DetailValue label="Notes" fullWidth multiline>{expense.notes || "—"}</DetailValue>
            </DetailGrid>
          </FormBlock>
        </div>
      </FormPageLayout>
    </div>
  );
}
