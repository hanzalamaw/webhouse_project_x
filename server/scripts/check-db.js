import dotenv from "dotenv";
import { createPool, closePool } from "../src/db/pool.js";
import { verifyPassword } from "../src/utils/cipher.js";

dotenv.config();

const db = await createPool();
try {
  const [users] = await db.execute(
    "SELECT id, email, password, status, LENGTH(password) AS plen FROM wh_admin_users WHERE LOWER(email) = ?",
    ["w.admin"]
  );
  console.log("wh_admin_users (w.admin):", users);

  const [tables] = await db.execute("SHOW TABLES");
  console.log("table count:", tables.length);

  const expectedTables = [
    "wh_admin_users",
    "modules",
    "wh_tenants",
    "users",
    "orders",
    "sessions",
    "logistics_pickup_orders",
  ];
  const tableNames = tables.map((row) => Object.values(row)[0]);
  const missing = expectedTables.filter((name) => !tableNames.includes(name));
  console.log("spot-check missing tables:", missing.length ? missing : "none");

  if (users[0]) {
    console.log("verify admin123:", verifyPassword("admin123", users[0].password));
  }
} catch (e) {
  console.error("DB error:", e.message);
}
await closePool(db);
