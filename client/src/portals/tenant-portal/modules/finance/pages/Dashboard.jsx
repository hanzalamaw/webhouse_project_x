import ModulePlaceholder from "../../../pages/ModulePlaceholder";
import { useState } from "react";
import { DashboardFilter } from "../../../../../components/DashboardFilter";
import { EMPTY_DASHBOARD_FILTER } from "../../../../../utils/dashboardFilter";

export default function FinanceDashboard() {
  const [dashFilter, setDashFilter] = useState({ ...EMPTY_DASHBOARD_FILTER });
  return (
    <div className="wh-page wh-page--wide">
      <DashboardFilter rows={[]} value={dashFilter} onChange={setDashFilter} />
      <ModulePlaceholder
        title="Finance & Accounting"
        description="Finance & Accounting module — functionality coming in a later update."
      />
    </div>
  );
}
