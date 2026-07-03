import CustomerPayments from "./pages/CustomerPayments";
import VendorBills from "./pages/VendorBills";
import CreateVendorBill from "./pages/CreateVendorBill";
import Expenses from "./pages/Expenses";
import CreateExpense from "./pages/CreateExpense";
import RecurringExpenses from "./pages/RecurringExpenses";
import CreateRecurringExpense from "./pages/CreateRecurringExpense";
import BankAccounts from "./pages/BankAccounts";
import CreateBankAccount from "./pages/CreateBankAccount";
import Transactions from "./pages/Transactions";

export const FINANCE_ROUTES = [
  { path: "customer-payments", element: <CustomerPayments /> },
  { path: "vendor-bills", element: <VendorBills /> },
  { path: "vendor-bills/create", element: <CreateVendorBill /> },
  { path: "vendor-bills/edit/:billId", element: <CreateVendorBill /> },
  { path: "expenses", element: <Expenses /> },
  { path: "expenses/create", element: <CreateExpense /> },
  { path: "expenses/edit/:expenseId", element: <CreateExpense /> },
  { path: "recurring-expenses", element: <RecurringExpenses /> },
  { path: "recurring-expenses/create", element: <CreateRecurringExpense /> },
  { path: "recurring-expenses/edit/:recurringId", element: <CreateRecurringExpense /> },
  { path: "bank-accounts", element: <BankAccounts /> },
  { path: "bank-accounts/create", element: <CreateBankAccount /> },
  { path: "bank-accounts/edit/:accountId", element: <CreateBankAccount /> },
  { path: "transactions", element: <Transactions /> },
];
