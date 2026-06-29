import {
  dashboardStats,
  dashboardStores,
  dashboardRecentSyncLogs,
  dashboardSyncByStatus,
  dashboardEntityByPlatform,
  dashboardSyncTrend,
} from "../repositories/ecommerceRepository.js";

export const ecommerceService = {
  async dashboard(tenantId) {
    const [stats, stores, recent_sync_logs, sync_by_status, entity_by_platform, sync_trend] =
      await Promise.all([
        dashboardStats(tenantId),
        dashboardStores(tenantId),
        dashboardRecentSyncLogs(tenantId, 12),
        dashboardSyncByStatus(tenantId),
        dashboardEntityByPlatform(tenantId),
        dashboardSyncTrend(tenantId, 7),
      ]);

    return {
      stats,
      stores,
      recent_sync_logs,
      sync_by_status,
      entity_by_platform,
      sync_trend,
    };
  },
};
