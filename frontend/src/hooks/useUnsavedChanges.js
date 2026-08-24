import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function useUnsavedChanges(dirty) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pendingActionRef = useRef(null);

  useEffect(() => {
    if (!dirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const handleDocumentClick = (event) => {
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
  }, [dirty, navigate]);

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
    setOpen(false);
  }, []);

  const leave = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setOpen(false);
    action?.();
  }, []);

  return { open, requestLeave, stay, leave };
}
