import { readDb } from "../database/db.js";
import { cascadeSoftDeleteSubscriptionPlan } from "../utils/softDeleteCascade.js";

export const subscriptionRepository = {
  async findAll({ limit, offset }) {
    const [rows] = await readDb.query(
      `SELECT sp.id, sp.plan_name, sp.plan_price, sp.login_portal, sp.created_at, sp.last_updated_at,
              (SELECT COUNT(*) FROM wh_subscription_module sm
               WHERE sm.subscription_plan_id = sp.id AND sm.deleted_at IS NULL) AS module_count
       FROM wh_subscription_plans sp
       WHERE sp.deleted_at IS NULL
       ORDER BY sp.plan_name ASC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [[{ total }]] = await readDb.query(
      `SELECT COUNT(*) AS total FROM wh_subscription_plans WHERE deleted_at IS NULL`
    );
    return { rows, total };
  },

  async findById(id) {
    const [rows] = await readDb.query(
      `SELECT id, plan_name, plan_price, login_portal, created_at, last_updated_at
       FROM wh_subscription_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async getModuleIds(planId) {
    const [rows] = await readDb.query(
      `SELECT module_id FROM wh_subscription_module
       WHERE subscription_plan_id = ? AND deleted_at IS NULL`,
      [planId]
    );
    return rows.map((r) => r.module_id);
  },

  async getModulesForPlan(planId) {
    const [rows] = await readDb.query(
      `SELECT m.id, m.module_name
       FROM wh_subscription_module sm
       JOIN modules m ON m.id = sm.module_id AND m.deleted_at IS NULL
       WHERE sm.subscription_plan_id = ? AND sm.deleted_at IS NULL
       ORDER BY m.module_name`,
      [planId]
    );
    return rows;
  },

  async create({ planName, planPrice, loginPortal, moduleIds }) {
    const pool = (await import("../database/db.js")).getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO wh_subscription_plans (plan_name, plan_price, login_portal) VALUES (?, ?, ?)`,
        [planName, planPrice, loginPortal]
      );
      const planId = result.insertId;
      for (const moduleId of moduleIds) {
        await connection.execute(
          `INSERT INTO wh_subscription_module (subscription_plan_id, module_id) VALUES (?, ?)`,
          [planId, moduleId]
        );
      }
      await connection.commit();
      return planId;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  async update(id, { planName, planPrice, loginPortal, moduleIds }) {
    const pool = (await import("../database/db.js")).getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE wh_subscription_plans SET plan_name = ?, plan_price = ?, login_portal = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [planName, planPrice, loginPortal, id]
      );
      await connection.execute(
        `UPDATE wh_subscription_module SET deleted_at = NOW()
         WHERE subscription_plan_id = ? AND deleted_at IS NULL`,
        [id]
      );
      for (const moduleId of moduleIds) {
        const [existing] = await connection.execute(
          `SELECT id FROM wh_subscription_module
           WHERE subscription_plan_id = ? AND module_id = ? LIMIT 1`,
          [id, moduleId]
        );
        if (existing.length) {
          await connection.execute(
            `UPDATE wh_subscription_module SET deleted_at = NULL WHERE id = ?`,
            [existing[0].id]
          );
        } else {
          await connection.execute(
            `INSERT INTO wh_subscription_module (subscription_plan_id, module_id) VALUES (?, ?)`,
            [id, moduleId]
          );
        }
      }
      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  },

  async softDelete(id) {
    return cascadeSoftDeleteSubscriptionPlan(id);
  },
};
