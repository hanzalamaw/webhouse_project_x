export function Button({
  children,
  type = "button",
  variant = "primary",
  className = "",
  modalPrimary = false,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`wh-btn wh-btn--${variant} ${className}`.trim()}
      data-modal-primary={modalPrimary ? "" : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
