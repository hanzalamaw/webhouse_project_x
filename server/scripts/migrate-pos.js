import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPool, closePool } from "../src/db/pool.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const stripSqlComments = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();

async function runStatement(db, statement) {
  try {
    await db.query(statement);
    console.log("OK:", statement.slice(0, 72).replace(/\s+/g, " ") + "...");
    return true;
  } catch (e) {
    const msg = String(e.message || "");
    if (
      msg.includes("Duplicate column") ||
      msg.includes("Duplicate key name") ||
      msg.includes("already exists") ||
      msg.includes("Duplicate foreign key") ||
      msg.includes("Unknown table")
    ) {
      console.log("SKIP:", statement.slice(0, 60).replace(/\s+/g, " ") + "...");
      return false;
    }
    throw e;
  }
}

async function applyFile(db, relativePath) {
  const migrationPath = path.join(__dirname, "..", "..", "db", "migrations", relativePath);
  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => stripSqlComments(s))
    .filter(Boolean);

  console.log(`Applying ${relativePath} (${statements.length} statements)...`);
  for (const statement of statements) {
    await runStatement(db, statement);
  }
}

const db = await createPool();
try {
  await applyFile(db, "011_pos_terminal_module.sql");
  await applyFile(db, "012_pos_terminal_all_tenants.sql");

  const [mods] = await db.query(
    "SELECT module_name FROM modules WHERE module_name IN ('POS', 'POS Terminal') AND deleted_at IS NULL"
  );
  console.log("Modules:", mods.map((m) => m.module_name).join(", "));

  const [terminals] = await db.query(
    "SELECT COUNT(*) AS cnt FROM pos_terminals WHERE deleted_at IS NULL AND device_code = '1'"
  );
  console.log("Terminals with device code 1:", terminals[0]?.cnt ?? 0);
} catch (e) {
  console.error("POS migration failed:", e.message);
  process.exit(1);
} finally {
  await closePool(db);
}

console.log("POS migration complete.");
