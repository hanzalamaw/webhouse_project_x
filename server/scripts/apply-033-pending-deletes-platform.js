import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createPool, closePool } from "../src/db/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const sqlPath = path.resolve(__dirname, "../../db/migrations/033_pending_deletes_platform.sql");

async function run() {
  const db = await createPool();
  try {
    const [cols] = await db.query("SHOW COLUMNS FROM ecom_pending_shopify_deletes LIKE 'platform'");
    if (cols.length) {
      console.log("migration_already_applied");
      return;
    }
    const sql = fs.readFileSync(sqlPath, "utf8");
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.query(stmt);
    }
    console.log("migration_applied");
  } finally {
    await closePool(db);
  }
}

run().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
