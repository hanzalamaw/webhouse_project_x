import { useAuth } from "../../../context/AuthContext";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/PageHeader";
import { Card } from "../../../components/Card";

export default function TenantDashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="wh-page" style={{ padding: 24 }}>
      <PageHeader title="Dashboard" description={`Welcome to ${user?.tenant_name || "your workspace"}.`} />
      <Card>
        <p className="wh-card__text">Logged in as <strong>{user?.name}</strong> ({user?.email})</p>
        <p className="wh-muted">Tenant portal modules will be built here. Your session is active.</p>
        <Button type="button" variant="secondary" onClick={logout} style={{ marginTop: 16 }}>
          Log out
        </Button>
      </Card>
    </div>
  );
}
