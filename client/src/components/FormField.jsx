export function FormField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  autoComplete,
  as: Component = "input",
  children,
  displayOnly = false,
  ...rest
}) {
  const inputClass = displayOnly
    ? "wh-field__input wh-field__input--display"
    : `wh-field__input${rest.readOnly ? " wh-field__input--readonly" : ""}`;

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
      ) : Component === "textarea" ? (
        <textarea
          id={id}
          className={`wh-field__input wh-field__textarea${rest.readOnly ? " wh-field__input--readonly" : ""}`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          {...rest}
        />
      ) : (
        <input
          id={id}
          type={type}
          className={`wh-field__input${rest.readOnly ? " wh-field__input--readonly" : ""}`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete ?? "off"}
          {...rest}
        />
      )}
      {error && <span className="wh-field__error">{error}</span>}
    </div>
  );
}
