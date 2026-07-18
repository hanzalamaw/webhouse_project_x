import {
  disconnectStoreWithPolicy,
  getDisconnectPreview,
  getEntityCounts,
  getSyncLogs,
  getPendingOrderConflicts,
  countPendingOrderConflicts,
  resolveOrderConflict,
  updateAutoSyncEnabled,
  countUnmappedLocationLinks,
} from "../repositories/ecommerceRepository.js";
import { getImportPreview, importEntitiesToErp, applyResolvedOrderToErp } from "../services/ecommerce/ecomImport.js";

export function createEcomSharedHandlers(platform) {
  return {
    async handleDisconnect(req, res, store, clearSession) {
      const dataPolicy = ["keep", "delete_staged", "delete_all"].includes(req.body?.dataPolicy)
        ? req.body.dataPolicy
        : "keep";

      let result = { dataPolicy, deletedStaged: 0, deletedErp: { products: 0, customers: 0, orders: 0 } };
      if (store) {
        result = await disconnectStoreWithPolicy(store.id, store.tenant_id, dataPolicy, platform);
      }
      if (clearSession) await clearSession(req);
      res.json({ success: true, ...result });
    },

    async handleDisconnectPreview(_req, res, store) {
      if (!store) return res.status(409).json({ success: false, error: "Not connected" });
      const preview = await getDisconnectPreview(store.id, store.tenant_id, platform);
      res.json({ success: true, storeName: store.store_name, platform, ...preview });
    },

    async handleImportPreview(req, res, store) {
      if (!store) return res.status(409).json({ success: false, error: "Not connected" });
      const full = String(req.query?.full || "") === "1" || String(req.query?.full || "").toLowerCase() === "true";
      const preview = await getImportPreview(store.id, store.tenant_id, { full });
      res.json({ success: true, platform, ...preview });
    },

    async handleImport(req, res, store) {
      if (!store) return res.status(409).json({ success: false, error: "Not connected" });
      const entities = Array.isArray(req.body?.entities) ? req.body.entities : ["product", "customer", "order"];
      const result = await importEntitiesToErp(store.id, store.tenant_id, platform, entities, {
        updateExisting: req.body?.updateExisting !== false,
      });
      if (!result.success) return res.status(400).json(result);
      res.json({
        ...result,
        counts: await getEntityCounts(store.id, store.tenant_id),
        preview: await getImportPreview(store.id, store.tenant_id),
      });
    },

    async handleSyncStatusExtras(store) {
      const preview = await getImportPreview(store.id, store.tenant_id);
      const unmappedLocationCount = await countUnmappedLocationLinks(store.id);
      return {
        erpImportStatus: store.erp_import_status || "pending",
        pendingImportCount: preview.pendingImportCount,
        hasPendingImport: preview.hasPendingImport,
        pendingConflictCount: await countPendingOrderConflicts(store.id, store.tenant_id),
        unmappedLocationCount,
      };
    },

    async handleConflicts(_req, res, store) {
      if (!store) return res.status(409).json({ success: false, error: "Not connected" });
      res.json({ success: true, conflicts: await getPendingOrderConflicts(store.id, store.tenant_id) });
    },

    async handleResolveConflict(req, res, store) {
      if (!store) return res.status(409).json({ success: false, error: "Not connected" });
      const action = req.body?.action === "update" ? "update" : "keep";
      const ok = await resolveOrderConflict(store.id, store.tenant_id, req.params.externalId, action);
      if (!ok) return res.status(404).json({ success: false, error: "Conflict not found" });
      if (action === "update") {
        await applyResolvedOrderToErp(store.id, store.tenant_id, req.params.externalId);
      }
      res.json({
        success: true,
        counts: await getEntityCounts(store.id, store.tenant_id),
        pendingConflictCount: await countPendingOrderConflicts(store.id, store.tenant_id),
      });
    },

    async handleSyncLogs(req, res, store) {
      if (!store) return res.json({ logs: [] });
      const onlyFailed = String(req.query?.onlyFailed || "") === "1";
      const syncTypePrefix = req.query?.prefix ? String(req.query.prefix) : null;
      res.json({
        logs: await getSyncLogs(store.id, 200, { onlyFailed, syncTypePrefix }),
      });
    },

    async handleAutoSyncSetting(req, res, store) {
      if (!store) return res.status(409).json({ success: false, error: "Not connected" });
      const enabled = req.body?.enabled !== false && req.body?.enabled !== 0 && req.body?.enabled !== "0";
      await updateAutoSyncEnabled(store.id, store.tenant_id, enabled);
      res.json({ success: true, autoSyncEnabled: enabled });
    },
  };
}
