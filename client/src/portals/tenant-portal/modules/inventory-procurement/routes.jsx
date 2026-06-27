import CreateProduct from "./pages/products/CreateProduct";
import ManageProducts from "./pages/products/ManageProducts";
import Categories from "./pages/products/Categories";
import BulkImportExport from "./pages/products/BulkImportExport";
import CreateWarehouse from "./pages/warehouses/CreateWarehouse";
import ManageWarehouses from "./pages/warehouses/ManageWarehouses";
import StockIn from "./pages/procurement/StockIn";
import StockOut from "./pages/procurement/StockOut";
import StockTransfers from "./pages/procurement/StockTransfers";
import CreateBulkStock from "./pages/procurement/CreateBulkStock";
import MovementHistory from "./pages/procurement/MovementHistory";

export const INVENTORY_ROUTES = [
  { path: "products/create", element: <CreateProduct /> },
  { path: "products/edit/:productId", element: <CreateProduct /> },
  { path: "products/manage", element: <ManageProducts /> },
  { path: "products/categories", element: <Categories /> },
  { path: "products/import-export", element: <BulkImportExport /> },
  { path: "warehouses", element: <ManageWarehouses /> },
  { path: "warehouses/create", element: <CreateWarehouse /> },
  { path: "warehouses/edit/:warehouseId", element: <CreateWarehouse /> },
  { path: "procurement/stock-in", element: <StockIn /> },
  { path: "procurement/stock-in/create", element: <CreateBulkStock /> },
  { path: "procurement/stock-out", element: <StockOut /> },
  { path: "procurement/stock-out/create", element: <CreateBulkStock /> },
  { path: "procurement/transfers", element: <StockTransfers /> },
  { path: "procurement/transfers/create", element: <CreateBulkStock /> },
  { path: "procurement/movement-history", element: <MovementHistory /> },
];
