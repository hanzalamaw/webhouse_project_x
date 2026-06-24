import { PageHeader } from "../../../components/PageHeader";
import { Card } from "../../../components/Card";

export default function ModulePlaceholder({ title, description }) {
  return (
    <div className="wh-page">
      <PageHeader title={title} description={description || "This section will be built soon."} />
      <Card>
        <p className="wh-muted">Placeholder — functionality coming in a later update.</p>
      </Card>
    </div>
  );
}
