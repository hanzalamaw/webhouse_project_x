import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { Button } from "../../../../../components/Button";
import VariantDetailModal from "./VariantDetailModal";

function emptyOption(key) {
  return { _key: key, attribute_name: "", values: [], valueInput: "" };
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "X";
}

function comboKey(combo) {
  return Object.keys(combo)
    .sort()
    .map((k) => `${k}=${combo[k]}`)
    .join("|");
}

function cartesian(options) {
  const normalized = options.filter((o) => o.attribute_name.trim() && o.values.length);
  if (!normalized.length) return [{}];
  return normalized.reduce(
    (acc, opt) => {
      const next = [];
      for (const row of acc) {
        for (const value of opt.values) {
          next.push({ ...row, [opt.attribute_name.trim()]: value });
        }
      }
      return next;
    },
    [{}]
  );
}

function buildDefaultSku(combo, skuPrefix, productName) {
  const prefix = slugify(skuPrefix || productName || "SKU");
  const parts = Object.keys(combo)
    .sort()
    .map((k) => slugify(combo[k]));
  if (!parts.length) return prefix;
  return `${prefix}-${parts.join("-")}`.slice(0, 100);
}

export function makeDefaultOptions() {
  return [];
}

export function mapOptionsFromApi(variants = []) {
  const map = new Map();
  for (const v of variants) {
    for (const a of v.attributes || []) {
      const name = String(a.attribute_name || "").trim();
      const value = String(a.value || "").trim();
      if (!name || !value) continue;
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(value);
    }
  }
  let i = 0;
  return Array.from(map.entries()).map(([attribute_name, values]) => ({
    _key: `o-${i++}`,
    attribute_name,
    values: Array.from(values),
    valueInput: "",
  }));
}

export function mapVariantRowsFromApi(variants = []) {
  return variants.map((v) => {
    const combo = {};
    for (const a of v.attributes || []) {
      combo[a.attribute_name] = a.value;
    }
    return {
      combo_key: (v.attributes || [])
        .slice()
        .sort((a, b) => a.attribute_name.localeCompare(b.attribute_name))
        .map((a) => `${a.attribute_name}=${a.value}`)
        .join("|"),
      combo,
      id: v.id,
      sku: v.sku || "",
      variant_name: v.variant_name || "",
      cost_price: v.cost_price ?? "",
      selling_price: v.selling_price ?? "",
      status: v.status || "active",
      stock_levels: v.stock_levels || [],
      warehouse_stocks: [],
    };
  });
}

const GripIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ImagePlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
    <line x1="12" y1="8" x2="12" y2="14" />
    <line x1="9" y1="11" x2="15" y2="11" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function OptionCard({
  opt,
  index,
  isEditing,
  onEdit,
  onDone,
  onDelete,
  onNameChange,
  onValueInputChange,
  onValueChange,
  onAddValue,
  onRemoveValue,
}) {
  if (!isEditing) {
    return (
      <div className="wh-inv-option-card wh-inv-option-card--view">
        <button type="button" className="wh-inv-option-card__grip" aria-label="Reorder option" tabIndex={-1}>
          <GripIcon />
        </button>
        <button type="button" className="wh-inv-option-card__view-body" onClick={onEdit}>
          <span className="wh-inv-option-card__name">{opt.attribute_name || `Option ${index + 1}`}</span>
          <div className="wh-inv-option-card__pills">
            {opt.values.map((val) => (
              <span key={val} className="wh-inv-option-pill">{val}</span>
            ))}
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="wh-inv-option-card wh-inv-option-card--edit">
      <div className="wh-inv-option-card__edit-row">
        <span className="wh-inv-option-card__grip wh-inv-option-card__grip--static" aria-hidden="true">
          <GripIcon />
        </span>
        <div className="wh-inv-option-card__edit-fields">
          <label className="wh-inv-option-card__field-label" htmlFor={`opt-name-${opt._key}`}>Option name</label>
          <input
            id={`opt-name-${opt._key}`}
            className="wh-inv-option-card__input"
            value={opt.attribute_name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Size, Color, Box"
            autoFocus
          />

          <span className="wh-inv-option-card__field-label">Option values</span>
          <div className="wh-inv-option-card__values">
            {opt.values.map((val, vi) => (
              <div key={`${opt._key}-v-${vi}`} className="wh-inv-option-value-row">
                <span className="wh-inv-option-card__grip wh-inv-option-card__grip--static" aria-hidden="true">
                  <GripIcon />
                </span>
                <input
                  className="wh-inv-option-card__input wh-inv-option-card__input--value"
                  value={val}
                  onChange={(e) => onValueChange(vi, e.target.value)}
                  aria-label={`Value ${vi + 1}`}
                />
                <button
                  type="button"
                  className="wh-inv-option-value-row__delete"
                  onClick={() => onRemoveValue(vi)}
                  aria-label={`Remove ${val || "value"}`}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            <div className="wh-inv-option-value-row wh-inv-option-value-row--add">
              <span className="wh-inv-option-card__grip wh-inv-option-card__grip--static" aria-hidden="true">
                <GripIcon />
              </span>
              <input
                className="wh-inv-option-card__input wh-inv-option-card__input--value wh-inv-option-card__input--placeholder"
                value={opt.valueInput}
                onChange={(e) => onValueInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAddValue();
                  }
                }}
                onBlur={onAddValue}
                placeholder="Add another value"
              />
            </div>
          </div>

          <div className="wh-inv-option-card__actions">
            <button type="button" className="wh-inv-option-card__delete-btn" onClick={onDelete}>
              Delete
            </button>
            <Button type="button" className="wh-btn--sm" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StockPopover({
  row,
  locationId,
  warehouseOptions,
  isEdit,
  onClose,
  onApply,
}) {
  const [qty, setQty] = useState("");
  const [whId, setWhId] = useState(locationId || warehouseOptions[0]?.value || "");
  const popRef = useRef(null);

  useEffect(() => {
    const existing = getStockForLocation(row, whId, isEdit);
    setQty(String(existing?.qty ?? existing?.initial_qty ?? 0));
  }, [row, whId, isEdit]);

  useEffect(() => {
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  return (
    <div className="wh-inv-stock-popover" ref={popRef} role="dialog" aria-label="Set stock">
      <div className="wh-inv-stock-popover__row">
        <select className="wh-inv-stock-popover__select" value="set" disabled>
          <option value="set">Set to</option>
        </select>
        <input
          type="number"
          min="0"
          className="wh-inv-stock-popover__qty"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          autoFocus
        />
        {warehouseOptions.length > 1 && (
          <select
            className="wh-inv-stock-popover__select wh-inv-stock-popover__select--location"
            value={whId}
            onChange={(e) => setWhId(e.target.value)}
          >
            {warehouseOptions.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="wh-inv-stock-popover__confirm"
          onClick={() => onApply(row.combo_key, whId, Number(qty) || 0)}
          aria-label="Apply stock"
        >
          <CheckIcon />
        </button>
      </div>
    </div>
  );
}

function getStockForLocation(row, locationId, isEdit) {
  if (isEdit) {
    const sl = (row.stock_levels || []).find((s) => String(s.warehouse_id) === String(locationId));
    return sl ? { qty: sl.available_qty ?? 0 } : null;
  }
  const wh = (row.warehouse_stocks || []).find((s) => String(s.warehouse_id) === String(locationId));
  return wh ? { initial_qty: wh.initial_qty ?? 0 } : null;
}

function getAvailableAtLocation(row, locationId, isEdit) {
  if (!locationId) {
    if (isEdit) {
      return (row.stock_levels || []).reduce((sum, sl) => sum + (Number(sl.available_qty) || 0), 0);
    }
    return (row.warehouse_stocks || []).reduce((sum, wh) => sum + (Number(wh.initial_qty) || 0), 0);
  }
  if (isEdit) {
    const sl = (row.stock_levels || []).find((s) => String(s.warehouse_id) === String(locationId));
    return sl ? Number(sl.available_qty) || 0 : 0;
  }
  const wh = (row.warehouse_stocks || []).find((s) => String(s.warehouse_id) === String(locationId));
  return wh ? Number(wh.initial_qty) || 0 : 0;
}

export default function ProductOptionsEditor({
  options,
  onOptionsChange,
  variantRows,
  onVariantRowsChange,
  productName = "",
  skuPrefix = "",
  defaultCostPrice = "",
  defaultSellingPrice = "",
  statusOptions = ["active", "inactive"],
  isEdit = false,
  warehouseOptions = [],
  showWarehouseStock = false,
}) {
  const optionKeyRef = useRef(0);
  const rowOverridesRef = useRef(new Map());
  const variantRowsRef = useRef(variantRows);
  variantRowsRef.current = variantRows;

  const [editingKeys, setEditingKeys] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [stockPopoverKey, setStockPopoverKey] = useState(null);
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [modalRowKey, setModalRowKey] = useState(null);

  useEffect(() => {
    if (warehouseOptions.length === 1) {
      setSelectedLocation(warehouseOptions[0].value);
    }
  }, [warehouseOptions]);

  const syncVariantRows = useCallback(() => {
    const combos = cartesian(options);
    const prevByKey = new Map(variantRowsRef.current.map((r) => [r.combo_key, r]));
    const merged = new Map(rowOverridesRef.current);

    const next = combos.map((combo) => {
      const key = comboKey(combo);
      const prev = prevByKey.get(key) || merged.get(key) || {};
      const variant_name = Object.values(combo).join(" / ") || productName || "Default";
      return {
        combo_key: key,
        combo,
        id: prev.id || null,
        sku: prev.sku || buildDefaultSku(combo, skuPrefix, productName),
        variant_name,
        cost_price: prev.cost_price !== undefined && prev.cost_price !== "" ? prev.cost_price : defaultCostPrice,
        selling_price:
          prev.selling_price !== undefined && prev.selling_price !== ""
            ? prev.selling_price
            : defaultSellingPrice,
        status: prev.status || "active",
        warehouse_stocks: prev.warehouse_stocks || [],
        stock_levels: prev.stock_levels || [],
      };
    });

    if (!options.filter((o) => o.attribute_name.trim() && o.values.length).length) {
      const prev = variantRowsRef.current[0] || merged.get("") || {};
      next.length = 0;
      next.push({
        combo_key: "",
        combo: {},
        id: prev.id || null,
        sku: prev.sku || buildDefaultSku({}, skuPrefix, productName),
        variant_name: productName || "Default",
        cost_price: prev.cost_price ?? defaultCostPrice,
        selling_price: prev.selling_price ?? defaultSellingPrice,
        status: prev.status || "active",
        warehouse_stocks: prev.warehouse_stocks || [],
        stock_levels: prev.stock_levels || [],
      });
    }

    onVariantRowsChange(next);
  }, [options, productName, skuPrefix, defaultCostPrice, defaultSellingPrice, onVariantRowsChange]);

  const optionSignature = useMemo(
    () => options.map((o) => `${o.attribute_name}:${o.values.join(",")}`).join(";"),
    [options]
  );

  useEffect(() => {
    syncVariantRows();
  }, [optionSignature, skuPrefix, productName, defaultCostPrice, defaultSellingPrice, syncVariantRows]);

  const addOption = () => {
    optionKeyRef.current += 1;
    const key = `o-${optionKeyRef.current}`;
    onOptionsChange([...options, emptyOption(key)]);
    setEditingKeys((prev) => new Set(prev).add(key));
  };

  const updateOption = (key, patch) => {
    onOptionsChange(options.map((o) => (o._key === key ? { ...o, ...patch } : o)));
  };

  const removeOption = (key) => {
    onOptionsChange(options.filter((o) => o._key !== key));
    setEditingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const finishOptionEdit = (key) => {
    const opt = options.find((o) => o._key === key);
    if (!opt?.attribute_name.trim()) {
      removeOption(key);
      return;
    }
    const values = opt.values.map((v) => v.trim()).filter(Boolean);
    updateOption(key, { values, valueInput: "" });
    setEditingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const addValueFromInput = (key) => {
    const opt = options.find((o) => o._key === key);
    if (!opt) return;
    const v = String(opt.valueInput || "").trim();
    if (!v || opt.values.includes(v)) {
      updateOption(key, { valueInput: "" });
      return;
    }
    updateOption(key, { values: [...opt.values, v], valueInput: "" });
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return variantRows;
    return variantRows.filter(
      (r) =>
        r.variant_name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        Object.values(r.combo || {}).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [variantRows, search]);

  const totalAvailable = useMemo(() => {
    return variantRows.reduce((sum, row) => sum + getAvailableAtLocation(row, selectedLocation, isEdit), 0);
  }, [variantRows, selectedLocation, isEdit]);

  const locationLabel = selectedLocation
    ? warehouseOptions.find((w) => w.value === selectedLocation)?.label || "selected location"
    : "all locations";

  const updateVariantRow = (rowKey, field, value) => {
    rowOverridesRef.current.set(rowKey, {
      ...(variantRows.find((r) => r.combo_key === rowKey) || {}),
      [field]: value,
    });
    onVariantRowsChange(
      variantRows.map((r) => (r.combo_key === rowKey ? { ...r, [field]: value } : r))
    );
  };

  const saveVariantFromModal = (patch) => {
    if (!modalRowKey) return;
    const merged = {
      ...(variantRows.find((r) => r.combo_key === modalRowKey) || {}),
      ...patch,
    };
    rowOverridesRef.current.set(modalRowKey, merged);
    onVariantRowsChange(
      variantRows.map((r) => (r.combo_key === modalRowKey ? { ...r, ...patch } : r))
    );
    setModalRowKey(null);
  };

  const modalRow = modalRowKey
    ? variantRows.find((r) => r.combo_key === modalRowKey) || null
    : null;

  const openVariantModal = (comboKey) => setModalRowKey(comboKey);

  const isInteractiveTarget = (target) =>
    target.closest("input, button, .wh-inv-stock-cell, .wh-inv-price-input-wrap");

  const showStockColumn = showWarehouseStock || isEdit;
  const colCount = 4 + (showStockColumn ? 1 : 0);

  const applyStock = (rowKey, warehouseId, qty) => {
    if (!warehouseId) return;
    onVariantRowsChange(
      variantRows.map((r) => {
        if (r.combo_key !== rowKey) return r;
        if (isEdit) return r;
        const stocks = [...(r.warehouse_stocks || [])];
        const idx = stocks.findIndex((s) => String(s.warehouse_id) === String(warehouseId));
        const entry = {
          _key: idx >= 0 ? stocks[idx]._key : `wh-${warehouseId}`,
          warehouse_id: warehouseId,
          initial_qty: String(qty),
          reserved_qty: idx >= 0 ? stocks[idx].reserved_qty : "0",
          damaged_qty: idx >= 0 ? stocks[idx].damaged_qty : "0",
          stock_notes: idx >= 0 ? stocks[idx].stock_notes : "",
        };
        if (idx >= 0) stocks[idx] = entry;
        else stocks.push(entry);
        return { ...r, warehouse_stocks: stocks };
      })
    );
    setStockPopoverKey(null);
  };

  const toggleRowSelect = (key) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllRows = () => {
    if (selectedRows.size === filteredRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRows.map((r) => r.combo_key)));
    }
  };

  return (
    <div className="wh-inv-options-editor">
      {/* Options section */}
      <div className="wh-inv-options-section">
        {options.map((opt, index) => (
          <OptionCard
            key={opt._key}
            opt={opt}
            index={index}
            isEditing={editingKeys.has(opt._key)}
            onEdit={() => setEditingKeys((prev) => new Set(prev).add(opt._key))}
            onDone={() => finishOptionEdit(opt._key)}
            onDelete={() => removeOption(opt._key)}
            onNameChange={(name) => updateOption(opt._key, { attribute_name: name })}
            onValueInputChange={(val) => updateOption(opt._key, { valueInput: val })}
            onValueChange={(vi, val) => {
              const values = [...opt.values];
              values[vi] = val;
              updateOption(opt._key, { values });
            }}
            onAddValue={() => addValueFromInput(opt._key)}
            onRemoveValue={(vi) => {
              updateOption(opt._key, { values: opt.values.filter((_, i) => i !== vi) });
            }}
          />
        ))}

        <button type="button" className="wh-inv-add-option-btn" onClick={addOption}>
          <span className="wh-inv-add-option-btn__icon">+</span>
          Add another option
        </button>

        {options.length === 0 && (
          <p className="wh-muted wh-inv-options-empty">
            No options yet — add Size, Color, etc. Leave empty for a single default variant.
          </p>
        )}
      </div>

      {/* Variants table */}
      <div className="wh-inv-variants-panel">
        <div className="wh-table-toolbar wh-inv-variants-toolbar">
          <div className="wh-table-toolbar__search">
            <span className="wh-table-toolbar__search-icon"><SearchIcon /></span>
            <input
              type="search"
              className="wh-table-toolbar__input"
              placeholder="Search variants…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {warehouseOptions.length > 0 && (
            <div className="wh-table-toolbar__filters">
              <select
                className="wh-table-toolbar__select"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="">All locations</option>
                {warehouseOptions.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="wh-table-container wh-inv-variants-table-wrap">
          <table className="wh-table wh-inv-variants-table">
            <thead>
              <tr>
                <th className="wh-inv-variants-table__check">
                  <input
                    type="checkbox"
                    checked={filteredRows.length > 0 && selectedRows.size === filteredRows.length}
                    onChange={toggleAllRows}
                    aria-label="Select all variants"
                  />
                </th>
                <th>Variant</th>
                <th className="wh-inv-variants-table__price">Cost</th>
                <th className="wh-inv-variants-table__price">Price</th>
                {showStockColumn && <th className="wh-inv-variants-table__stock">Available</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="wh-inv-picker-empty">
                    {search ? "No variants match your search." : "Add option values to generate variants."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const available = getAvailableAtLocation(row, selectedLocation, isEdit);
                  return (
                    <tr
                      key={row.combo_key}
                      className="wh-inv-variants-table__row"
                      onClick={(e) => {
                        if (isInteractiveTarget(e.target)) return;
                        openVariantModal(row.combo_key);
                      }}
                    >
                      <td className="wh-inv-variants-table__check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRows.has(row.combo_key)}
                          onChange={() => toggleRowSelect(row.combo_key)}
                          aria-label={`Select ${row.variant_name}`}
                        />
                      </td>
                      <td className="wh-inv-variants-table__variant">
                        <button
                          type="button"
                          className="wh-inv-variant-cell wh-inv-variant-cell--btn"
                          onClick={() => openVariantModal(row.combo_key)}
                        >
                          <span className="wh-inv-variant-cell__thumb" aria-hidden="true">
                            <ImagePlusIcon />
                          </span>
                          <div className="wh-inv-variant-cell__text">
                            <span className="wh-inv-variant-cell__name">{row.variant_name}</span>
                            <span className="wh-inv-variant-cell__sku">{row.sku}</span>
                          </div>
                        </button>
                      </td>
                      <td className="wh-inv-variants-table__price" onClick={(e) => e.stopPropagation()}>
                        <div className="wh-inv-price-input-wrap">
                          <span className="wh-inv-price-input-wrap__prefix">Rs</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="wh-inv-price-input"
                            value={row.cost_price}
                            onChange={(e) => updateVariantRow(row.combo_key, "cost_price", e.target.value)}
                            aria-label={`Cost for ${row.variant_name}`}
                          />
                        </div>
                      </td>
                      <td className="wh-inv-variants-table__price" onClick={(e) => e.stopPropagation()}>
                        <div className="wh-inv-price-input-wrap">
                          <span className="wh-inv-price-input-wrap__prefix">Rs</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="wh-inv-price-input"
                            value={row.selling_price}
                            onChange={(e) => updateVariantRow(row.combo_key, "selling_price", e.target.value)}
                            aria-label={`Price for ${row.variant_name}`}
                          />
                        </div>
                      </td>
                      {showStockColumn && (
                        <td className="wh-inv-variants-table__stock" onClick={(e) => e.stopPropagation()}>
                          {isEdit ? (
                            <span className="wh-inv-stock-cell__btn wh-inv-stock-cell__btn--readonly">
                              {available}
                            </span>
                          ) : (
                            <div className="wh-inv-stock-cell">
                              <button
                                type="button"
                                className="wh-inv-stock-cell__btn"
                                onClick={() => setStockPopoverKey(
                                  stockPopoverKey === row.combo_key ? null : row.combo_key
                                )}
                              >
                                {available}
                              </button>
                              {stockPopoverKey === row.combo_key && (
                                <StockPopover
                                  row={row}
                                  locationId={selectedLocation}
                                  warehouseOptions={warehouseOptions}
                                  isEdit={isEdit}
                                  onClose={() => setStockPopoverKey(null)}
                                  onApply={applyStock}
                                />
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {showStockColumn && (
          <p className="wh-inv-variants-footer">
            Total inventory {selectedLocation ? "at" : "across"} {locationLabel}:{" "}
            <strong>{totalAvailable} available</strong>
          </p>
        )}
      </div>

      <VariantDetailModal
        open={Boolean(modalRowKey)}
        row={modalRow}
        onClose={() => setModalRowKey(null)}
        onSave={saveVariantFromModal}
        statusOptions={statusOptions}
        isEdit={isEdit}
        warehouseOptions={warehouseOptions}
        showWarehouseStock={showWarehouseStock}
      />
    </div>
  );
}
