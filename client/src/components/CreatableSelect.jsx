import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useComboboxKeyboard } from "../hooks/useComboboxKeyboard";

/**
 * Searchable dropdown that allows picking existing options or adding a new custom value.
 */
export function CreatableSelect({
  id: idProp,
  label,
  value,
  onChange,
  options = [],
  onAddOption,
  placeholder = "",
  loading = false,
  disabled = false,
  emptyMessage = "No matches",
  createLabel = (q) => `Add "${q}"`,
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const listboxId = `${id}-listbox`;
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const listOptions = useMemo(() => options, [options]);

  const selected = useMemo(
    () => (value === "" || value == null ? null : listOptions.find((o) => o.value === value) || { value, label: value }),
    [listOptions, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listOptions;
    return listOptions.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        (o.label && o.label.toLowerCase().includes(q)),
    );
  }, [listOptions, query]);

  const trimmedQuery = query.trim();
  const canCreate =
    trimmedQuery &&
    !listOptions.some((o) => o.value.toLowerCase() === trimmedQuery.toLowerCase());

  const menuItems = useMemo(() => {
    const items = [];
    if (canCreate) items.push({ type: "create" });
    filtered.forEach((option) => items.push({ type: "pick", option }));
    return items;
  }, [canCreate, filtered]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const displayValue = open ? query : (selected?.label || "");

  const pick = useCallback(
    (option) => {
      onChange(option.value);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const createOption = useCallback(() => {
    if (!canCreate || disabled) return;
    const newValue = trimmedQuery;
    onAddOption?.(newValue);
    onChange(newValue);
    setOpen(false);
    setQuery("");
  }, [canCreate, disabled, trimmedQuery, onAddOption, onChange]);

  const onSelectIndex = useCallback(
    (index) => {
      const item = menuItems[index];
      if (!item) return;
      if (item.type === "create") createOption();
      else pick(item.option);
    },
    [menuItems, createOption, pick],
  );

  const { highlightIndex, setHighlightIndex, onInputKeyDown } = useComboboxKeyboard({
    open,
    setOpen,
    itemCount: menuItems.length,
    onSelectIndex,
  });

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-option-index="${highlightIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  return (
    <div className="wh-field wh-search-select" ref={rootRef}>
      {label && (
        <label className="wh-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className={`wh-search-select__control${open ? " open" : ""}${disabled ? " disabled" : ""}`}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className="wh-field__input wh-search-select__input"
          value={loading ? "Loading…" : displayValue}
          placeholder={loading ? "Loading…" : placeholder}
          disabled={disabled || loading}
          autoComplete="off"
          onFocus={() => {
            if (!disabled && !loading) {
              setOpen(true);
              setQuery("");
            }
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
        />
        <button
          type="button"
          className="wh-search-select__toggle"
          tabIndex={-1}
          disabled={disabled || loading}
          aria-label={open ? "Close list" : "Open list"}
          onClick={() => {
            if (disabled || loading) return;
            setOpen((v) => !v);
            if (!open) {
              setQuery("");
              inputRef.current?.focus();
            }
          }}
        >
          ▾
        </button>
      </div>
      {open && !loading && (
        <ul ref={listRef} id={listboxId} className="wh-search-select__list" role="listbox">
          {menuItems.length === 0 ? (
            <li className="wh-search-select__empty">{emptyMessage}</li>
          ) : (
            menuItems.map((item, index) => (
              <li key={item.type === "create" ? "__create__" : item.option.value}>
                <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  data-option-index={index}
                  aria-selected={item.type === "pick" && item.option.value === value}
                  className={`wh-search-select__option${item.type === "create" ? " wh-search-select__option--create" : ""}${item.type === "pick" && item.option.value === value ? " selected" : ""}${highlightIndex === index ? " highlighted" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => (item.type === "create" ? createOption() : pick(item.option))}
                >
                  {item.type === "create" ? createLabel(trimmedQuery) : item.option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
