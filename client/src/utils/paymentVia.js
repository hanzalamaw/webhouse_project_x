/** Encode payment destination for a single "Payment via" select (cash or bank account). */

export function encodePaymentVia({ payment_method, bank_account_id }) {
  if (payment_method === "bank_transfer" && bank_account_id) {
    return `bank:${bank_account_id}`;
  }
  return "cash";
}

export function parsePaymentVia(value) {
  if (!value || value === "cash") {
    return { payment_method: "cash", bank_account_id: null };
  }
  if (String(value).startsWith("bank:")) {
    const id = Number(String(value).slice(5));
    return {
      payment_method: "bank_transfer",
      bank_account_id: Number.isFinite(id) && id > 0 ? id : null,
    };
  }
  return { payment_method: value, bank_account_id: null };
}

export function formatBankAccountLabel(account) {
  return `${account.bank_name} — ${account.account_title} (${account.account_number})`;
}
