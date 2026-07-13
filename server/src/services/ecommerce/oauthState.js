import crypto from "crypto";
import { readDb, writeDb } from "../../database/db.js";

const STATE_TTL_MINUTES = 30;
const SESSION_TTL_HOURS = 8;

/** OAuth helper tables use opaque tokens, not tenant-scoped WHERE filters. */
const GUARD_OPTS = { skipTenantGuard: true, skipWriteAudit: true };

async function purgeExpiredStates() {
  await writeDb.query(
    `DELETE FROM ecom_oauth_pending_states
     WHERE created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [STATE_TTL_MINUTES],
    GUARD_OPTS,
  );
}

async function purgeExpiredSessions() {
  await writeDb.query(
    `DELETE FROM ecom_oauth_sessions
     WHERE created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [SESSION_TTL_HOURS],
    GUARD_OPTS,
  );
}

export async function createOAuthState({ shop, tenantId }) {
  await purgeExpiredStates();
  // One active OAuth flow per tenant — avoids stale tabs completing with the wrong shop.
  if (tenantId) {
    await writeDb.query(
      `DELETE FROM ecom_oauth_pending_states WHERE tenant_id = ?`,
      [tenantId],
      GUARD_OPTS,
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  await writeDb.query(
    `INSERT INTO ecom_oauth_pending_states (state, shop, tenant_id) VALUES (?, ?, ?)`,
    [state, shop, tenantId],
    GUARD_OPTS,
  );
  return state;
}

export async function peekOAuthState(state) {
  await purgeExpiredStates();
  const [rows] = await readDb.query(
    `SELECT shop, tenant_id FROM ecom_oauth_pending_states WHERE state = ?`,
    [state],
    GUARD_OPTS,
  );
  if (!rows[0]) return null;
  return { shop: rows[0].shop, tenantId: rows[0].tenant_id };
}

export async function consumeOAuthState(state) {
  await purgeExpiredStates();
  const [rows] = await readDb.query(
    `SELECT shop, tenant_id FROM ecom_oauth_pending_states WHERE state = ?`,
    [state],
    GUARD_OPTS,
  );
  if (!rows[0]) return null;
  await writeDb.query(
    `DELETE FROM ecom_oauth_pending_states WHERE state = ?`,
    [state],
    GUARD_OPTS,
  );
  return { shop: rows[0].shop, tenantId: rows[0].tenant_id };
}

export async function createSession({ shop, accessToken, scope, storeId, tenantId }) {
  await purgeExpiredSessions();
  const sessionId = crypto.randomBytes(24).toString("hex");
  await writeDb.query(
    `INSERT INTO ecom_oauth_sessions (session_id, shop, access_token, scope, store_id, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, shop, accessToken, scope || null, storeId || null, tenantId],
    GUARD_OPTS,
  );
  return sessionId;
}

export async function getSession(sessionId) {
  await purgeExpiredSessions();
  if (!sessionId) return null;
  const [rows] = await readDb.query(
    `SELECT * FROM ecom_oauth_sessions WHERE session_id = ?`,
    [sessionId],
    GUARD_OPTS,
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
    await writeDb.query(
      `DELETE FROM ecom_oauth_sessions WHERE session_id = ?`,
      [sessionId],
      GUARD_OPTS,
    );
  }
}
