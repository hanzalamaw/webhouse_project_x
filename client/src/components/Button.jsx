export function Button({
  children,
  type = "button",
  variant = "primary",
  className = "",
  ...rest
}) {
  return (
    <button type={type} className={`wh-btn wh-btn--${variant} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
