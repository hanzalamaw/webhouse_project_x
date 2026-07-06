import { useEffect, useState } from "react";
import { fetchAllTableRows } from "../api/client";
import { FormField } from "./FormField";

export function BankAccountSelect({
  authFetch,
  id = "bank_account_id",
  label = "Bank account",
  value,
  onChange,
  disabled = false,
  required = false,
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
    return <p className="wh-muted">Loading bank accounts…</p>;
  }

  if (!accounts.length) {
    return (
      <p className="wh-muted">
        No bank accounts found. Add one under Finance → Bank Accounts.
      </p>
    );
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
    >
      <option value="">Select account…</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.bank_name} — {a.account_title} ({a.account_number})
        </option>
      ))}
    </FormField>
  );
}
