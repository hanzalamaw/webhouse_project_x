import { useState, useEffect } from "react";
import { Button } from "./Button";

export function StepWizard({
  steps,
  currentStep,
  onStepChange,
  onSubmit,
  onValidateStep,
  stepError,
  submitLabel = "Submit",
  loading = false,
}) {
  const handleContinue = () => {
    if (onValidateStep) {
      const err = onValidateStep(currentStep);
      if (err) return;
    }
    onStepChange(currentStep + 1);
  };

  return (
    <div className="wh-wizard">
      <ol className="wh-wizard__steps">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={`wh-wizard__step${i === currentStep ? " active" : ""}${i < currentStep ? " done" : ""}`}
          >
            <button type="button" onClick={() => i < currentStep && onStepChange(i)} disabled={i > currentStep}>
              <span className="wh-wizard__num">{i + 1}</span>
              <span className="wh-wizard__label">{step.label}</span>
            </button>
          </li>
        ))}
      </ol>
      {stepError && <p className="wh-field__error wh-wizard__error">{stepError}</p>}
      <div className="wh-wizard__body">{steps[currentStep]?.content}</div>
      <div className="wh-wizard__nav">
        <Button type="button" variant="secondary" disabled={currentStep === 0} onClick={() => onStepChange(currentStep - 1)}>
          Back
        </Button>
        {currentStep < steps.length - 1 ? (
          <Button type="button" onClick={handleContinue}>
            Continue
          </Button>
        ) : (
          <Button type="button" onClick={onSubmit} disabled={loading}>
            {loading ? "Saving…" : submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function useWizardDraft(storageKey, initialState) {
  const [draft, setDraft] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return { ...initialState, ...JSON.parse(saved) };
    } catch {
      /* ignore */
    }
    return initialState;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft, storageKey]);

  const clearDraft = () => {
    localStorage.removeItem(storageKey);
    setDraft(initialState);
  };

  return [draft, setDraft, clearDraft];
}
