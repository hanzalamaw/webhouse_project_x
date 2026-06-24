import dotenv from "dotenv";
import { createPool, closePool } from "../src/db/pool.js";

dotenv.config();
const db = await createPool();

try {
  try {
    await db.query("ALTER TABLE users ADD COLUMN username VARCHAR(100) NULL AFTER email");
    console.log("Added users.username column");
  } catch (e) {
    if (!String(e.message).includes("Duplicate column")) throw e;
    console.log("users.username column already exists");
  }
  await db.query("UPDATE users SET username = email WHERE username IS NULL OR username = ''");
  console.log("Backfilled username from email");
  try {
    await db.query("CREATE UNIQUE INDEX uk_users_tenant_username ON users (tenant_id, username)");
    console.log("Created username unique index");
  } catch (e) {
    if (!String(e.message).includes("Duplicate")) throw e;
    console.log("Username index already exists");
  }
} finally {
  await closePool(db);
}
