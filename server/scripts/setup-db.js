import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPool } from "../src/db/pool.js";
import { encrypt } from "../src/utils/cipher.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = await createPool();

const runSqlFile = async (relativePath) => {
  const fullPath = path.join(__dirname, "..", "..", "db", relativePath);
  const sql = fs.readFileSync(fullPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--") && !/^USE `/i.test(s));

  for (const statement of statements) {
    if (!statement) continue;
    await db.query(statement);
    console.log("OK:", statement.slice(0, 60).replace(/\s+/g, " ") + "...");
  }
};

try {
  console.log("Running migration 002...");
  await runSqlFile("migrations/002_user_sessions.sql");

  console.log("Running migration 003...");
  await runSqlFile("migrations/003_password_column_widen.sql");

  const admins = [
    ["John Admin", "w.admin", "admin123"],
    ["Sarah Ops", "w.sarah", "password1"],
    ["Support Lead", "w.support", "webhouse"],
  ];

  for (const [name, email, password] of admins) {
    const encrypted = encrypt(password);
    await db.execute(
      `INSERT INTO wh_admin_users (name, email, password, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', NOW(), NOW())
       ON DUPLICATE KEY UPDATE password = VALUES(password), name = VALUES(name), status = 'active', updated_at = NOW()`,
      [name, email, encrypted]
    );
    console.log(`Seeded ${email} (password length: ${encrypted.length})`);
  }

  const [user] = await db.execute(
    "SELECT email, LENGTH(password) AS plen FROM wh_admin_users WHERE email = 'w.admin'"
  );
  console.log("Verified:", user[0]);
} catch (e) {
  console.error("Setup failed:", e.message);
  process.exit(1);
}

await db.end();
console.log("Database setup complete.");
