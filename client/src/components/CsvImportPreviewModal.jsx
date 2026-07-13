import { useMemo } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

const PREVIEW_LIMIT = 50;

export function CsvImportPreviewModal({
  open,
  onClose,
  onConfirm,
  rows = [],
  columns,
  title = "Import preview",
  loading = false,
}) {
  const previewColumns = useMemo(() => {
    if (columns?.length) return columns;
    if (!rows.length) return [];
    return Object.keys(rows[0]).slice(0, 8);
  }, [columns, rows]);

  const previewRows = rows.slice(0, PREVIEW_LIMIT);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      className="wh-modal--transaction wh-modal--transaction-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button modalPrimary onClick={onConfirm} disabled={loading || !rows.length}>
            {loading ? "Importing…" : `Continue import (${rows.length} row${rows.length === 1 ? "" : "s"})`}
          </Button>
        </>
      }
    >
      <p className="wh-modal__text">
        {rows.length === 0
          ? "No data rows were detected in this file."
          : `${rows.length} row${rows.length === 1 ? "" : "s"} detected${rows.length > PREVIEW_LIMIT ? ` — showing first ${PREVIEW_LIMIT}` : ""}. Review before continuing.`}
      </p>
      {previewRows.length > 0 && (
        <div className="wh-tx-payments-wrap" style={{ maxHeight: 360, overflow: "auto" }}>
          <table className="wh-tx-payments-table">
            <thead>
              <tr>
                <th>#</th>
                {previewColumns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {previewColumns.map((col) => (
                    <td key={col}>{row[col] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
