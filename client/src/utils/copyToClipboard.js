export async function copyToClipboard(text) {
  const value = String(text ?? "");
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function buildCopyBlock(rows) {
  return rows
    .filter((row) => row.value != null && row.value !== "" && row.value !== "—")
    .map((row) => `${row.label}: ${row.copyValue ?? row.value}`)
    .join("\n");
}
