export function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((t) => (typeof t === "string" ? t : t?.tag_name))
      .map((t) => String(t || "").trim())
      .filter(Boolean);
  }
  return String(value)
    .split(/[,|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function serializeTags(tags) {
  return [...new Set(parseTags(tags))].join(", ");
}

export function tagsToObjects(value) {
  return parseTags(value).map((tag_name) => ({ tag_name }));
}
