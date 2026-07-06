import { formatPKR } from "./currency";

/**
 * Live feedback while entering a payment amount against a balance.
 * @returns {{ type: 'success'|'warning'|'error', message: string } | null}
 */
export function getPaymentAmountFeedback({ amount, maxAllowed, totalAfter, totalTarget }) {
  const amt = Number(amount) || 0;
  const max = Number(maxAllowed) || 0;
  const after = Number(totalAfter) || 0;
  const target = Number(totalTarget) || 0;

  if (max <= 0.001 && amt > 0) {
    return { type: "warning", message: "This balance is already fully paid." };
  }
  if (amt > max + 0.001) {
    return { type: "error", message: `Amount cannot exceed ${formatPKR(max)} remaining.` };
  }
  if (target > 0 && after > target + 0.001) {
    return { type: "error", message: "This amount would overpay the balance." };
  }
  if (target > 0 && amt > 0 && after >= target - 0.001) {
    return { type: "success", message: "This payment will fully settle the balance." };
  }
  return null;
}
