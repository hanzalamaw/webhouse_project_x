import { useMemo } from "react";

/** Picker for sellable variants (SKU-level). */
export default function VariantPicker({
  variants,
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
    const names = new Set(variants.map((v) => v.category_name).filter(Boolean));
    return Array.from(names).sort();
  }, [variants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return variants.filter((v) => {
      if (categoryFilter && v.category_name !== categoryFilter) return false;
      if (!q) return true;
      return (
        v.product_name?.toLowerCase().includes(q) ||
        v.variant_name?.toLowerCase().includes(q) ||
        v.sku?.toLowerCase().includes(q) ||
        v.category_name?.toLowerCase().includes(q)
      );
    });
  }, [variants, search, categoryFilter]);

  const labelFor = (v) => {
    const base = v.variant_name && v.variant_name !== v.product_name
      ? `${v.product_name} — ${v.variant_name}`
      : v.product_name;
    return `${base} (${v.sku})`;
  };

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
          placeholder="Search by product, variant, SKU, or category…"
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
            <p className="wh-inv-picker-empty">No variants match your search.</p>
          ) : (
            filtered.map((v) => (
              <label key={v.id} className="wh-inv-picker-row">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(String(v.id))}
                  onChange={() => onToggle(v.id)}
                />
                <span className="wh-inv-picker-row__label">
                  {labelFor(v)}
                  {showCategoryTag && v.category_name && (
                    <span className="wh-inv-tag"> — {v.category_name}</span>
                  )}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
      {selectedIds.length > 0 && (
        <p className="wh-muted wh-inv-picker-count">{selectedIds.length} variant(s) selected</p>
      )}
    </div>
  );
}
