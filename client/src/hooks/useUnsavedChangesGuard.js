import { useEffect, useState, useCallback } from "react";
import { useBlocker } from "react-router-dom";

export function useUnsavedChangesGuard(isDirty, { enabled = true } = {}) {
  const active = enabled && Boolean(isDirty);
  const blocker = useBlocker(active);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setReloadPending(false);
      setDialogOpen(true);
    }
  }, [blocker.state]);

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e) => {
      const isReloadKey = e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r");
      if (!isReloadKey) return;
      e.preventDefault();
      setReloadPending(true);
      setDialogOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  const stayOnPage = useCallback(() => {
    if (blocker.state === "blocked") blocker.reset();
    setReloadPending(false);
    setDialogOpen(false);
  }, [blocker]);

  const leavePage = useCallback(() => {
    if (reloadPending) {
      setReloadPending(false);
      setDialogOpen(false);
      window.location.reload();
      return;
    }
    if (blocker.state === "blocked") blocker.proceed();
    setDialogOpen(false);
  }, [blocker, reloadPending]);

  return { dialogOpen, stayOnPage, leavePage, reloadPending };
}