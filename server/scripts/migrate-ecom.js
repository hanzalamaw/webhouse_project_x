import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const migrationPath = path.join(__dirname, "../../db/migrations/020_ecom_source_and_import.sql");

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "webhouse",
    multipleStatements: true,
  });

  const sql = fs.readFileSync(migrationPath, "utf8");
  try {
    await conn.query(sql);
    console.log("Migration applied.");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("Partial apply (some objects exist):", err.message);
    } else {
      throw err;
    }
  }

  await conn.end();
  console.log("E-commerce migration complete.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
