import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

export function FormField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  hintTone,
  autoComplete,
  as: Component = "input",
  children,
  displayOnly = false,
  suppressErrorMessage = false,
  revealable,
  ...rest
}) {
  const [revealed, setRevealed] = useState(false);
  const inputClass = displayOnly
    ? "wh-field__input wh-field__input--display"
    : `wh-field__input${rest.readOnly ? " wh-field__input--readonly" : ""}`;

  const showReveal = (revealable ?? type === "password") && type === "password" && !displayOnly && !children;
  const inputType = showReveal && revealed ? "text" : type;

  return (
    <div className={`wh-field${error ? " wh-field--error" : ""}`}>
      {label && (
        <label className="wh-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      {displayOnly ? (
        <div id={id} className={inputClass} aria-readonly="true">
          {value ?? ""}
        </div>
      ) : Component === "select" ? (
        <select
          id={id}
          className={`wh-field__input${rest.readOnly ? " wh-field__input--readonly" : ""}`}
          value={value}
          onChange={onChange}
          {...rest}
        >
          {children}
        </select>
      ) : children ? (
        <div id={id} className="wh-field__control">
          {children}
        </div>
      ) : Component === "textarea" ? (
        <textarea
          id={id}
          className={`wh-field__input wh-field__textarea${rest.readOnly ? " wh-field__input--readonly" : ""}`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          {...rest}
        />
      ) : showReveal ? (
        <div className="wh-field__password-wrap">
          <input
            id={id}
            type={inputType}
            className={`${inputClass} wh-field__input--with-reveal`}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            autoComplete={autoComplete ?? "off"}
            {...rest}
          />
          <button
            type="button"
            className="wh-field__reveal"
            onClick={() => setRevealed((v) => !v)}
            title={revealed ? "Hide password" : "Show password"}
            aria-label={revealed ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      ) : (
        <input
          id={id}
          type={type}
          className={inputClass}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete ?? "off"}
          {...rest}
        />
      )}
      {hint && !error && (
        <span className={`wh-field__hint${hintTone ? ` wh-field__hint--${hintTone}` : ""}`}>{hint}</span>
      )}
      {error && !suppressErrorMessage && <span className="wh-field__error">{error}</span>}
    </div>
  );
}
