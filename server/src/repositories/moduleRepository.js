import { readDb, writeDb } from "../database/db.js";
import { cascadeSoftDeleteModule } from "../utils/softDeleteCascade.js";

export const moduleRepository = {
  async findAll({ limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT id, module_name, created_at, last_updated_at
       FROM modules WHERE deleted_at IS NULL
       ORDER BY module_name ASC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM modules WHERE deleted_at IS NULL`
    );
    return { rows, total };
  },

  async findById(id) {
    const [rows] = await readDb.query(
      `SELECT id, module_name, created_at, last_updated_at
       FROM modules WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByIds(ids) {
    if (!ids?.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await readDb.query(
      `SELECT id, module_name FROM modules WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids
    );
    return rows;
  },

  async create(moduleName) {
    const [result] = await writeDb.query(
      `INSERT INTO modules (module_name) VALUES (?)`,
      [moduleName]
    );
    return result.insertId;
  },

  async update(id, moduleName) {
    await writeDb.query(
      `UPDATE modules SET module_name = ? WHERE id = ? AND deleted_at IS NULL`,
      [moduleName, id]
    );
  },

  async softDelete(id) {
    return cascadeSoftDeleteModule(id);
  },
};
