import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createPool, closePool } from "../src/db/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const sqlPath = path.resolve(__dirname, "../../db/migrations/031_ecom_pending_shopify_deletes.sql");

async function run() {
  const db = await createPool();
  try {
    const [tables] = await db.query("SHOW TABLES LIKE 'ecom_pending_shopify_deletes'");
    if (tables.length) {
      console.log("migration_already_applied");
      return;
    }
    const sql = fs.readFileSync(sqlPath, "utf8");
    await db.query(sql);
    console.log("migration_applied");
  } finally {
    await closePool(db);
  }
}

run().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
