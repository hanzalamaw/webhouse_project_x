export function computeProductStats(variants = []) {
  let totalAvailable = 0;
  let totalQty = 0;
  let reserved = 0;
  let damaged = 0;
  let costValue = 0;
  let retailValue = 0;
  let lowStock = 0;
  let outOfStock = 0;
  const warehouseTotals = new Map();

  for (const variant of variants) {
    const levels = variant.stock_levels || [];
    if (levels.length) {
      for (const sl of levels) {
        const avail = Number(sl.available_qty) || 0;
        const total = Number(sl.total_qty) || 0;
        const res = Number(sl.reserved_qty) || 0;
        const dmg = Number(sl.damaged_qty) || 0;
        const cost = Number(variant.cost_price) || 0;
        const sell = Number(variant.selling_price) || 0;

        totalAvailable += avail;
        totalQty += total;
        reserved += res;
        damaged += dmg;
        costValue += avail * cost;
        retailValue += avail * sell;

        const whName = sl.warehouse_name || "Unknown";
        warehouseTotals.set(whName, (warehouseTotals.get(whName) || 0) + avail);
      }
    } else {
      const avail = Number(variant.total_available) || 0;
      const total = Number(variant.total_qty) || 0;
      totalAvailable += avail;
      totalQty += total;
      costValue += avail * (Number(variant.cost_price) || 0);
      retailValue += avail * (Number(variant.selling_price) || 0);
    }

    const avail = Number(variant.total_available) || 0;
    if (avail <= 0) outOfStock += 1;
    else if (avail <= 5) lowStock += 1;
  }

  const stockByWarehouse = [...warehouseTotals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return {
    variant_count: variants.length,
    total_available: totalAvailable,
    total_qty: totalQty,
    reserved_units: reserved,
    damaged_units: damaged,
    stock_value_cost: costValue,
    stock_value_retail: retailValue,
    low_stock_variants: lowStock,
    out_of_stock_variants: outOfStock,
    stock_by_warehouse: stockByWarehouse,
  };
}
