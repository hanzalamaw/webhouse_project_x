import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { StatCard } from "../../../../components/StatCard";

export default function Transaction() {
  return (
    <div className="wh-page">
      <PageHeader
        title="Transaction"
        description="Generate invoices and track payments, dues, and discounts for tenant billing."
      />
      <div className="wh-stat-grid wh-stat-grid--3">
        <StatCard label="Outstanding Dues" value="$12,400" tone="warning" />
        <StatCard label="Received This Month" value="$48,200" tone="success" />
        <StatCard label="Discounts Applied" value="$1,850" />
      </div>
      <div className="wh-grid-2">
        <Card>
          <h3 className="wh-card__title">Generate Invoices</h3>
          <p className="wh-card__text">
            Create billing documents from active subscriptions, module add-ons, and one-time charges.
          </p>
        </Card>
        <Card>
          <h3 className="wh-card__title">Payment Tracking</h3>
          <p className="wh-card__text">
            Monitor bank and cash receipts, partial payments, amount due, and applied discounts per tenant.
          </p>
        </Card>
      </div>
    </div>
  );
}
