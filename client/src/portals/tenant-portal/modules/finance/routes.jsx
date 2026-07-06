import CustomerPayments from "./pages/CustomerPayments";
import VendorBills from "./pages/VendorBills";
import CreateVendorBill from "./pages/CreateVendorBill";
import ViewVendorBill from "./pages/ViewVendorBill";
import Expenses from "./pages/Expenses";
import CreateExpense from "./pages/CreateExpense";
import ViewExpense from "./pages/ViewExpense";
import RecurringExpenses from "./pages/RecurringExpenses";
import CreateRecurringExpense from "./pages/CreateRecurringExpense";
import ViewRecurringExpense from "./pages/ViewRecurringExpense";
import BankAccounts from "./pages/BankAccounts";
import CreateBankAccount from "./pages/CreateBankAccount";
import ViewBankAccount from "./pages/ViewBankAccount";
import Transactions from "./pages/Transactions";
import ViewTransaction from "./pages/ViewTransaction";
import ViewCustomerPayment from "./pages/ViewCustomerPayment";
import ExpenseCategories from "./pages/ExpenseCategories";

export const FINANCE_ROUTES = [
  { path: "customer-payments", element: <CustomerPayments /> },
  { path: "customer-payments/view/:paymentId", element: <ViewCustomerPayment /> },
  { path: "vendor-bills", element: <VendorBills /> },
  { path: "vendor-bills/view/:billId", element: <ViewVendorBill /> },
  { path: "vendor-bills/create", element: <CreateVendorBill /> },
  { path: "vendor-bills/edit/:billId", element: <CreateVendorBill /> },
  { path: "expenses", element: <Expenses /> },
  { path: "expenses/view/:expenseId", element: <ViewExpense /> },
  { path: "expense-categories", element: <ExpenseCategories /> },
  { path: "expenses/create", element: <CreateExpense /> },
  { path: "expenses/edit/:expenseId", element: <CreateExpense /> },
  { path: "recurring-expenses", element: <RecurringExpenses /> },
  { path: "recurring-expenses/view/:recurringId", element: <ViewRecurringExpense /> },
  { path: "recurring-expenses/create", element: <CreateRecurringExpense /> },
  { path: "recurring-expenses/edit/:recurringId", element: <CreateRecurringExpense /> },
  { path: "bank-accounts", element: <BankAccounts /> },
  { path: "bank-accounts/view/:accountId", element: <ViewBankAccount /> },
  { path: "bank-accounts/create", element: <CreateBankAccount /> },
  { path: "bank-accounts/edit/:accountId", element: <CreateBankAccount /> },
  { path: "transactions", element: <Transactions /> },
  { path: "transactions/view/:transactionId", element: <ViewTransaction /> },
];
