import { useEffect, useState } from "react";
import { fetchAllTableRows } from "../api/client";
import { FormField } from "./FormField";
import { encodePaymentVia, formatBankAccountLabel } from "../utils/paymentVia";

export function PaymentViaSelect({
  authFetch,
  id = "payment_via",
  label = "Payment via",
  value,
  onChange,
  disabled = false,
  required = false,
  error,
}) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchAllTableRows("/finance/bank-accounts", authFetch)
      .then((rows) => active && setAccounts(rows || []))
      .catch(() => active && setAccounts([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [authFetch]);

  if (loading) {
    return <p className="wh-muted wh-field__loading">Loading accounts…</p>;
  }

  return (
    <FormField
      id={id}
      label={label}
      as="select"
      value={value}
      onChange={onChange}
      disabled={disabled}
      required={required}
      error={error}
    >
      <option value="cash">Cash</option>
      {accounts.map((a) => (
        <option key={a.id} value={encodePaymentVia({ payment_method: "bank_transfer", bank_account_id: a.id })}>
          {formatBankAccountLabel(a)}
        </option>
      ))}
      {!accounts.length && (
        <option value="" disabled>Add bank accounts under Finance → Bank Accounts</option>
      )}
    </FormField>
  );
}
