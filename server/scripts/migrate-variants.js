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
      msg.includes("Unknown table") ||
      msg.includes("check that it exists") ||
      msg.includes("Can't DROP") ||
      msg.includes("check that column/key exists") ||
      msg.includes("Unknown column") ||
      msg.includes("Duplicate key") ||
      msg.includes("errno: 121") ||
      msg.includes("Cannot drop index") ||
      msg.includes("doesn't exist in table")
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
  await applyFile(db, "021_product_variants.sql");
  await applyFile(db, "022_pos_variants_complete.sql");
  await applyFile(db, "023_pos_products_drop_variant_cols.sql");

  const [[inv]] = await db.query(
    "SELECT COUNT(*) AS cnt FROM inventory_product_variants WHERE deleted_at IS NULL"
  );
  const [[pos]] = await db.query(
    "SELECT COUNT(*) AS cnt FROM pos_product_variants WHERE deleted_at IS NULL"
  );
  console.log("Inventory variants:", inv?.cnt ?? 0);
  console.log("POS variants:", pos?.cnt ?? 0);
} catch (e) {
  console.error("Variant migration failed:", e.message);
  process.exit(1);
} finally {
  await closePool(db);
}

console.log("Variant migration complete.");
