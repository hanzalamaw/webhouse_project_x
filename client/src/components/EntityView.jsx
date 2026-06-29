import { StatusBadge } from "./Badge";
import { LogsIcon, SupportIcon, TenantsIcon, SubscriptionIcon, ProductIcon } from "./icons";

const CONTACT_ICONS = {
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  location: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  since: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

function StatCard({ label, value, hint, hintTone, tone = "default", icon, valueVariant }) {
  const valueClass = [
    "wh-entity-profile__stat-value",
    valueVariant === "date" ? "wh-entity-profile__stat-value--date" : "",
  ].filter(Boolean).join(" ");

  const hintClass = [
    "wh-entity-profile__stat-hint",
    hintTone ? `wh-entity-profile__stat-hint--${hintTone}` : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={`wh-entity-profile__stat wh-entity-profile__stat--${tone}`}>
      <div className="wh-entity-profile__stat-head">
        {icon && <span className="wh-entity-profile__stat-icon">{icon}</span>}
        <span className="wh-entity-profile__stat-label">{label}</span>
      </div>
      <span className={valueClass}>{value}</span>
      {hint && <span className={hintClass}>{hint}</span>}
    </div>
  );
}

export function ProfileHero({
  name,
  subtitle,
  status,
  contact = [],
  highlights = [],
  kpis = [],
  className = "",
  variant = "stacked",
}) {
  const isSplit = variant === "split";
  const hasMetrics = highlights.length > 0 || kpis.length > 0;
  const rootClass = [
    "wh-entity-profile",
    className,
    isSplit ? "wh-entity-profile--split" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <div className="wh-entity-profile__accent" aria-hidden />
      <div className="wh-entity-profile__inner">
        {isSplit ? (
          <div className="wh-entity-profile__lead">
            <div className="wh-entity-profile__identity">
              <div className="wh-entity-profile__title-row">
                <h2 className="wh-entity-profile__name">{name}</h2>
                {status && <StatusBadge status={status} />}
              </div>
              {subtitle && <p className="wh-entity-profile__subtitle">{subtitle}</p>}
            </div>
            {contact.length > 0 && (
              <div className="wh-entity-profile__contact wh-entity-profile__contact--inline">
                {contact.map((item) => (
                  <div key={item.label} className="wh-entity-profile__contact-item" title={item.label}>
                    <span className="wh-entity-profile__contact-icon">
                      {CONTACT_ICONS[item.icon] || CONTACT_ICONS.user}
                    </span>
                    <span className="wh-entity-profile__contact-value">{item.value || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="wh-entity-profile__aside">
            <div className="wh-entity-profile__title-row">
              <h2 className="wh-entity-profile__name">{name}</h2>
              {status && <StatusBadge status={status} />}
            </div>
            {subtitle && <p className="wh-entity-profile__subtitle">{subtitle}</p>}
            {contact.length > 0 && (
              <div className="wh-entity-profile__contact">
                {contact.map((item) => (
                  <div key={item.label} className="wh-entity-profile__contact-item">
                    <span className="wh-entity-profile__contact-icon">
                      {CONTACT_ICONS[item.icon] || CONTACT_ICONS.user}
                    </span>
                    <div>
                      <span className="wh-entity-profile__contact-label">{item.label}</span>
                      <span className="wh-entity-profile__contact-value">{item.value || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {hasMetrics && (
          <div className="wh-entity-profile__metrics">
            {highlights.map((h) => (
              <StatCard key={h.label} label={h.label} value={h.value} hint={h.hint} tone={h.tone} icon={h.icon} />
            ))}
            {kpis.map((kpi) => (
              <StatCard key={kpi.label} {...kpi} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EntityKpi({ label, value, hint, tone = "default", icon }) {
  return (
    <div className={`wh-kpi wh-kpi--${tone}`}>
      <div className="wh-kpi__top">
        <span className="wh-kpi__label">{label}</span>
        {icon && <span className="wh-kpi__icon">{icon}</span>}
      </div>
      <span className="wh-kpi__value">{value}</span>
      {hint && <span className="wh-kpi__hint">{hint}</span>}
    </div>
  );
}

export function EntityPanel({ title, subtitle, action, flush, children }) {
  return (
    <div className="wh-panel wh-entity-panel">
      <div className="wh-panel__head">
        <div>
          <h3 className="wh-panel__title">{title}</h3>
          {subtitle && <p className="wh-panel__subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={`wh-panel__body${flush ? " wh-panel__body--flush" : ""}`}>{children}</div>
    </div>
  );
}

export function EntityDetailGrid({ rows }) {
  return (
    <div className="wh-entity-detail-grid">
      {rows.map((row) => (
        <div key={row.label} className="wh-entity-detail-grid__item">
          <span className="wh-entity-detail-grid__label">{row.label}</span>
          <span className="wh-entity-detail-grid__value">{row.value ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

export function ActivityTimeline({ items, emptyText = "No activity recorded yet." }) {
  if (!items?.length) {
    return <p className="wh-panel__empty">{emptyText}</p>;
  }
  return (
    <ul className="wh-activity-timeline">
      {items.map((item) => (
        <li key={item.id} className="wh-activity-timeline__item">
          <span className="wh-activity-timeline__dot" aria-hidden />
          <div className="wh-activity-timeline__body">
            <p className="wh-activity-timeline__title">{item.summary}</p>
            <p className="wh-activity-timeline__meta">
              {[item.action, item.user_name, item.created_at].filter(Boolean).join(" · ")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export const SinceIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export { LogsIcon, SupportIcon, TenantsIcon, SubscriptionIcon, ProductIcon };
