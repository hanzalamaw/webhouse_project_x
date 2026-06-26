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
  await applyFile(db, "009_crm_module.sql");
  await applyFile(db, "010_crm_drop_extra_tables.sql");

  const [tables] = await db.query("SHOW TABLES LIKE 'crm_%'");
  console.log("CRM tables:", tables.map((t) => Object.values(t)[0]).join(", "));

  const [tagCol] = await db.query("SHOW COLUMNS FROM crm_customers LIKE 'tags'");
  console.log("crm_customers.tags:", tagCol.length ? "present" : "MISSING");
} catch (e) {
  console.error("CRM migration failed:", e.message);
  process.exit(1);
} finally {
  await closePool(db);
}

console.log("CRM migration complete.");
