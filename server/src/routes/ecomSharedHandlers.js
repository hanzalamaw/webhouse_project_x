import {
  disconnectStoreWithPolicy,
  getDisconnectPreview,
  getEntityCounts,
  getSyncLogs,
  getPendingOrderConflicts,
  countPendingOrderConflicts,
  resolveOrderConflict,
} from "../repositories/ecommerceRepository.js";
import { getImportPreview, importEntitiesToErp } from "../services/ecommerce/ecomImport.js";

export function createEcomSharedHandlers(platform) {
  return {
    async handleDisconnect(req, res, store, clearSession) {
      const dataPolicy = ["keep", "delete_staged", "delete_all"].includes(req.body?.dataPolicy)
        ? req.body.dataPolicy
        : "keep";

      let result = { dataPolicy, deletedStaged: 0, deletedErp: { products: 0, customers: 0, orders: 0 } };
      if (store) {
        result = await disconnectStoreWithPolicy(store.id, store.tenant_id, dataPolicy);
      }
      if (clearSession) await clearSession(req);
      res.json({ success: true, ...result });
    },

    async handleDisconnectPreview(_req, res, store) {
      if (!store) return res.status(401).json({ success: false, error: "Not connected" });
      const preview = await getDisconnectPreview(store.id, store.tenant_id);
      res.json({ success: true, storeName: store.store_name, platform, ...preview });
    },

    async handleImportPreview(_req, res, store) {
      if (!store) return res.status(401).json({ success: false, error: "Not connected" });
      const preview = await getImportPreview(store.id, store.tenant_id);
      res.json({ success: true, platform, ...preview });
    },

    async handleImport(req, res, store) {
      if (!store) return res.status(401).json({ success: false, error: "Not connected" });
      const entities = Array.isArray(req.body?.entities) ? req.body.entities : ["product", "customer", "order"];
      const result = await importEntitiesToErp(store.id, store.tenant_id, platform, entities, {
        updateExisting: req.body?.updateExisting !== false,
      });
      if (!result.success) return res.status(400).json(result);
      res.json({
        ...result,
        counts: await getEntityCounts(store.id),
        preview: await getImportPreview(store.id, store.tenant_id),
      });
    },

    async handleSyncStatusExtras(store) {
      const preview = await getImportPreview(store.id, store.tenant_id);
      return {
        erpImportStatus: store.erp_import_status || "pending",
        pendingImportCount: preview.pendingImportCount,
        hasPendingImport: preview.hasPendingImport,
        pendingConflictCount: await countPendingOrderConflicts(store.id),
      };
    },

    async handleConflicts(_req, res, store) {
      if (!store) return res.status(401).json({ success: false, error: "Not connected" });
      res.json({ success: true, conflicts: await getPendingOrderConflicts(store.id) });
    },

    async handleResolveConflict(req, res, store) {
      if (!store) return res.status(401).json({ success: false, error: "Not connected" });
      const action = req.body?.action === "update" ? "update" : "keep";
      const ok = await resolveOrderConflict(store.id, req.params.externalId, action);
      if (!ok) return res.status(404).json({ success: false, error: "Conflict not found" });
      res.json({
        success: true,
        counts: await getEntityCounts(store.id),
        pendingConflictCount: await countPendingOrderConflicts(store.id),
      });
    },

    async handleSyncLogs(_req, res, store) {
      if (!store) return res.json({ logs: [] });
      res.json({ logs: await getSyncLogs(store.id, 150) });
    },
  };
}
