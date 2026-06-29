export const LEAD_CSV_HEADERS = [
  "lead_name",
  "phone",
  "email",
  "company_name",
  "source",
  "status",
  "notes",
  "assigned_to_name",
];

export const CUSTOMER_CSV_HEADERS = [
  "customer_name",
  "company_name",
  "customer_type",
  "phone",
  "email",
  "status",
  "tags",
  "note",
  "billing_address",
  "billing_city",
  "billing_state",
  "billing_postal_code",
];

function escapeCsvField(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function detectDelimiter(text) {
  const firstLine = String(text || "").split(/\r?\n/).find((l) => l.trim()) || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  if (semicolons > commas) return ";";
  return ",";
}

/** RFC 4180-style parser; handles quoted commas and newlines inside fields. */
function parseCsvRows(text, delimiter = ",") {
  const s = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => String(cell).trim())) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  return rows;
}

export function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseCsvRows(text, delimiter);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => String(h).trim().replace(/^\uFEFF/, ""));
  return rows.slice(1).map((values) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = String(values[i] ?? "").trim();
    });
    return obj;
  });
}

export function toCsv(headers, rows) {
  const header = headers.map(escapeCsvField).join(",");
  const body = (rows || []).map((r) => headers.map((h) => escapeCsvField(r[h])).join(","));
  return [header, ...body].join("\r\n");
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function isRowEmpty(row, requiredField) {
  const hasRequired = requiredField ? String(row[requiredField] || "").trim() : false;
  if (requiredField && !hasRequired) {
    const any = Object.values(row).some((v) => String(v || "").trim());
    return !any;
  }
  return !hasRequired;
}
