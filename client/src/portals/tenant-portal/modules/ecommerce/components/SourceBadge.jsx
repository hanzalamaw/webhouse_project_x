const SOURCE_LABELS = {
  manual: "Manual",
  shopify: "Shopify",
  daraz: "Daraz",
};

const SOURCE_TONES = {
  manual: "default",
  shopify: "accent",
  daraz: "warning",
};

export function formatDataSource(source) {
  return SOURCE_LABELS[source] || source || "Manual";
}

export function SourceBadge({ source }) {
  const value = source || "manual";
  const tone = SOURCE_TONES[value] || "default";
  return (
    <span className={`wh-badge wh-badge--${tone}`} title={`Added via ${formatDataSource(value)}`}>
      {formatDataSource(value)}
    </span>
  );
}
