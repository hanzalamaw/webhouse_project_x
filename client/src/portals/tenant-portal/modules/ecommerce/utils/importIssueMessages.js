/**
 * Plain-language import skip/fail copy: always explain why + how to fix (ERP and/or store).
 */

export function formatImportIssue({ why, fixInErp = "", fixInStore = "" } = {}) {
  const whyText = String(why || "This record could not be imported.").trim();
  const parts = [];
  if (fixInErp) parts.push(`In ERP: ${fixInErp}`);
  if (fixInStore) parts.push(`In store: ${fixInStore}`);
  const fixText = parts.length
    ? parts.join(" · ")
    : "Review the record in your ERP and in the store, then sync again.";
  return {
    why: whyText,
    fix: fixText,
    reason: `Why: ${whyText} How to fix: ${fixText}`,
  };
}

/** Parse a stored sync-log / skip message back into why + fix for the UI. */
export function parseImportIssueMessage(message) {
  const raw = String(message || "").trim();
  if (!raw) return { why: "No details available", fix: "" };
  const match = raw.match(/^Why:\s*([\s\S]*?)\s*How to fix:\s*([\s\S]+)$/i);
  if (match) {
    return { why: match[1].trim(), fix: match[2].trim() };
  }
  return { why: raw, fix: "" };
}
