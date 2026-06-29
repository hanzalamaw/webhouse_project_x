import { AsyncLocalStorage } from "node:async_hooks";

export const auditContext = new AsyncLocalStorage();

export function getAuditContext() {
  return auditContext.getStore() || null;
}
