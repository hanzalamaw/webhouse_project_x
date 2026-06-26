import { Navigate } from "react-router-dom";
import ManageLeads from "./pages/leads/ManageLeads";
import CreateCustomer from "./pages/customers/CreateCustomer";
import ManageCustomers from "./pages/customers/ManageCustomers";
import CustomerProfile from "./pages/customers/CustomerProfile";
import ImportExport from "./pages/ImportExport";
import ManageComplaints from "./pages/complaints/ManageComplaints";
import CreateComplaint from "./pages/complaints/CreateComplaint";
import { MODULE_BASE } from "./constants";

export const CRM_ROUTES = [
  { path: "leads/create", element: <Navigate to={`${MODULE_BASE}/leads/manage`} replace /> },
  { path: "leads/edit/:leadId", element: <Navigate to={`${MODULE_BASE}/leads/manage`} replace /> },
  { path: "leads/manage", element: <ManageLeads /> },
  { path: "leads/import", element: <Navigate to={`${MODULE_BASE}/import-export`} replace /> },
  { path: "customers/create", element: <CreateCustomer /> },
  { path: "customers/edit/:customerId", element: <CreateCustomer /> },
  { path: "customers/manage", element: <ManageCustomers /> },
  { path: "customers/import-export", element: <Navigate to={`${MODULE_BASE}/import-export`} replace /> },
  { path: "import-export", element: <ImportExport /> },
  { path: "customers/:customerId", element: <CustomerProfile /> },
  { path: "complaints/create", element: <CreateComplaint /> },
  { path: "complaints/edit/:complaintId", element: <CreateComplaint /> },
  { path: "complaints/manage", element: <ManageComplaints /> },
];
