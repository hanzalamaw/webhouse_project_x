import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";

const actions = [
  "Edit tenant profile and contact details",
  "Suspend or activate client accounts",
  "Delete tenant records (with safeguards)",
  "Enable or disable modules per client",
  "Control allowed users, warehouses, and stores",
];

export default function ManageTenant() {
  return (
    <div className="wh-page">
      <PageHeader
        title="Manage Tenant"
        description="Edit, suspend, activate, or delete client accounts. Control modules and resource limits."
      />
      <Card>
        <h3 className="wh-card__title">Tenant Operations</h3>
        <ul className="wh-list">
          {actions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="wh-card__text wh-muted">
          Tenant list and action controls will load from the API. Use this page to manage lifecycle and module
          access for each client.
        </p>
      </Card>
    </div>
  );
}
