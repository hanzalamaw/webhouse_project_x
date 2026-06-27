import { useMemo } from "react";

export default function ProductPicker({
  products,
  selectedIds,
  onToggle,
  search,
  onSearchChange,
  categoryFilter = "",
  onCategoryFilterChange,
  showCategoryFilter = false,
  showCategoryTag = false,
  showWarning = false,
  description,
  tall = false,
}) {
  const categories = useMemo(() => {
    const names = new Set(products.map((p) => p.category_name).filter(Boolean));
    return Array.from(names).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && p.category_name !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.product_name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category_name?.toLowerCase().includes(q) ||
        p.outlet_name?.toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryFilter]);

  return (
    <div className="wh-inv-product-picker">
      {description && <p className="wh-inv-block__desc">{description}</p>}
      {showWarning && (
        <div className="wh-inv-warning">
          <strong>⚠</strong> Selecting a product removes it from its existing category and assigns it here.
        </div>
      )}
      <div className={`wh-inv-picker-toolbar${showCategoryFilter ? "" : " wh-inv-picker-toolbar--search-only"}`}>
        <input
          type="search"
          className="wh-field__input wh-inv-picker-search"
          placeholder="Search products by name, SKU, or category…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {showCategoryFilter && (
          <select className="wh-field__input" value={categoryFilter} onChange={(e) => onCategoryFilterChange(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
      </div>
      <div className={`wh-inv-picker-panel${tall ? " wh-inv-picker-panel--tall" : ""}`}>
        <div className="wh-inv-picker-list">
          {filtered.length === 0 ? (
            <p className="wh-inv-picker-empty">No products match your search.</p>
          ) : (
            filtered.map((p) => (
              <label key={p.id} className="wh-inv-picker-row">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(String(p.id))}
                  onChange={() => onToggle(p.id)}
                />
                <span className="wh-inv-picker-row__label">
                  {p.product_name} ({p.sku})
                  {p.outlet_name && <span className="wh-inv-tag"> — {p.outlet_name}</span>}
                  {showCategoryTag && p.category_name && !selectedIds.includes(String(p.id)) && (
                    <span className="wh-inv-tag"> — in {p.category_name}</span>
                  )}
                  {showCategoryTag && p.category_name && selectedIds.includes(String(p.id)) && (
                    <span className="wh-inv-tag"> — {p.category_name}</span>
                  )}
                  {!showCategoryTag && p.category_name && !p.outlet_name && (
                    <span className="wh-inv-tag"> — {p.category_name}</span>
                  )}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
      {selectedIds.length > 0 && (
        <p className="wh-muted wh-inv-picker-count">{selectedIds.length} product(s) selected</p>
      )}
    </div>
  );
}
