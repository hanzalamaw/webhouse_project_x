import { Navigate } from "react-router-dom";
import { MODULE_BASE } from "../constants";

export default function PosTerminalDashboard() {
  return <Navigate to={`${MODULE_BASE}/checkout`} replace />;
}
