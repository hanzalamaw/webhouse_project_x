export const ORDER_CSV_HEADERS = [
  "order_no",
  "customer_name",
  "order_source",
  "order_status",
  "payment_status",
  "fulfillment_status",
  "product_name",
  "sku",
  "quantity",
  "unit_price",
  "item_discount",
  "item_total",
  "discount_amount",
  "delivery_charges",
  "payable_amount",
  "city",
  "delivery_address",
  "payment_method",
  "notes",
];

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values.map((v) => v.trim());
}

export function parseCsv(text) {
  // Strip UTF-8 BOM so the first header key is not corrupted.
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

export function toCsv(rows, headers = ORDER_CSV_HEADERS) {
  const header = headers.join(",");
  const body = rows.map((r) =>
    headers.map((h) => {
      const v = r[h] ?? "";
      return String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : v;
    }).join(",")
  );
  return [header, ...body].join("\n");
}

export function downloadCsv(filename, rows, headers = ORDER_CSV_HEADERS) {
  const blob = new Blob([toCsv(rows, headers)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
