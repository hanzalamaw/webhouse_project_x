import ManageOutlets from "./pages/outlets/ManageOutlets";
import ManageTerminals from "./pages/terminals/ManageTerminals";
import ManageSales from "./pages/sales/ManageSales";
import ManageRegisters from "./pages/registers/ManageRegisters";

export const POS_ROUTES = [
  { path: "outlets", element: <ManageOutlets /> },
  { path: "terminals", element: <ManageTerminals /> },
  { path: "sales", element: <ManageSales /> },
  { path: "registers", element: <ManageRegisters /> },
];
