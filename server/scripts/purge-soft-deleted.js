import dotenv from "dotenv";
import { createPool, closePool } from "../src/db/pool.js";
import { initDb } from "../src/database/db.js";
import { purgeSoftDeleted } from "../src/jobs/purgeSoftDeleted.js";

dotenv.config();

const pool = await createPool();
await initDb(pool);

try {
  const { total, tables, errors } = await purgeSoftDeleted();
  console.log("Purge complete:", { total, tables, errors });
} finally {
  await closePool(pool);
}
