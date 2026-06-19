export function Card({ children, className = "" }) {
  return <div className={`wh-card ${className}`.trim()}>{children}</div>;
}
