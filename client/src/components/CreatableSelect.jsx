import { useEffect, useId, useMemo, useRef, useState } from "react";

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
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const listOptions = useMemo(() => options, [options]);

  const selected = useMemo(
    () => (value === "" || value == null ? null : listOptions.find((o) => o.value === value) || { value, label: value }),
    [listOptions, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listOptions;
    return listOptions.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        (o.label && o.label.toLowerCase().includes(q))
    );
  }, [listOptions, query]);

  const trimmedQuery = query.trim();
  const canCreate =
    trimmedQuery &&
    !listOptions.some((o) => o.value.toLowerCase() === trimmedQuery.toLowerCase());

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

  const pick = (option) => {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  };

  const createOption = () => {
    if (!canCreate || disabled) return;
    const newValue = trimmedQuery;
    onAddOption?.(newValue);
    onChange(newValue);
    setOpen(false);
    setQuery("");
  };

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
          className="wh-field__input wh-search-select__input"
          value={loading ? "Loading…" : displayValue}
          placeholder={loading ? "Loading…" : placeholder}
          disabled={disabled || loading}
          autoComplete="off"
          onFocus={() => {
            if (!disabled && !loading) {
              setOpen(true);
              setQuery(selected?.label || "");
            }
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              if (canCreate) createOption();
              else if (filtered[0]) pick(filtered[0]);
            }
          }}
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
              setQuery(selected?.label || "");
              inputRef.current?.focus();
            }
          }}
        >
          ▾
        </button>
      </div>
      {open && !loading && (
        <ul className="wh-search-select__list" role="listbox">
          {canCreate && (
            <li>
              <button
                type="button"
                role="option"
                className="wh-search-select__option wh-search-select__option--create"
                onMouseDown={(e) => e.preventDefault()}
                onClick={createOption}
              >
                {createLabel(trimmedQuery)}
              </button>
            </li>
          )}
          {filtered.length === 0 && !canCreate ? (
            <li className="wh-search-select__empty">{emptyMessage}</li>
          ) : (
            filtered.slice(0, 120).map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  className={`wh-search-select__option${option.value === value ? " selected" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(option)}
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
