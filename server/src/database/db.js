/** @type {import("mysql2/promise").Pool | null} */
let pool = null;

export async function initDb(mysqlPool) {
  pool = mysqlPool;
}

export const readDb = {
  async query(sql, params = []) {
    if (!pool) throw new Error("Database pool not initialized");
    return pool.execute(sql, params);
  },
};

export const writeDb = {
  async query(sql, params = []) {
    if (!pool) throw new Error("Database pool not initialized");
    return pool.execute(sql, params);
  },
};

export function getPool() {
  return pool;
}
