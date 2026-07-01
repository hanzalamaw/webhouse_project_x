import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { CopyIcon, EyeIcon, EyeOffIcon } from "./icons";
import { copyToClipboard, buildCopyBlock } from "../utils/copyToClipboard";

const MASK = "••••••••";

function DetailRow({ label, value, copyValue, sensitive, onCopied }) {
  const [visible, setVisible] = useState(false);
  const raw = value == null || value === "" ? "—" : String(value);
  const canCopy = raw !== "—";
  const isSecret = sensitive && raw !== "—";
  const display = isSecret && !visible ? MASK : raw;
  const textToCopy = copyValue ?? raw;

  const handleCopy = async () => {
    const ok = await copyToClipboard(`Do not share these credentials with anyone.\n\n${label}: ${textToCopy}`);
    if (ok) onCopied(label);
  };

  return (
    <div className="wh-account-detail-row">
      <span className="wh-account-detail-row__label">{label}</span>
      <div className="wh-account-detail-row__value-wrap">
        <span className="wh-account-detail-row__value">{display}</span>
        {isSecret && (
          <button
            type="button"
            className="wh-account-detail-row__copy"
            onClick={() => setVisible((v) => !v)}
            title={visible ? "Hide password" : "Show password"}
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
        {canCopy && (
          <button
            type="button"
            className="wh-account-detail-row__copy"
            onClick={handleCopy}
            title={`Copy ${label}`}
            aria-label={`Copy ${label}`}
          >
            <CopyIcon />
          </button>
        )}
      </div>
    </div>
  );
}

export function AccountDetailsModal({
  open,
  onClose,
  title,
  sections = [],
  loading = false,
  error = "",
  footer,
}) {
  const [copiedLabel, setCopiedLabel] = useState("");

  const handleCopyAll = async () => {
    const rows = sections.flatMap((section) => section.rows || []);
    const warning = "Do not share these credentials with anyone.";
    const ok = await copyToClipboard(`${warning}\n\n${buildCopyBlock(rows)}`);
    if (ok) setCopiedLabel("All credentials");
  };

  const handleCopied = (label) => {
    setCopiedLabel(label);
    window.setTimeout(() => setCopiedLabel(""), 2000);
  };

  const allRows = sections.flatMap((section) => section.rows || []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      wide={sections.length > 1}
      footer={
        footer ?? (
          <>
            {copiedLabel ? (
              <span className="wh-account-detail-copied">Copied {copiedLabel}</span>
            ) : (
              <span />
            )}
            <div className="wh-account-detail-footer-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCopyAll}
                disabled={loading || !!error || allRows.length === 0}
              >
                Copy all
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )
      }
    >
      {loading && <p className="wh-muted">Loading…</p>}
      {!loading && error && <div className="wh-alert wh-alert--error">{error}</div>}
      {!loading && !error && (
        <>
        <div className="wh-alert wh-alert--warning wh-account-detail-warning">
          Do not share these credentials with anyone.
        </div>
        <div className="wh-account-detail-sections">
          {sections.map((section) => (
            <div key={section.title || "default"} className="wh-account-detail-section">
              {section.title ? <h4 className="wh-account-detail-section__title">{section.title}</h4> : null}
              <div className="wh-account-detail-rows">
                {(section.rows || []).map((row) => (
                  <DetailRow key={`${section.title}-${row.label}`} {...row} onCopied={handleCopied} />
                ))}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </Modal>
  );
}
