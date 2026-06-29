import crypto from "crypto";
import { readDb, writeDb } from "../../database/db.js";

const STATE_TTL_MINUTES = 30;
const SESSION_TTL_HOURS = 8;

async function purgeExpiredStates() {
  await writeDb.query(
    `DELETE FROM ecom_oauth_pending_states
     WHERE created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [STATE_TTL_MINUTES],
  );
}

async function purgeExpiredSessions() {
  await writeDb.query(
    `DELETE FROM ecom_oauth_sessions
     WHERE created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [SESSION_TTL_HOURS],
  );
}

export async function createOAuthState({ shop, tenantId }) {
  await purgeExpiredStates();
  const state = crypto.randomBytes(16).toString("hex");
  await writeDb.query(
    `INSERT INTO ecom_oauth_pending_states (state, shop, tenant_id) VALUES (?, ?, ?)`,
    [state, shop, tenantId],
  );
  return state;
}

export async function peekOAuthState(state) {
  await purgeExpiredStates();
  const [rows] = await readDb.query(
    `SELECT shop, tenant_id FROM ecom_oauth_pending_states WHERE state = ?`,
    [state],
  );
  if (!rows[0]) return null;
  return { shop: rows[0].shop, tenantId: rows[0].tenant_id };
}

export async function consumeOAuthState(state) {
  await purgeExpiredStates();
  const [rows] = await readDb.query(
    `SELECT shop, tenant_id FROM ecom_oauth_pending_states WHERE state = ?`,
    [state],
  );
  if (!rows[0]) return null;
  await writeDb.query(`DELETE FROM ecom_oauth_pending_states WHERE state = ?`, [state]);
  return { shop: rows[0].shop, tenantId: rows[0].tenant_id };
}

export async function createSession({ shop, accessToken, scope, storeId, tenantId }) {
  await purgeExpiredSessions();
  const sessionId = crypto.randomBytes(24).toString("hex");
  await writeDb.query(
    `INSERT INTO ecom_oauth_sessions (session_id, shop, access_token, scope, store_id, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, shop, accessToken, scope || null, storeId || null, tenantId],
  );
  return sessionId;
}

export async function getSession(sessionId) {
  await purgeExpiredSessions();
  if (!sessionId) return null;
  const [rows] = await readDb.query(
    `SELECT * FROM ecom_oauth_sessions WHERE session_id = ?`,
    [sessionId],
  );
  if (!rows[0]) return null;
  return {
    shop: rows[0].shop,
    accessToken: rows[0].access_token,
    scope: rows[0].scope,
    storeId: rows[0].store_id,
    tenantId: rows[0].tenant_id,
  };
}

export async function deleteSession(sessionId) {
  if (sessionId) {
    await writeDb.query(`DELETE FROM ecom_oauth_sessions WHERE session_id = ?`, [sessionId]);
  }
}
