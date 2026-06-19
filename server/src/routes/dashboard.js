export function registerDashboardRoutes(app, db, verifyToken) {
  app.get("/api/dashboard/stats", verifyToken, async (req, res) => {
    const [[totals]] = await db.execute(
      `SELECT
         COUNT(*) AS total_clients,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_clients
       FROM wh_tenants`
    );

    const [[revenue]] = await db.execute(
      `SELECT COALESCE(SUM(total_received), 0) AS monthly_revenue
       FROM wh_tenant_payments
       WHERE MONTH(received_at) = MONTH(CURRENT_DATE())
         AND YEAR(received_at) = YEAR(CURRENT_DATE())`
    );

    const [[expired]] = await db.execute(
      `SELECT COUNT(*) AS expired_subscriptions
       FROM wh_tenant_subscriptions
       WHERE renewal_date < CURRENT_DATE() AND status != 'active'`
    );

    const [[limits]] = await db.execute(
      `SELECT COUNT(*) AS usage_alerts
       FROM wh_tenant_limits tl
       JOIN wh_tenants t ON t.id = tl.tenant_id
       WHERE t.status = 'active'
         AND (tl.max_users >= 90 OR tl.max_orders_per_month >= 9000)`
    );

    const activeClients = Number(totals?.active_clients || 0);
    const totalClients = Number(totals?.total_clients || 0);
    const healthScore = totalClients === 0 ? 100 : Math.round((activeClients / totalClients) * 100);

    res.json({
      platform_health: healthScore,
      total_clients: totalClients,
      active_clients: activeClients,
      monthly_revenue: Number(revenue?.monthly_revenue || 0),
      expired_subscriptions: Number(expired?.expired_subscriptions || 0),
      usage_alerts: Number(limits?.usage_alerts || 0),
    });
  });
}
