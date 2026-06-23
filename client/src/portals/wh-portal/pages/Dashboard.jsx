import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { API_BASE } from "../../../config/api";
import { PageHeader } from "../../../components/PageHeader";
import { StatCard } from "../../../components/StatCard";
import { Card } from "../../../components/Card";
import { formatPKR } from "../../../utils/currency";

export default function Dashboard() {
  const { authFetch } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`${API_BASE}/dashboard/stats`)
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [authFetch]);

  const health = stats?.platform_health ?? 0;
  const val = (n) => (loading ? "—" : n ?? 0);
  const money = (n) => (loading ? "—" : formatPKR(n));

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Dashboard"
        description="Platform overview — tenants, subscriptions, revenue, and operational health."
      />

      <section className="wh-dashboard-section">
        <h2 className="wh-dashboard-section__title">Platform</h2>
        <div className="wh-stat-grid wh-stat-grid--4">
          <StatCard
            label="Platform Health"
            value={loading ? "—" : `${health}%`}
            hint="Active vs total tenants"
            tone={health >= 80 ? "success" : health >= 50 ? "warning" : "danger"}
          />
          <StatCard label="Total Tenants" value={val(stats?.total_clients)} />
          <StatCard label="Active Tenants" value={val(stats?.active_clients)} tone="success" />
          <StatCard label="Suspended" value={val(stats?.suspended_clients)} tone="warning" />
        </div>
      </section>

      <section className="wh-dashboard-section">
        <h2 className="wh-dashboard-section__title">Revenue &amp; Billing</h2>
        <div className="wh-stat-grid wh-stat-grid--4">
          <StatCard label="Revenue This Month" value={money(stats?.revenue_this_month)} tone="success" />
          <StatCard label="Outstanding Dues" value={money(stats?.outstanding_dues)} tone="warning" />
          <StatCard label="Active Subscriptions" value={val(stats?.active_subscriptions)} />
          <StatCard label="Overdue Renewals" value={val(stats?.overdue_renewals)} tone="danger" />
        </div>
      </section>

      <section className="wh-dashboard-section">
        <h2 className="wh-dashboard-section__title">Catalog &amp; Operations</h2>
        <div className="wh-stat-grid wh-stat-grid--4">
          <StatCard label="Subscription Plans" value={val(stats?.total_plans)} />
          <StatCard label="Modules" value={val(stats?.total_modules)} />
          <StatCard label="Live Sessions" value={val(stats?.live_sessions)} tone="success" />
          <StatCard label="Open Support Tickets" value={val(stats?.open_tickets)} tone="warning" />
        </div>
      </section>

      <div className="wh-grid-2">
        <Card>
          <h3 className="wh-card__title">Overdue Renewals</h3>
          <p className="wh-card__text">
            {val(stats?.overdue_renewals)} tenant subscription(s) past renewal date. Follow up before
            service interruption.
          </p>
        </Card>
        <Card>
          <h3 className="wh-card__title">Outstanding Dues</h3>
          <p className="wh-card__text">
            Total amount due across active subscriptions: {money(stats?.outstanding_dues)}. Review
            transactions and payment records.
          </p>
        </Card>
      </div>
    </div>
  );
}
