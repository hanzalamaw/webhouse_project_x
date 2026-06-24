const TONE_MAP = {
  active: "success",
  resolved: "success",
  paid: "success",
  enabled: "success",
  online: "success",
  pending: "warning",
  suspended: "warning",
  overdue: "warning",
  inactive: "neutral",
  cancelled: "danger",
  expired: "danger",
  open: "accent",
  offline: "neutral",
};

export function Badge({ children, tone = "neutral" }) {
  return <span className={`wh-badge wh-badge--${tone}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  if (status == null || status === "") return <span className="wh-badge wh-badge--neutral">—</span>;
  const key = String(status).toLowerCase().trim();
  const tone = TONE_MAP[key] || "neutral";
  return <span className={`wh-badge wh-badge--${tone}`}>{status}</span>;
}
