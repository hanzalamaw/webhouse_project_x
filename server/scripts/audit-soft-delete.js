/**
 * Audit: application delete paths should soft-delete (SET deleted_at), not hard DELETE.
 * Run: node scripts/audit-soft-delete.js
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src");
const allowedHardDelete = [
  "jobs/purgeSoftDeleted.js",
  "services/ecommerce/oauthState.js",
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (name.endsWith(".js")) files.push(path);
  }
  return files;
}

const violations = [];
for (const file of walk(root)) {
  const rel = relative(join(root, ".."), file).replace(/\\/g, "/");
  if (!rel.startsWith("src/")) continue;
  const short = rel.replace(/^src\//, "");
  if (allowedHardDelete.some((a) => short.endsWith(a))) continue;

  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (/DELETE\s+FROM/i.test(line) && !line.trim().startsWith("//") && !line.includes("DELETE av FROM")) {
      violations.push(`${short}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length) {
  console.error("Hard DELETE statements found (should use SET deleted_at = NOW() instead):\n");
  violations.forEach((v) => console.error(`  ${v}`));
  process.exit(1);
}

console.log("OK — no unexpected hard DELETE statements in server/src");
