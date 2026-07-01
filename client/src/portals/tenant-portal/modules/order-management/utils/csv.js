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

export function parseCsv(text) {
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
