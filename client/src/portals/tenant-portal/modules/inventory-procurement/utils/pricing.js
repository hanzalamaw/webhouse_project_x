import { formatPKR } from "../../../../../utils/currency";

export function calcTotalPrice(sellingPrice, discount, tax) {
  const selling = Number(sellingPrice) || 0;
  const disc = Number(discount) || 0;
  const t = Number(tax) || 0;
  return Math.max(0, selling - disc + t);
}

export function formatTotalPrice(sellingPrice, discount, tax) {
  return formatPKR(calcTotalPrice(sellingPrice, discount, tax));
}
