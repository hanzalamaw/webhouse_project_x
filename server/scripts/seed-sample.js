import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPool, closePool } from "../src/db/pool.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const stripSqlComments = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();

const splitSqlStatements = (sql) => {
  const withoutComments = stripSqlComments(sql);
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !/^USE `/i.test(s));
};

const run = async () => {
  const db = await createPool();

  const migrationPaths = [
    path.join(__dirname, "..", "..", "db", "migrations", "004_login_portal.sql"),
    path.join(__dirname, "..", "..", "db", "migrations", "007_subscription_login_portal.sql"),
  ];

  for (const migrationPath of migrationPaths) {
    if (!fs.existsSync(migrationPath)) continue;
    const migSql = fs.readFileSync(migrationPath, "utf8");
    const migStatements = splitSqlStatements(migSql);
    for (const statement of migStatements) {
      try {
        await db.query(statement);
      } catch (err) {
        if (err.code !== "ER_DUP_FIELDNAME" && err.code !== "ER_CANT_DROP_FIELD_OR_KEY") throw err;
      }
    }
    console.log(`Migration applied (or already present): ${path.basename(migrationPath)}`);
  }

  const sqlPath = path.join(__dirname, "..", "..", "db", "seeds", "sample_data.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    const [result] = await db.query(statement);
    if (Array.isArray(result) && result[0]?.message) {
      console.log(result[0].message);
    }
  }

  console.log("Sample data seed complete.");
  await closePool(db);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
