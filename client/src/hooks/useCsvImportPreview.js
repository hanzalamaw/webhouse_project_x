import { useState, useCallback } from "react";

/** Stage parsed CSV rows behind a preview modal before calling the import API. */
export function useCsvImportPreview() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importFn, setImportFn] = useState(null);

  const stage = useCallback((parsedRows, onImport) => {
    setRows(parsedRows);
    setImportFn(() => onImport);
    setOpen(true);
  }, []);

  const cancel = useCallback(() => {
    if (importing) return;
    setOpen(false);
    setRows([]);
    setImportFn(null);
  }, [importing]);

  const confirm = useCallback(async () => {
    if (!importFn || !rows.length) return;
    setImporting(true);
    try {
      await importFn(rows);
      setOpen(false);
      setRows([]);
      setImportFn(null);
    } finally {
      setImporting(false);
    }
  }, [importFn, rows]);

  return { open, rows, importing, stage, cancel, confirm };
}
