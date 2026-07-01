import { useEffect, useState, useCallback } from "react";
import { useBlocker, useNavigate } from "react-router-dom";

/**
 * Blocks navigation/reload when the form has unsaved changes.
 * @param {boolean} isDirty - true once the user has changed something from the initial state
 * @param {{ enabled?: boolean, mode?: 'create' | 'edit' }} options
 *   - enabled: when false, never guard (e.g. while loading initial data on edit)
 *   - mode: kept for callers; create and edit both guard only when isDirty
 */
export function useUnsavedChangesGuard(isDirty, { enabled = true, mode: _mode = "edit" } = {}) {
  const navigate = useNavigate();
  const [bypass, setBypass] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const [pendingOpts, setPendingOpts] = useState(undefined);

  const effectiveDirty = bypass ? false : isDirty;
  const effectiveEnabled = bypass ? false : enabled;
  const active = effectiveEnabled && Boolean(effectiveDirty);
  const blocker = useBlocker(active);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);

  useEffect(() => {
    if (!pendingNav) return undefined;
    navigate(pendingNav, pendingOpts);
    setPendingNav(null);
    setPendingOpts(undefined);
    return undefined;
  }, [pendingNav, pendingOpts, navigate]);

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

  useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
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

  /** Navigate after save — bypasses the guard on the next render so the blocker does not fire. */
  const navigateSafely = useCallback((to, options) => {
    setBypass(true);
    setPendingNav(to);
    setPendingOpts(options);
  }, []);

  return { dialogOpen, stayOnPage, leavePage, reloadPending, navigateSafely };
}
