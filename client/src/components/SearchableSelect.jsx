import { useEffect, useId, useMemo, useRef, useState } from "react";

export function SearchableSelect({
  id: idProp,
  label,
  value,
  onChange,
  options = [],
  placeholder = "Search…",
  loading = false,
  disabled = false,
  emptyMessage = "No matches",
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        (o.label && o.label.toLowerCase().includes(q))
    );
  }, [options, query]);

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

  const displayValue = open ? query : selected?.label || value || "";

  const pick = (option) => {
    onChange(option.value);
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
              setQuery(selected?.label || value || "");
            }
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && filtered[0]) {
              e.preventDefault();
              pick(filtered[0]);
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
              setQuery(selected?.label || value || "");
              inputRef.current?.focus();
            }
          }}
        >
          ▾
        </button>
      </div>
      {open && !loading && (
        <ul className="wh-search-select__list" role="listbox">
          {filtered.length === 0 ? (
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
