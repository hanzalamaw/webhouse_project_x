import { Connector, AuthTypes, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import mysql from "mysql2/promise";

const DEFAULT_POOL_SIZE = 5;

let connector;

const parsePoolSize = () => {
  const raw = process.env.DB_POOL_SIZE;
  if (raw === undefined || raw === "") return DEFAULT_POOL_SIZE;
  const size = Number.parseInt(raw, 10);
  if (!Number.isFinite(size) || size < 1) {
    throw new Error(`DB_POOL_SIZE must be a positive integer, got "${raw}"`);
  }
  return size;
};

const basePoolOptions = () => ({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parsePoolSize(),
  queueLimit: 0,
  dateStrings: true,
});

const resolveIpType = () => {
  const raw = (process.env.CLOUD_SQL_IP_TYPE || "PUBLIC").toUpperCase();
  if (raw === "PRIVATE") return IpAddressTypes.PRIVATE;
  if (raw === "PSC") return IpAddressTypes.PSC;
  return IpAddressTypes.PUBLIC;
};

const shouldUseCloudSqlConnector = () => {
  const mode = (process.env.DB_CONNECT_MODE || "").toLowerCase();
  if (mode === "tcp") return false;
  if (mode === "cloud-sql") return true;
  return Boolean(process.env.CLOUD_SQL_CONNECTION_NAME);
};

const createTcpPool = () => {
  const host = process.env.DB_HOST;
  if (!host) {
    throw new Error("DB_HOST is required when DB_CONNECT_MODE=tcp (point this at ProxySQL or local MySQL)");
  }

  const port = Number.parseInt(process.env.DB_PORT || "3306", 10);
  return mysql.createPool({
    ...basePoolOptions(),
    host,
    port,
  });
};

const createCloudSqlPool = async () => {
  const instanceConnectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
  if (!instanceConnectionName) {
    throw new Error(
      "CLOUD_SQL_CONNECTION_NAME is required when DB_CONNECT_MODE=cloud-sql (format: project:region:instance)"
    );
  }

  connector = new Connector();
  const clientOpts = await connector.getOptions({
    instanceConnectionName,
    ipType: resolveIpType(),
    authType: AuthTypes.PASSWORD,
  });

  return mysql.createPool({
    ...clientOpts,
    ...basePoolOptions(),
  });
};

/**
 * Layer 1: small fixed pool per process (DB_POOL_SIZE, default 5).
 * Layer 2: Cloud SQL Connector when CLOUD_SQL_CONNECTION_NAME / DB_CONNECT_MODE=cloud-sql.
 * Layer 3: point DB_HOST at ProxySQL when DB_CONNECT_MODE=tcp (prod scale path).
 */
export const createPool = async () => {
  if (shouldUseCloudSqlConnector()) {
    return createCloudSqlPool();
  }
  return createTcpPool();
};

export const closePool = async (pool) => {
  await pool.end();
  if (connector) {
    await connector.close();
    connector = undefined;
  }
};
