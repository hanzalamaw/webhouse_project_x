import { useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { parseCsv, downloadCsv } from "../utils/csv";

export default function OrderImportExport() {
  const { authFetch } = useAuth();
  const { canCreate, canExport } = useModulePermission("order-management");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await apiFetch("/orders/export", {}, authFetch);
      downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, res.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const res = await apiFetch("/orders/import", { method: "POST", body: JSON.stringify({ rows }) }, authFetch);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const downloadTemplate = () => {
    downloadCsv("orders-import-template.csv", [{
      order_no: "",
      customer_name: "Sample Customer",
      order_source: "csv_import",
      order_status: "pending",
      payment_status: "unpaid",
      fulfillment_status: "unfulfilled",
      product_name: "Sample Product",
      sku: "SKU-001",
      quantity: "1",
      unit_price: "1000",
      item_discount: "0",
      item_total: "1000",
      discount_amount: "0",
      delivery_charges: "100",
      payable_amount: "1100",
      city: "Karachi",
      delivery_address: "123 Main St",
      payment_method: "cod",
      notes: "",
    }]);
  };

  return (
    <div className="wh-page wh-inv-import-export">
      <PageHeader title="Order Import / Export" description="Import orders from CSV or export filtered order records." />

      <div className="wh-inv-import-export__grid">
        <Card>
          <h3 className="wh-card__title">Export orders</h3>
          <p className="wh-card__text">
            Download all orders with status, customer, payment, fulfillment, and amount details as CSV.
          </p>
          <div className="wh-card__actions">
            <Button onClick={handleExport} disabled={exporting || !canExport}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
        </Card>

        <Card>
          <h3 className="wh-card__title">Import orders</h3>
          <p className="wh-card__text">
            Upload a CSV file. Required: product_name, sku. Optional: order_no, customer_name, statuses, amounts, city, delivery_address.
          </p>
          <div className="wh-card__actions">
            <Button variant="secondary" onClick={downloadTemplate}>Download template</Button>
            <label className="wh-btn wh-btn--primary" style={{ cursor: canCreate ? "pointer" : "not-allowed" }}>
              {importing ? "Importing…" : "Choose CSV file"}
              <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={importing || !canCreate} style={{ display: "none" }} />
            </label>
          </div>
        </Card>
      </div>

      {error && <p className="wh-field__error wh-inv-import-export__error">{error}</p>}
      {result && (
        <Card className="wh-inv-import-export__results">
          <h3 className="wh-card__title">Import results</h3>
          <p className="wh-card__text">Created: {result.created} · Skipped: {result.skipped}</p>
          {result.errors?.length > 0 && (
            <ul className="wh-list">
              {result.errors.map((err, i) => (
                <li key={i}>Row {err.row}: {err.message}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
