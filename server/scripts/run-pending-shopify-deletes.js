import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createPool, closePool } from "../src/db/pool.js";
import { initDb } from "../src/database/db.js";
import { processPendingShopifyDeletes } from "../src/jobs/processPendingShopifyDeletes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const db = await createPool();
await initDb(db);

try {
  const [rows] = await db.query(`
    SELECT id, entity_type, external_id, internal_id, delete_after, status, deleted_at, last_error
    FROM ecom_pending_shopify_deletes
    ORDER BY id DESC
    LIMIT 20
  `);
  console.log("pending_rows:");
  console.table(rows);

  const result = await processPendingShopifyDeletes();
  console.log("process_result:", result);

  const [after] = await db.query(`
    SELECT id, entity_type, external_id, status, delete_after, completed_at, last_error
    FROM ecom_pending_shopify_deletes
    ORDER BY id DESC
    LIMIT 20
  `);
  console.log("after_run:");
  console.table(after);
} finally {
  await closePool(db);
}
