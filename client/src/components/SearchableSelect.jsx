import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useComboboxKeyboard } from "../hooks/useComboboxKeyboard";

export function SearchableSelect({
  id: idProp,
  label,
  value,
  onChange,
  options = [],
  placeholder = "",
  loading = false,
  disabled = false,
  emptyMessage = "No matches",
  allowEmpty = false,
  emptyOptionLabel = "No one",
  error,
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const listboxId = `${id}-listbox`;
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const listOptions = useMemo(() => {
    if (!allowEmpty) return options;
    return [{ value: "", label: emptyOptionLabel }, ...options.filter((o) => o.value !== "")];
  }, [allowEmpty, emptyOptionLabel, options]);

  const selected = useMemo(
    () => (value === "" || value == null ? null : listOptions.find((o) => String(o.value) === String(value)) || null),
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

  const onSelectIndex = useCallback(
    (index) => {
      const option = filtered[index];
      if (option) pick(option);
    },
    [filtered, pick],
  );

  const { highlightIndex, setHighlightIndex, onInputKeyDown } = useComboboxKeyboard({
    open,
    setOpen,
    itemCount: filtered.length,
    onSelectIndex,
  });

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-option-index="${highlightIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  return (
    <div className={`wh-field wh-search-select${error ? " wh-field--error" : ""}`} ref={rootRef}>
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
          aria-invalid={Boolean(error)}
          className="wh-field__input wh-search-select__input"
          value={loading ? "Loading…" : displayValue}
          placeholder={loading ? "Loading…" : placeholder}
          disabled={disabled || loading}
          autoComplete="off"
          onFocus={() => {
            if (!disabled && !loading) {
              setOpen(true);
              // Clear so the user can type a search immediately; value restores if they leave without picking.
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
          {filtered.length === 0 ? (
            <li className="wh-search-select__empty">{emptyMessage}</li>
          ) : (
            filtered.slice(0, 120).map((option, index) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  data-option-index={index}
                  aria-selected={String(option.value) === String(value)}
                  className={`wh-search-select__option${String(option.value) === String(value) ? " selected" : ""}${highlightIndex === index ? " highlighted" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => pick(option)}
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {error ? <span className="wh-field__error">{error}</span> : null}
    </div>
  );
}
