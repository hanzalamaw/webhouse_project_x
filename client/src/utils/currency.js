export function formatPKR(amount) {
  const n = Number(amount) || 0;
  return `Rs. ${n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const LOGIN_PORTAL_OPTIONS = [
  { value: "erp1", label: "ERP 1" },
  { value: "erp2", label: "ERP 2" },
  { value: "erp3", label: "ERP 3" },
];
