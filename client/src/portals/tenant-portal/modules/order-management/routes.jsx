import CreateOrder from "./pages/orders/CreateOrder";
import ManageOrders from "./pages/orders/ManageOrders";
import OrderView from "./pages/orders/OrderView";
import ManageAssignments from "./pages/assignments/ManageAssignments";
import CreateAssignment from "./pages/assignments/CreateAssignment";
import ManagePayments from "./pages/payments/ManagePayments";
import CreatePayment from "./pages/payments/CreatePayment";
import ManageCancellations from "./pages/cancellations/ManageCancellations";
import CreateCancellation from "./pages/cancellations/CreateCancellation";
import ManageReturns from "./pages/returns/ManageReturns";
import CreateReturn from "./pages/returns/CreateReturn";
import ManageExchanges from "./pages/exchanges/ManageExchanges";
import CreateExchange from "./pages/exchanges/CreateExchange";
import ManageRefunds from "./pages/refunds/ManageRefunds";
import CreateRefund from "./pages/refunds/CreateRefund";
import InvoicePrinting from "./pages/printing/InvoicePrinting";
import OrderImportExport from "./pages/ImportExport";

export const ORDER_MANAGEMENT_ROUTES = [
  { path: "orders/manage", element: <ManageOrders /> },
  { path: "orders/create", element: <CreateOrder /> },
  { path: "orders/edit/:orderId", element: <CreateOrder /> },
  { path: "orders/view/:orderId", element: <OrderView /> },
  { path: "assignments/manage", element: <ManageAssignments /> },
  { path: "assignments/create", element: <CreateAssignment /> },
  { path: "assignments/edit/:assignmentId", element: <CreateAssignment /> },
  { path: "payments/manage", element: <ManagePayments /> },
  { path: "payments/create", element: <CreatePayment /> },
  { path: "payments/edit/:paymentId", element: <CreatePayment /> },
  { path: "cancellations/manage", element: <ManageCancellations /> },
  { path: "cancellations/create", element: <CreateCancellation /> },
  { path: "returns/manage", element: <ManageReturns /> },
  { path: "returns/create", element: <CreateReturn /> },
  { path: "exchanges/manage", element: <ManageExchanges /> },
  { path: "exchanges/create", element: <CreateExchange /> },
  { path: "refunds/manage", element: <ManageRefunds /> },
  { path: "refunds/create", element: <CreateRefund /> },
  { path: "printing", element: <InvoicePrinting /> },
  { path: "import-export", element: <OrderImportExport /> },
];
