import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NavigationProtectionContext } from "../contexts/NavigationProtectionContext";

export default function useUnsavedChanges(dirty) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pendingActionRef = useRef(null);
  const resetRef = useRef(null);
  const register = useContext(NavigationProtectionContext);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const bypass = useRef(false);
  useEffect(() => { bypass.current = false; }, [dirty]);
  useEffect(() => register?.(pendingActionRef, {
    dirty: () => dirtyRef.current && !bypass.current,
    discard: () => { bypass.current = true; },
    prompt: (action, reset) => { pendingActionRef.current = action; resetRef.current = reset; setOpen(true); },
  }), [register]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handleBeforeUnload = (event) => {
      if (bypass.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const handleDocumentClick = (event) => {
      if (register) return;
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin || target.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      pendingActionRef.current = () => navigate(`${target.pathname}${target.search}${target.hash}`);
      setOpen(true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [dirty, navigate, register]);

  const requestLeave = useCallback((action) => {
    if (!dirty) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setOpen(true);
  }, [dirty]);

  const stay = useCallback(() => {
    pendingActionRef.current = null;
    resetRef.current?.();
    resetRef.current = null;
    setOpen(false);
  }, []);

  const leave = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    resetRef.current = null;
    bypass.current = true;
    setOpen(false);
    action?.();
  }, []);

  const markSaved = useCallback(() => { bypass.current = true; }, []);
  return { open, requestLeave, stay, leave, markSaved };
}
