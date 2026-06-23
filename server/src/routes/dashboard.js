export function registerDashboardRoutes(app, db, verifyToken) {
  app.get("/api/dashboard/stats", verifyToken, async (req, res) => {
    if (req.userRole !== "wh_admin") return res.status(403).json({ message: "Forbidden" });

    const q = async (sql, params = []) => {
      const [rows] = await db.execute(sql, params);
      return rows[0] || {};
    };

    const totals = await q(
      `SELECT
         COUNT(*) AS total_clients,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_clients,
         SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended_clients
       FROM wh_tenants WHERE deleted_at IS NULL`
    );

    const revenue = await q(
      `SELECT COALESCE(SUM(total_received), 0) AS revenue_this_month
       FROM wh_tenant_payments
       WHERE deleted_at IS NULL
         AND received_at IS NOT NULL
         AND MONTH(received_at) = MONTH(CURRENT_DATE())
         AND YEAR(received_at) = YEAR(CURRENT_DATE())`
    );

    const dues = await q(
      `SELECT COALESCE(SUM(amount_due), 0) AS outstanding_dues
       FROM wh_tenant_subscriptions WHERE deleted_at IS NULL AND status = 'active'`
    );

    const subs = await q(
      `SELECT
         COUNT(*) AS active_subscriptions,
         SUM(CASE WHEN renewal_date < CURRENT_DATE() AND status = 'active' THEN 1 ELSE 0 END) AS overdue_renewals,
         SUM(CASE WHEN status != 'active' THEN 1 ELSE 0 END) AS inactive_subscriptions
       FROM wh_tenant_subscriptions WHERE deleted_at IS NULL`
    );

    const plans = await q(`SELECT COUNT(*) AS total_plans FROM wh_subscription_plans WHERE deleted_at IS NULL`);
    const modules = await q(`SELECT COUNT(*) AS total_modules FROM modules WHERE deleted_at IS NULL`);
    const sessions = await q(
      `SELECT COUNT(*) AS live_sessions FROM sessions
       WHERE deleted_at IS NULL AND is_active = 1 AND (logout_at IS NULL OR logout_at = '0000-00-00 00:00:00')`
    );
    const tickets = await q(
      `SELECT
         COUNT(*) AS open_tickets,
         SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_tickets
       FROM wh_support_tickets WHERE deleted_at IS NULL`
    );

    const activeClients = Number(totals.active_clients || 0);
    const totalClients = Number(totals.total_clients || 0);
    const healthScore = totalClients === 0 ? 100 : Math.round((activeClients / totalClients) * 100);

    res.json({
      platform_health: healthScore,
      total_clients: totalClients,
      active_clients: activeClients,
      suspended_clients: Number(totals.suspended_clients || 0),
      revenue_this_month: Number(revenue.revenue_this_month || 0),
      outstanding_dues: Number(dues.outstanding_dues || 0),
      active_subscriptions: Number(subs.active_subscriptions || 0),
      overdue_renewals: Number(subs.overdue_renewals || 0),
      inactive_subscriptions: Number(subs.inactive_subscriptions || 0),
      total_plans: Number(plans.total_plans || 0),
      total_modules: Number(modules.total_modules || 0),
      live_sessions: Number(sessions.live_sessions || 0),
      open_tickets: Number(tickets.open_tickets || 0) - Number(tickets.resolved_tickets || 0),
      resolved_tickets: Number(tickets.resolved_tickets || 0),
    });
  });
}
