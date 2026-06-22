import dotenv from "dotenv";
import { encrypt } from "../src/utils/cipher.js";
import { createPool, closePool } from "../src/db/pool.js";

dotenv.config();

const username = process.argv[2] || "w.admin";
const password = process.argv[3] || "admin123";
const name = process.argv[4] || "Admin";

const run = async () => {
  if (!username.toLowerCase().startsWith("w.")) {
    console.error("Username must start with w.");
    process.exit(1);
  }

  const db = await createPool();
  const encrypted = encrypt(password);

  const [existing] = await db.execute("SELECT id FROM wh_admin_users WHERE email = ? LIMIT 1", [username]);
  if (existing.length) {
    await db.execute(
      "UPDATE wh_admin_users SET password = ?, name = ?, status = 'active', updated_at = NOW() WHERE email = ?",
      [encrypted, name, username]
    );
    console.log(`Updated admin user: ${username}`);
  } else {
    await db.execute(
      "INSERT INTO wh_admin_users (name, email, password, status, created_at, updated_at) VALUES (?, ?, ?, 'active', NOW(), NOW())",
      [name, username, encrypted]
    );
    console.log(`Created admin user: ${username}`);
  }

  await closePool(db);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
