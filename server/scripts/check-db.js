import dotenv from "dotenv";
import { createPool } from "../src/db/pool.js";
import { verifyPassword } from "../src/utils/cipher.js";

dotenv.config();

const db = await createPool();
try {
  const [users] = await db.execute(
    "SELECT id, email, password, status, LENGTH(password) AS plen FROM wh_admin_users WHERE LOWER(email) = ?",
    ["w.admin"]
  );
  console.log("users:", users);

  const [tables] = await db.execute("SHOW TABLES LIKE 'user_sessions'");
  console.log("user_sessions table:", tables);

  if (users[0]) {
    console.log("verify admin123:", verifyPassword("admin123", users[0].password));
  }
} catch (e) {
  console.error("DB error:", e.message);
}
await db.end();
