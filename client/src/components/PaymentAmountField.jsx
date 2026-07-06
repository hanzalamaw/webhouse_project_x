import { FormField } from "./FormField";
import { getPaymentAmountFeedback } from "../utils/paymentAmountFeedback";

export function PaymentAmountField({
  amount,
  maxAllowed,
  totalAfter,
  totalTarget,
  showZeroHint = false,
  inlineFeedback = true,
  ...fieldProps
}) {
  const amt = Number(amount) || 0;
  const feedback = getPaymentAmountFeedback({ amount: amt, maxAllowed, totalAfter, totalTarget });

  let error;
  let hint;
  let hintTone;

  if (showZeroHint && String(fieldProps.value ?? "").trim() !== "" && amt <= 0) {
    error = "Enter a payment amount.";
  } else if (feedback?.type === "error" || feedback?.type === "warning") {
    error = feedback.message;
  } else if (feedback?.type === "success") {
    hint = feedback.message;
    hintTone = "success";
  }

  return (
    <FormField
      {...fieldProps}
      type="number"
      step="0.01"
      min="0"
      error={error}
      hint={inlineFeedback ? hint : undefined}
      hintTone={hintTone}
      suppressErrorMessage={!inlineFeedback}
    />
  );
}
