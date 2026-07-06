import { getPaymentAmountFeedback } from "../utils/paymentAmountFeedback";

export function PaymentAmountFeedback({
  amount,
  maxAllowed,
  totalAfter,
  totalTarget,
  showZeroHint = false,
  value,
  className = "",
}) {
  const amt = Number(amount) || 0;
  if (showZeroHint && String(value ?? "").trim() !== "" && amt <= 0) {
    return (
      <p className={`wh-tx-payment-feedback wh-alert wh-alert--error${className ? ` ${className}` : ""}`}>
        Enter a payment amount.
      </p>
    );
  }

  const feedback = getPaymentAmountFeedback({ amount: amt, maxAllowed, totalAfter, totalTarget });
  if (!feedback) return null;

  const cls =
    feedback.type === "success"
      ? "wh-alert wh-alert--success"
      : feedback.type === "warning"
        ? "wh-alert wh-alert--warning"
        : "wh-alert wh-alert--error";

  return (
    <p className={`wh-tx-payment-feedback ${cls}${className ? ` ${className}` : ""}`}>
      {feedback.message}
    </p>
  );
}
