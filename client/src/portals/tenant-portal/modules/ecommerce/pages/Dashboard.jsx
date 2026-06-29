import ModulePlaceholder from "../../../pages/ModulePlaceholder";
import { useState } from "react";
import { DashboardFilter } from "../../../../../components/DashboardFilter";
import { EMPTY_DASHBOARD_FILTER } from "../../../../../utils/dashboardFilter";

function PlaceholderDashboard({ title, description }) {
  const [dashFilter, setDashFilter] = useState({ ...EMPTY_DASHBOARD_FILTER });
  return (
    <div className="wh-page wh-page--wide">
      <DashboardFilter rows={[]} value={dashFilter} onChange={setDashFilter} />
      <ModulePlaceholder title={title} description={description} />
    </div>
  );
}

export default function EcommerceDashboard() {
  return (
    <PlaceholderDashboard
      title="E-Commerce Integration"
      description="E-Commerce Integration module — functionality coming in a later update."
    />
  );
}
