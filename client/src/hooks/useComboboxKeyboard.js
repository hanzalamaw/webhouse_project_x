import { useCallback, useEffect, useState } from "react";

/**
 * Keyboard navigation for combobox-style selects (Tab passes through, arrows move highlight).
 */
export function useComboboxKeyboard({ open, setOpen, itemCount, onSelectIndex }) {
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    if (open) setHighlightIndex(0);
  }, [open, itemCount]);

  const onInputKeyDown = useCallback(
    (e) => {
      if (e.key === "Tab") {
        setOpen(false);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (!open || itemCount <= 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, itemCount - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        setHighlightIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setHighlightIndex(itemCount - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onSelectIndex(highlightIndex);
      }
    },
    [open, setOpen, itemCount, highlightIndex, onSelectIndex],
  );

  return { highlightIndex, setHighlightIndex, onInputKeyDown };
}
