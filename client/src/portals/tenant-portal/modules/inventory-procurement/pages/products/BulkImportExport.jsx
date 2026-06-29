import { useState } from "react";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { Button } from "../../../../../../components/Button";

const CSV_HEADERS = [
  "product_name",
  "sku",
  "unit",
  "cost_price",
  "selling_price",
  "delivery_charges",
  "discount",
  "tax",
  "status",
  "category_name",
  "warehouse_id",
  "initial_qty",
  "reserved_qty",
  "damaged_qty",
  "stock_notes",
];

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.match(/("([^"]|"")*"|[^,]*)/g)?.map((v) => v.trim().replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function toCsv(rows) {
  const header = CSV_HEADERS.join(",");
  const body = rows.map((r) =>
    CSV_HEADERS.map((h) => {
      const v = r[h] ?? "";
      return String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : v;
    }).join(",")
  );
  return [header, ...body].join("\n");
}

export default function BulkImportExport() {
  const { authFetch } = useAuth();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await apiFetch("/inventory/products/export", {}, authFetch);
      const csv = toCsv(res.data || []);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory-products-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
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
      const res = await apiFetch("/inventory/products/import", { method: "POST", body: JSON.stringify({ rows }) }, authFetch);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const downloadTemplate = () => {
    const sample = [{
      product_name: "Sample Product",
      sku: "SKU-001",
      unit: "piece",
      cost_price: "100",
      selling_price: "150",
      delivery_charges: "20",
      discount: "10",
      tax: "5",
      status: "active",
      category_name: "Electronics",
      warehouse_id: "1",
      initial_qty: "10",
      reserved_qty: "0",
      damaged_qty: "0",
      stock_notes: "Initial import",
    }];
    const blob = new Blob([toCsv(sample)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="wh-page wh-inv-import-export">
      <PageHeader title="Bulk Import / Export" description="Export your product catalog or import products from CSV." />

      <div className="wh-inv-import-export__grid">
        <Card>
          <h3 className="wh-card__title">Export products</h3>
          <p className="wh-card__text">
            Download all products with pricing (cost, selling, delivery, discount, tax), stock totals, and category/warehouse details as CSV.
          </p>
          <div className="wh-card__actions">
            <Button onClick={handleExport} disabled={exporting}>{exporting ? "Exporting…" : "Export CSV"}</Button>
          </div>
        </Card>

        <Card>
          <h3 className="wh-card__title">Import products</h3>
          <p className="wh-card__text">
            Upload a CSV file. Required: product_name, sku, category_name. Optional: unit, cost_price, selling_price, delivery_charges, discount, tax, status, warehouse_id, initial_qty, reserved_qty, damaged_qty, stock_notes.
          </p>
          <p className="wh-card__text wh-muted wh-inv-import-export__note">
            Total price is calculated as (Selling price − Discount) + Tax. Delivery charges are stored separately.
          </p>
          <div className="wh-card__actions">
            <Button variant="secondary" onClick={downloadTemplate}>Download template</Button>
            <label className="wh-btn wh-btn--primary" style={{ cursor: "pointer" }}>
              {importing ? "Importing…" : "Choose CSV file"}
              <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={importing} style={{ display: "none" }} />
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
