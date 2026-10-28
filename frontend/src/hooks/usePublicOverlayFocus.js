import { useLayoutEffect, useRef } from "react";

/** Supplement the installed IDDS overlay's keyboard behavior without replacing it. */
export default function usePublicOverlayFocus(open, selector, onClose, restoreFocusRef) {
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    if (!open) return undefined;
    const trigger = restoreFocusRef?.current || document.activeElement;
    const originalLocation = window.location.href;
    const overlay = () => document.querySelector(selector);
    const focusable = () => [...(overlay()?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]') || [])].filter(node => node.getClientRects().length);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const onKey = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0], last = nodes.at(-1);
      if (!overlay()?.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); event.stopImmediatePropagation(); (event.shiftKey ? last : first)?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey, true);
      requestAnimationFrame(() => {
        if (trigger?.isConnected && window.location.href === originalLocation) trigger.focus({ preventScroll: true });
      });
    };
  }, [open, selector, restoreFocusRef]);
}
