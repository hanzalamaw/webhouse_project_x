import { Navigate, useParams } from "react-router-dom";
import CreateStore from "./pages/stores/CreateStore";
import ManageStores from "./pages/stores/ManageStores";
import EditStore from "./pages/stores/EditStore";
import StoreView from "./pages/stores/StoreView";
import ManageSales from "./pages/sales/ManageSales";
import ManageRegisters from "./pages/registers/ManageRegisters";
import TerminalLogsView from "./pages/registers/TerminalLogsView";
import CreateProduct from "./pages/products/CreateProduct";
import ManageProducts from "./pages/products/ManageProducts";
import Categories from "./pages/products/Categories";
import BulkImportExport from "./pages/products/BulkImportExport";
import StockIn from "./pages/procurement/StockIn";
import StockOut from "./pages/procurement/StockOut";
import StockTransfers from "./pages/procurement/StockTransfers";
import CreateBulkStock from "./pages/procurement/CreateBulkStock";
import MovementHistory from "./pages/procurement/MovementHistory";
import ViewStockMovement from "./pages/procurement/ViewStockMovement";
import ViewStockTransfer from "./pages/procurement/ViewStockTransfer";
import { MODULE_BASE } from "./constants";

function RedirectOutletEdit() {
  const { outletId } = useParams();
  return <Navigate to={`${MODULE_BASE}/stores/edit/${outletId}`} replace />;
}

export const POS_ROUTES = [
  { path: "stores/manage", element: <ManageStores /> },
  { path: "stores/create", element: <CreateStore /> },
  { path: "stores/edit/:storeId", element: <EditStore /> },
  { path: "stores/:storeId", element: <StoreView /> },
  { path: "products/create", element: <CreateProduct /> },
  { path: "products/edit/:productId", element: <CreateProduct /> },
  { path: "products/manage", element: <ManageProducts /> },
  { path: "products/categories", element: <Categories /> },
  { path: "products/import-export", element: <BulkImportExport /> },
  { path: "procurement/stock-in", element: <StockIn /> },
  { path: "procurement/stock-in/create", element: <CreateBulkStock /> },
  { path: "procurement/stock-out", element: <StockOut /> },
  { path: "procurement/stock-out/create", element: <CreateBulkStock /> },
  { path: "procurement/transfers", element: <StockTransfers /> },
  { path: "procurement/transfers/create", element: <CreateBulkStock /> },
  { path: "procurement/transfers/view/:transferId", element: <ViewStockTransfer /> },
  { path: "procurement/movements/view/:movementId", element: <ViewStockMovement /> },
  { path: "procurement/movement-history", element: <MovementHistory /> },
  { path: "registers/terminal/:terminalId", element: <TerminalLogsView /> },
  { path: "outlets", element: <Navigate to={`${MODULE_BASE}/stores/manage`} replace /> },
  { path: "outlets/create", element: <Navigate to={`${MODULE_BASE}/stores/create`} replace /> },
  { path: "outlets/edit/:outletId", element: <RedirectOutletEdit /> },
  { path: "terminals", element: <Navigate to={`${MODULE_BASE}/stores/manage`} replace /> },
  { path: "terminals/create", element: <Navigate to={`${MODULE_BASE}/stores/create`} replace /> },
  { path: "sales", element: <ManageSales /> },
  { path: "registers", element: <ManageRegisters /> },
];
