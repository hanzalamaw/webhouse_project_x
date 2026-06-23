import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPool, closePool } from "../src/db/pool.js";
import { encrypt } from "../src/utils/cipher.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = await createPool();

const stripSqlComments = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();

const runSqlFile = async (relativePath) => {
  const fullPath = path.join(__dirname, "..", "..", "db", relativePath);
  const sql = fs.readFileSync(fullPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => stripSqlComments(s))
    .filter((s) => s && !/^USE `/i.test(s));

  for (const statement of statements) {
    await db.query(statement);
    console.log("OK:", statement.slice(0, 60).replace(/\s+/g, " ") + "...");
  }
};

try {
  console.log("Applying full schema (db/schema.sql)...");
  await runSqlFile("schema.sql");

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

  const [tables] = await db.execute("SHOW TABLES");
  const [user] = await db.execute(
    "SELECT email, LENGTH(password) AS plen FROM wh_admin_users WHERE email = 'w.admin'"
  );
  console.log(`Tables created: ${tables.length}`);
  console.log("Verified:", user[0]);
} catch (e) {
  console.error("Setup failed:", e.message);
  process.exit(1);
}

await closePool(db);
console.log("Database setup complete.");
