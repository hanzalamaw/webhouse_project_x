import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { API_BASE } from "../../../config/api";
import { PageHeader } from "../../../components/PageHeader";
import { StatCard } from "../../../components/StatCard";
import { Card } from "../../../components/Card";

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

  return (
    <div className="wh-page">
      <PageHeader
        title="Dashboard"
        description="Landing page for WebHouse admins — platform health and key metrics at a glance."
      />

      <div className="wh-stat-grid">
        <StatCard
          label="Platform Health"
          value={loading ? "—" : `${health}%`}
          hint="Overall platform health score"
          tone={health >= 80 ? "success" : health >= 50 ? "warning" : "danger"}
        />
        <StatCard label="Total Clients" value={loading ? "—" : stats?.total_clients ?? 0} />
        <StatCard label="Active Clients" value={loading ? "—" : stats?.active_clients ?? 0} tone="success" />
        <StatCard
          label="Monthly Revenue"
          value={loading ? "—" : `$${Number(stats?.monthly_revenue || 0).toLocaleString()}`}
        />
        <StatCard
          label="Expired Subscriptions"
          value={loading ? "—" : stats?.expired_subscriptions ?? 0}
          tone="warning"
        />
        <StatCard label="Usage Alerts" value={loading ? "—" : stats?.usage_alerts ?? 0} tone="danger" />
      </div>

      <div className="wh-grid-2">
        <Card>
          <h3 className="wh-card__title">Expired Subscriptions</h3>
          <p className="wh-card__text">
            Accounts that need renewal attention. Review tenant subscriptions with past renewal dates and
            follow up before service interruption.
          </p>
        </Card>
        <Card>
          <h3 className="wh-card__title">Usage Alerts</h3>
          <p className="wh-card__text">
            Tenants approaching user, warehouse, store, or monthly order limits. Proactively upgrade plans or
            adjust limits before operations are affected.
          </p>
        </Card>
      </div>
    </div>
  );
}
